import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../Dashboard.tsx', import.meta.url), 'utf8');

describe('Dashboard toolbar', () => {
  it('does not add a second Help action beside the environment selector', () => {
    const toolbar = source.match(/<ActionToolbar\b[\s\S]*?\/>/)?.[0];

    expect(toolbar).toBeDefined();
    expect(toolbar).not.toContain('onHelp=');
  });

  it('keeps the ZIP guidance for Copilot Studio and M365 in the page header', () => {
    expect(source).toContain('aria-label="Help"');
    expect(source).toContain('authoring-solutions-import-export#export-the-solution-with-your-agent');
    expect(source).toContain('agent-builder-share-manage-agents#deploy-an-agent-via-zip-package');
  });
});
