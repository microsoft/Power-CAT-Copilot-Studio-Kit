import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { runDAPackageValidation } from '../utils/packageValidation';
import { parseDAZip } from '../utils/zipParser';

interface CustomSkillPackageOptions {
  appSkills?: Array<{ folder: string }>;
  agentSkills?: Array<{ folder: string }>;
  app?: Record<string, unknown>;
  agent?: Record<string, unknown>;
  files?: Record<string, string>;
}

async function makeCustomSkillPackage(
  options: CustomSkillPackageOptions = {},
): Promise<File> {
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify({
    id: '11111111-1111-1111-1111-111111111111',
    version: '1.0.0',
    manifestVersion: '1.17',
    name: { short: 'Synthetic skills', full: 'Synthetic skills' },
    description: {
      short: 'Synthetic custom-skill package.',
      full: 'Synthetic custom-skill package for automated tests.',
    },
    developer: { name: 'Contoso' },
    accentColor: '#FFFFFF',
    copilotAgents: {
      declarativeAgents: [{
        id: 'synthetic-agent',
        file: 'declarativeAgent.json',
      }],
    },
    agentSkills: options.appSkills ?? [],
    ...options.app,
  }));
  zip.file('declarativeAgent.json', JSON.stringify({
    $schema: 'https://developer.microsoft.com/json-schemas/copilot/declarative-agent/v1.9/schema.json',
    version: 'v1.9',
    id: 'synthetic-agent',
    name: 'Synthetic agent',
    description: 'Uses synthetic custom skills.',
    instructions: 'Use the best matching custom skill and explain the result.',
    conversation_starters: [],
    actions: [],
    agent_skills: options.agentSkills ?? [],
    ...options.agent,
  }));
  for (const [path, content] of Object.entries(options.files ?? {})) {
    zip.file(path, content);
  }
  return await zip.generateAsync({ type: 'uint8array' }) as unknown as File;
}

const WEATHER_SKILL = `---
name: weather-summary
description: Use this skill when the user asks for a synthetic weather summary.
---

1. Read the supplied weather data.
2. Return a concise summary and cite the source file.
`;

describe('declarative-agent custom-skill package parsing', () => {
  it('resolves matching registrations and builds transient skill bundles', async () => {
    const parsed = await parseDAZip(await makeCustomSkillPackage({
      appSkills: [{ folder: './skills/weather-summary' }],
      agentSkills: [{ folder: 'skills/weather-summary' }],
      files: {
        'skills/weather-summary/SKILL.md': WEATHER_SKILL,
        'skills/weather-summary/references/weather.json': '{"condition":"sunny"}',
        'skills/weather-summary/scripts/summarize.py': 'print("sunny")',
      },
    }));

    expect(parsed.manifest.customSkills).toEqual({
      appFolders: ['skills/weather-summary'],
      agentFolders: ['skills/weather-summary'],
    });
    expect(parsed.skillBundles).toHaveLength(1);
    expect(parsed.skillBundles[0]).toMatchObject({
      skillName: 'weather-summary',
      skillSchemaName: 'weather-summary',
      source: 'zip-bundle',
      agentInstructions: 'Use the best matching custom skill and explain the result.',
    });
    expect(parsed.skillBundles[0].resources.map((resource) => resource.normalizedPath))
      .toEqual([
        'references/weather.json',
        'scripts/summarize.py',
      ]);
    expect(parsed.packageEvidence.documents).toContainEqual(expect.objectContaining({
      path: 'skills/weather-summary/SKILL.md',
      kind: 'skill-definition',
      status: 'text',
    }));
    expect(parsed.packageEvidence.documents).toContainEqual(expect.objectContaining({
      path: 'skills/weather-summary/scripts/summarize.py',
      kind: 'skill-resource',
      status: 'text',
    }));
  });

  it('records unsafe registrations without reading outside the package root', async () => {
    const parsed = await parseDAZip(await makeCustomSkillPackage({
      appSkills: [{ folder: '../private-skill' }],
      agentSkills: [{ folder: '../private-skill' }],
    }));

    expect(parsed.skillBundles).toEqual([]);
    expect(parsed.packageEvidence.references).toEqual(expect.arrayContaining([
      expect.objectContaining({
        requestedPath: '../private-skill',
        kind: 'skill-definition',
        status: 'unsafe',
      }),
    ]));
  });

  it('redacts plain-text secrets from package evidence', async () => {
    const parsed = await parseDAZip(await makeCustomSkillPackage({
      appSkills: [{ folder: 'skills/weather-summary' }],
      agentSkills: [{ folder: 'skills/weather-summary' }],
      agent: {
        instructions: [
          'Use Authorization: Bearer synthetic-bearer-token-12345.',
          'Use api_key=synthetic-unquoted-secret for the request.',
        ].join('\n'),
      },
      files: validSkillFiles(),
    }));

    const evidence = JSON.stringify(parsed.packageEvidence.records);
    expect(evidence).not.toContain('synthetic-bearer-token-12345');
    expect(evidence).not.toContain('synthetic-unquoted-secret');
    expect(evidence).toContain('[REDACTED]');
  });
});

async function validateCustomSkillPackage(options: CustomSkillPackageOptions) {
  const parsed = await parseDAZip(await makeCustomSkillPackage(options));
  return {
    parsed,
    validation: runDAPackageValidation(
      parsed.manifest,
      parsed.packageEvidence,
      parsed.skillBundles,
    ),
  };
}

function validSkillFiles(
  folder = 'skills/weather-summary',
  skillMarkdown = WEATHER_SKILL,
): Record<string, string> {
  return {
    [`${folder}/SKILL.md`]: skillMarkdown,
    [`${folder}/references/weather.json`]: '{"condition":"sunny"}',
  };
}

describe('declarative-agent custom-skill package validation', () => {
  const registrationFor = (validation: Awaited<ReturnType<typeof validateCustomSkillPackage>>['validation']) =>
    validation.findings.find((finding) => finding.ruleId === 'DA-SKILL-REGISTRATION');

  const otherSkillFiles = () => validSkillFiles('skills/other-skill', WEATHER_SKILL.replaceAll(
    'weather-summary',
    'other-skill',
  ));

  it('requires v1.9 for agent_skills and warns about a skill that only manifest.json lists', async () => {
    const { validation } = await validateCustomSkillPackage({
      appSkills: [{ folder: 'skills/weather-summary' }],
      agentSkills: [{ folder: 'skills/other-skill' }],
      agent: { version: 'v1.8' },
      files: { ...validSkillFiles(), ...otherSkillFiles() },
    });

    expect(validation.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ruleId: 'DA-SKILL-VERSION',
        status: 'Fail',
      }),
    ]));
    expect(registrationFor(validation)).toMatchObject({
      status: 'Warning',
      severity: 'Medium',
      sourceFile: 'declarativeAgent.json',
      jsonPath: '$.agent_skills',
      evidence: 'Only in manifest.json agentSkills: skills/weather-summary',
    });
    expect(registrationFor(validation)?.recommendation)
      .toContain('add each folder to agent_skills in declarativeAgent.json: skills/weather-summary');
  });

  it('accepts skills that only agent_skills registers, as the Agents Toolkit writes them', async () => {
    const { validation } = await validateCustomSkillPackage({
      agentSkills: [{ folder: 'skills/weather-summary' }, { folder: 'skills/other-skill' }],
      files: { ...validSkillFiles(), ...otherSkillFiles() },
    });

    expect(registrationFor(validation)).toMatchObject({
      status: 'Pass',
      severity: undefined,
      recommendation: '',
      sourceFile: 'declarativeAgent.json',
      jsonPath: '$.agent_skills',
    });
    expect(registrationFor(validation)?.explanation).toContain('manifest.json agentSkills is optional');
    expect(validation.findings.filter((finding) => finding.status === 'Fail')).toEqual([]);
  });

  it('accepts manifest.json agentSkills that exposes some or all agent skills', async () => {
    const some = await validateCustomSkillPackage({
      appSkills: [{ folder: './skills/other-skill' }],
      agentSkills: [{ folder: 'skills/weather-summary' }, { folder: 'skills/other-skill' }],
      files: { ...validSkillFiles(), ...otherSkillFiles() },
    });
    const all = await validateCustomSkillPackage({
      appSkills: [{ folder: 'skills/Weather-Summary/' }],
      agentSkills: [{ folder: 'skills/weather-summary' }],
      files: validSkillFiles(),
    });

    expect(registrationFor(some.validation)).toMatchObject({ status: 'Pass', recommendation: '' });
    expect(registrationFor(some.validation)?.explanation)
      .toContain('manifest.json agentSkills also exposes 1 of them to other Copilot surfaces');
    expect(registrationFor(all.validation)).toMatchObject({ status: 'Pass', recommendation: '' });
  });

  it('warns when only manifest.json registers the skills', async () => {
    const { validation } = await validateCustomSkillPackage({
      appSkills: [{ folder: 'skills/weather-summary' }],
      files: validSkillFiles(),
    });

    expect(registrationFor(validation)).toMatchObject({
      status: 'Warning',
      severity: 'Medium',
      evidence: 'Only in manifest.json agentSkills: skills/weather-summary',
    });
    expect(validation.status).not.toBe('valid');
  });

  it('does not assess registration when no custom-skill folder path can be read', async () => {
    const { validation } = await validateCustomSkillPackage({
      appSkills: [{ folder: '../private-skill' }],
      agentSkills: [{ folder: '../private-skill' }],
    });

    expect(registrationFor(validation)).toMatchObject({
      status: 'Not assessed',
      severity: undefined,
      recommendation: '',
    });
    expect(registrationFor(validation)?.explanation).toContain('DA-SKILL-FOLDER');
    expect(validation.findings).toContainEqual(expect.objectContaining({
      ruleId: 'DA-SKILL-FOLDER',
      status: 'Fail',
    }));
  });

  it('fails missing folders and requires exactly one root SKILL.md', async () => {
    const missing = await validateCustomSkillPackage({
      appSkills: [{ folder: 'skills/missing' }],
      agentSkills: [{ folder: 'skills/missing' }],
    });
    const duplicate = await validateCustomSkillPackage({
      appSkills: [{ folder: 'skills/weather-summary' }],
      agentSkills: [{ folder: 'skills/weather-summary' }],
      files: {
        ...validSkillFiles(),
        'skills/weather-summary/skill.md': WEATHER_SKILL,
      },
    });

    expect(missing.validation.findings).toContainEqual(expect.objectContaining({
      ruleId: 'DA-SKILL-FOLDER',
      status: 'Fail',
    }));
    expect(duplicate.validation.findings).toContainEqual(expect.objectContaining({
      ruleId: 'DA-SKILL-ENTRY',
      status: 'Fail',
    }));
  });

  it('validates frontmatter and requires the skill name to match its folder', async () => {
    const { validation } = await validateCustomSkillPackage({
      appSkills: [{ folder: 'skills/weather-summary' }],
      agentSkills: [{ folder: 'skills/weather-summary' }],
      files: validSkillFiles('skills/weather-summary', `---
name: different-name
description:
  - invalid
---

Run the synthetic skill.
`),
    });

    expect(validation.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ruleId: 'DA-SKILL-FRONTMATTER',
        status: 'Fail',
      }),
      expect.objectContaining({
        ruleId: 'DA-SKILL-NAME',
        status: 'Fail',
      }),
    ]));
  });

  it('enforces the eight-skill and 350-file package limits', async () => {
    const registrations = Array.from({ length: 9 }, (_, index) => ({
      folder: `skills/skill-${index + 1}`,
    }));
    const files = Object.fromEntries(registrations.map(({ folder }, index) => [
      `${folder}/SKILL.md`,
      WEATHER_SKILL.replaceAll('weather-summary', `skill-${index + 1}`),
    ]));
    for (let index = 0; index < 342; index += 1) {
      files[`skills/skill-1/references/file-${index}.txt`] = 'synthetic';
    }

    const { validation } = await validateCustomSkillPackage({
      appSkills: registrations,
      agentSkills: registrations,
      files,
    });

    expect(validation.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ruleId: 'DA-SKILL-COUNT',
        status: 'Fail',
      }),
      expect.objectContaining({
        ruleId: 'DA-SKILL-FILE-COUNT',
        status: 'Fail',
      }),
    ]));
  });

  it('enforces the instruction, directory-depth, file-type, and package-size limits', async () => {
    const { parsed } = await validateCustomSkillPackage({
      appSkills: [{ folder: 'skills/weather-summary' }],
      agentSkills: [{ folder: 'skills/weather-summary' }],
      files: {
        ...validSkillFiles(
          'skills/weather-summary',
          `${WEATHER_SKILL}${'x'.repeat(20_000)}`,
        ),
        'skills/weather-summary/one/two/three/four/data.txt': 'too deep',
        'skills/weather-summary/scripts/tool.exe': 'unsupported',
      },
    });
    parsed.packageEvidence.packageSizeBytes = (10 * 1024 * 1024) + 1;
    const validation = runDAPackageValidation(
      parsed.manifest,
      parsed.packageEvidence,
      parsed.skillBundles,
    );

    expect(validation.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ruleId: 'DA-SKILL-INSTRUCTION-LENGTH',
        status: 'Fail',
        sourceFile: 'skills/weather-summary/SKILL.md',
      }),
      expect.objectContaining({
        ruleId: 'DA-SKILL-DEPTH',
        status: 'Fail',
      }),
      expect.objectContaining({
        ruleId: 'DA-SKILL-FILE-TYPE',
        status: 'Fail',
      }),
      expect.objectContaining({
        ruleId: 'DA-SKILL-PACKAGE-SIZE',
        status: 'Fail',
      }),
    ]));
  });

  it('uses the Microsoft custom-skill file support matrix', async () => {
    const { validation } = await validateCustomSkillPackage({
      appSkills: [{ folder: 'skills/weather-summary' }],
      agentSkills: [{ folder: 'skills/weather-summary' }],
      files: {
        ...validSkillFiles(),
        'skills/weather-summary/references/template.docm': 'synthetic',
        'skills/weather-summary/references/slides.ppsm': 'synthetic',
        'skills/weather-summary/references/model.xlsm': 'synthetic',
        'skills/weather-summary/references/vector.svg': 'unsupported',
        'skills/weather-summary/references/photo.tiff': 'unsupported',
        'skills/weather-summary/references/image.webp': 'unsupported',
        'skills/weather-summary/references/settings.cfg': 'unsupported',
        'skills/weather-summary/references/readme.markdown': 'unsupported',
      },
    });

    const finding = validation.findings.find(
      candidate => candidate.ruleId === 'DA-SKILL-FILE-TYPE',
    );
    expect(finding).toMatchObject({ status: 'Fail' });
    expect(finding?.evidence).toContain('vector.svg');
    expect(finding?.evidence).toContain('photo.tiff');
    expect(finding?.evidence).toContain('image.webp');
    expect(finding?.evidence).toContain('settings.cfg');
    expect(finding?.evidence).toContain('readme.markdown');
    expect(finding?.evidence).not.toContain('template.docm');
    expect(finding?.evidence).not.toContain('slides.ppsm');
    expect(finding?.evidence).not.toContain('model.xlsm');
  });

  it('rejects embedded knowledge and unsupported sandbox assumptions', async () => {
    const { validation } = await validateCustomSkillPackage({
      appSkills: [{ folder: 'skills/weather-summary' }],
      agentSkills: [{ folder: 'skills/weather-summary' }],
      agent: {
        capabilities: [{ name: 'EmbeddedKnowledge' }],
      },
      files: {
        ...validSkillFiles(),
        'skills/weather-summary/scripts/network.py': [
          'import requests',
          'import subprocess',
          'subprocess.run(["pip", "install", "contoso"])',
          'requests.get("https://example.invalid", headers={"Authorization": "Bearer TOKEN"})',
        ].join('\n'),
      },
    });

    expect(validation.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ruleId: 'DA-SKILL-KNOWLEDGE-COMPAT',
        status: 'Fail',
      }),
      expect.objectContaining({
        ruleId: 'DA-SKILL-NETWORK',
        status: 'Fail',
      }),
      expect.objectContaining({
        ruleId: 'DA-SKILL-INSTALL',
        status: 'Fail',
      }),
      expect.objectContaining({
        ruleId: 'DA-SKILL-AUTH',
        status: 'Fail',
      }),
    ]));
  });
});
