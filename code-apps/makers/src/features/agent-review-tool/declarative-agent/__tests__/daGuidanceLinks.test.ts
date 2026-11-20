import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Accordion, SSRProvider } from '@fluentui/react-components';
import { describe, expect, it } from 'vitest';
import { DAEvaluationSection } from '../components/DAEvaluationSection';
import type { CriterionResult, EvaluationIssue } from '../contracts/DAEvaluationResult';
import { ISSUE_LEARN_URLS, PACKAGE_GUIDANCE_DOCS } from '../contracts/learnDocs';
import {
  distinctGuidanceLinks,
  distinctPassingChecks,
  guidanceLinkLabel,
  guidancePageOf,
  issueGuidanceLink,
} from '../utils/guidanceLinks';
import { runDAPackageValidation } from '../utils/packageValidation';
import { parseDAZip } from '../utils/zipParser';
import { makeDAPackage, type DAPackageOptions } from './daPackageFixture';

const MANIFEST_DOC = PACKAGE_GUIDANCE_DOCS.declarativeAgentManifest;
const PLUGIN_DOC = PACKAGE_GUIDANCE_DOCS.apiPluginManifest;

const sourceOf = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');

function issue(overrides: Partial<EvaluationIssue>): EvaluationIssue {
  return {
    severity: 'Medium',
    description: 'Synthetic issue',
    recommendation: 'Fix the synthetic issue.',
    ...overrides,
  };
}

function renderSection(result: CriterionResult): string {
  return renderToStaticMarkup(
    createElement(
      SSRProvider,
      null,
      createElement(
        Accordion,
        { defaultOpenItems: ['manifestHealth'], multiple: true, collapsible: true },
        createElement(DAEvaluationSection, {
          value: 'manifestHealth',
          criterionName: 'Package validity',
          criterionKey: 'manifestHealth',
          result,
          showScore: false,
        }),
      ),
    ),
  );
}

function hrefsAfter(html: string, marker: string): string[] {
  const start = html.indexOf(marker);
  expect(start, `${marker} should render`).toBeGreaterThanOrEqual(0);
  return [...html.slice(start).matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
}

async function packageGuidanceUrls(options: DAPackageOptions): Promise<string[]> {
  const parsed = await parseDAZip(await makeDAPackage(options));
  const validation = runDAPackageValidation(
    parsed.manifest,
    parsed.packageEvidence,
    parsed.skillBundles,
  );
  return validation.findings
    .map((finding) => finding.guidanceUrl)
    .filter((url): url is string => Boolean(url));
}

describe('declarative agent guidance links', () => {
  it('labels each package guidance page with its known title', () => {
    for (const doc of Object.values(PACKAGE_GUIDANCE_DOCS)) {
      expect(guidanceLinkLabel(doc.url)).toBe(doc.label);
    }
  });

  it('labels a section of a known page with the title of the page', () => {
    expect(guidanceLinkLabel(`${PLUGIN_DOC.url}#runtime-object`)).toBe(PLUGIN_DOC.label);
    expect(guidancePageOf(`${PLUGIN_DOC.url}#runtime-object`)).toBe(PLUGIN_DOC.url);
  });

  it('makes a readable label for an unknown page and a safe label for a bad address', () => {
    expect(guidanceLinkLabel(
      'https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/synthetic-topic-name',
    )).toBe('Synthetic topic name');
    expect(guidanceLinkLabel('not a web address')).toBe('Microsoft guidance');
  });

  it('keeps one link for each page and drops addresses that are not web pages', () => {
    const links = distinctGuidanceLinks([
      { url: `${MANIFEST_DOC.url}#:~:text=name` },
      { url: MANIFEST_DOC.url, label: 'A second label for the same page' },
      { url: 'javascript:alert(1)' },
      { url: '   ' },
      { url: '/relative/guidance' },
      undefined,
      { url: PLUGIN_DOC.url, label: '  Custom plugin label  ' },
    ]);

    expect(links).toEqual([
      { url: `${MANIFEST_DOC.url}#:~:text=name`, label: guidanceLinkLabel(`${MANIFEST_DOC.url}#:~:text=name`) },
      { url: PLUGIN_DOC.url, label: 'Custom plugin label' },
    ]);
  });

  it('shows each passed check one time', () => {
    const checks = distinctPassingChecks([
      { description: 'Name is set.' },
      { description: '  name   IS set. ' },
      { description: '' },
      { description: 'Description is set.' },
    ]);

    expect(checks.map((check) => check.description)).toEqual(['Name is set.', 'Description is set.']);
  });

  it('uses the mapped issue link first, then the rule link, then the health-check link', () => {
    const mapped = ISSUE_LEARN_URLS['instructions-empty'];
    expect(issueGuidanceLink({
      ...issue({ issueKey: 'instructions-empty', guidanceUrl: PLUGIN_DOC.url }),
      learnUrl: MANIFEST_DOC.url,
    })).toEqual(mapped);
    expect(issueGuidanceLink(issue({ guidanceUrl: PLUGIN_DOC.url }))).toEqual(PLUGIN_DOC);
    expect(issueGuidanceLink({
      ...issue({}),
      learnUrl: 'https://learn.microsoft.com/en-us/synthetic/health-check',
      learnLabel: 'Synthetic health check',
    })).toEqual({
      url: 'https://learn.microsoft.com/en-us/synthetic/health-check',
      label: 'Synthetic health check',
    });
    expect(issueGuidanceLink(issue({ guidanceUrl: 'javascript:alert(1)' }))).toBeUndefined();
  });

  it('gives every package rule a guidance page with a known title', async () => {
    const known = new Set<string>(Object.values(PACKAGE_GUIDANCE_DOCS).map((doc) => doc.url));
    const urls = [
      ...await packageGuidanceUrls({
        agent: {
          version: 'v1.6',
          name: 'n'.repeat(103),
          actions: [
            { id: 'missing-plugin', file: 'plugins/missing.json' },
            { id: 'http-plugin', file: 'plugins/http.json' },
          ],
          worker_agents: [{ id: 'worker-1', file: 'workers/worker.json' }],
        },
        files: {
          'plugins/http.json': JSON.stringify({
            schema_version: 'v2.3',
            runtimes: [{ type: 'RemoteMCPServer', spec: { url: 'http://example.invalid/mcp' } }],
          }),
          'workers/worker.json': JSON.stringify({ id: 'worker-1' }),
        },
      }),
      ...await packageGuidanceUrls({
        app: { agentSkills: [{ folder: 'skills/missing-skill' }] },
        agent: { version: 'v1.9', agent_skills: [{ folder: 'skills/missing-skill' }] },
      }),
    ];

    expect(urls.length).toBeGreaterThan(0);
    expect(new Set(urls)).toContain(PACKAGE_GUIDANCE_DOCS.agentSkills.url);
    for (const url of urls) {
      expect(known, url).toContain(url);
    }
  });
});

describe('declarative agent criterion panel', () => {
  const result: CriterionResult = {
    status: 'Fail',
    issues: [
      issue({
        severity: 'Low',
        description: 'Low severity synthetic issue',
        guidanceUrl: `${MANIFEST_DOC.url}#:~:text=description`,
      }),
      issue({
        severity: 'High',
        description: 'High severity synthetic issue',
        method: 'deterministic',
        recommendation: 'Shorten $.name in declarativeAgent.json. '
          + 'Example: Change "Zava field service planning assistant" to "Zava field planner". '
          + 'How to verify: Confirm that $.name has 100 characters or fewer.',
        guidanceUrl: MANIFEST_DOC.url,
        sourceFile: 'declarativeAgent.json',
        jsonPath: '$.name',
        evidence: 'Synthetic evidence that stays collapsed',
      }),
      issue({
        severity: 'Medium',
        description: 'Medium severity synthetic issue',
        guidanceUrl: PLUGIN_DOC.url,
      }),
    ],
    passingChecks: [
      { description: 'Synthetic check passed.', learnUrl: MANIFEST_DOC.url },
      { description: 'Synthetic check passed.', learnUrl: MANIFEST_DOC.url },
      { description: 'Another synthetic check passed.', learnUrl: PLUGIN_DOC.url },
    ],
  };

  it('puts the highest severity first and shows the action, the example, and the verification', () => {
    const html = renderSection(result);
    const high = html.indexOf('High severity synthetic issue');
    const medium = html.indexOf('Medium severity synthetic issue');
    const low = html.indexOf('Low severity synthetic issue');

    expect(high).toBeGreaterThanOrEqual(0);
    expect(high).toBeLessThan(medium);
    expect(medium).toBeLessThan(low);
    expect(html).toContain('Example for this agent');
    expect(html).toContain('Change &quot;Zava field service planning assistant&quot; to &quot;Zava field planner&quot;.');
    expect(html).toContain('How to verify');
    expect(html).toContain('Rule-based check');
    expect(html).toContain('High severity');
  });

  it('keeps the review details and the passed checks collapsed', () => {
    const html = renderSection(result);

    expect(html).toContain('Evidence and location');
    expect(html).not.toContain('Synthetic evidence that stays collapsed');
    expect(html).toContain('Passed checks (2)');
    expect(html).not.toContain('Another synthetic check passed.');
  });

  it('shows each guidance page one time, with no repeated Learn more links', () => {
    const html = renderSection(result);
    const footerLinks = hrefsAfter(html, 'Microsoft guidance');
    const pages = footerLinks.map(guidancePageOf);

    expect(html).not.toMatch(/learn more/i);
    expect(new Set(pages).size).toBe(pages.length);
    expect(pages).toEqual(expect.arrayContaining([MANIFEST_DOC.url, PLUGIN_DOC.url]));
    expect(html).toContain(`aria-label="${MANIFEST_DOC.label}, opens in a new tab"`);
  });

  it('opens a short passed-check list when nothing needs action', () => {
    const html = renderSection({
      status: 'Pass',
      issues: [],
      passingChecks: [{ description: 'Only synthetic check passed.' }],
    });

    expect(html).toContain('Passed checks (1)');
    expect(html).toContain('Only synthetic check passed.');
  });

  it('shows no passed checks for a criterion that was not assessed', () => {
    const html = renderSection({
      status: 'Not assessed',
      issues: [],
      passingChecks: [{ description: 'Synthetic check that must not show.' }],
      assessmentNotes: [{ status: 'Not assessed', description: 'Synthetic note.' }],
    });

    expect(html).toContain('Synthetic note.');
    expect(html).not.toContain('Passed checks');
    expect(html).not.toContain('Synthetic check that must not show.');
  });

  it('uses Fluent typography and headings instead of fixed font sizes', () => {
    const sources = [
      sourceOf('../components/DAEvaluationSection.tsx'),
      sourceOf('../components/DAEvaluationRows.tsx'),
    ];

    for (const source of sources) {
      expect(source).not.toMatch(/fontSize:\s*['"]\d+px['"]/);
      expect(source).not.toMatch(/learn more/i);
    }
    expect(sources[0]).toContain('<AccordionHeader as="h3">');
    expect(sources[1]).toContain('<ActionGuidance');
    expect(sources[1]).toContain('splitRecommendation(');
  });
});
