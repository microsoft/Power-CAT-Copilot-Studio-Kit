import { describe, expect, it } from 'vitest';
import type { DAManifest } from '../contracts/DAManifest';
import { runManifestHealthCheck } from '../utils/manifestHealthCheck';
import { manifestHealthToCriterionResult } from '../utils/manifestHealthToIssues';

function manifest(schemaVersion: string): DAManifest {
  return {
    appId: 'app-1',
    appVersion: '1.0.0',
    manifestVersion: '1.25',
    shortName: 'Agent',
    fullName: 'Agent',
    shortDescription: 'short',
    fullDescription: 'full',
    developerName: 'Contoso',
    accentColor: '#000000',
    iconBase64: null,
    pluginFiles: {},
    schemaVersion,
    daId: 'da-1',
    name: 'Agent',
    description: 'desc',
    instructions: 'Answer questions about workshops.',
    capabilities: [],
    actions: [],
    conversationStarters: [{ title: 'Start', text: 'Find a workshop.' }],
  };
}

describe('legacy manifest health version check', () => {
  it.each(['v1.8', 'v1.9'])('accepts the supported declarative-agent version %s', (version) => {
    expect(runManifestHealthCheck(manifest(version)).versionSupported).toEqual({
      pass: true,
      message: `Declarative-agent version ${version}.`,
    });
  });

  it('rejects other and missing declarative-agent versions', () => {
    expect(runManifestHealthCheck(manifest('v1.6')).versionSupported).toEqual({
      pass: false,
      message: 'Unsupported declarative-agent version v1.6.',
    });
    expect(runManifestHealthCheck(manifest('')).versionSupported).toEqual({
      pass: false,
      message: 'Declarative-agent version is missing.',
    });
  });

  it('tells the maker that v1.9 is for packages with custom skills', () => {
    const result = manifestHealthToCriterionResult(runManifestHealthCheck(manifest('v1.6')));

    expect(result.issues).toContainEqual(expect.objectContaining({
      severity: 'High',
      description: 'Unsupported declarative-agent version v1.6.',
      recommendation: 'Set the required declarative-agent version property to v1.8, or v1.9 for a package with custom skills.',
    }));
  });
});
