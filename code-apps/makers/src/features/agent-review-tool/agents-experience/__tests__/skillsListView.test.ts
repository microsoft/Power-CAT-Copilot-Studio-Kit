import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { describe, expect, it, vi } from 'vitest';
import { SkillsListView } from '../components/skills/SkillsListView';
import type { SkillView } from '../components/viewTypes';

const skill: SkillView = {
  id: 'display-audit',
  schemaName: 'display.audit',
  name: 'display-audit',
  description: 'Audits a display.',
  source: 'Bundled',
  safetyFlagged: false,
  sizeLabel: '1 KB',
  dimensions: [{ key: 'Clarity', score: 8, rationale: 'Clear.' }],
  evaluationState: 'evaluated',
  markdown: '',
};

describe('SkillsListView', () => {
  it('uses persistent Rubric and Files tabs instead of a footer file toggle', () => {
    const html = renderToStaticMarkup(
      createElement(
        FluentProvider,
        { theme: webLightTheme },
        createElement(SkillsListView, {
          skills: [skill],
          onOpenFinding: vi.fn(),
          defaultOpenSkillIds: [skill.id],
        }),
      ),
    );

    expect(html).toContain('>Rubric<');
    expect(html).toContain('>Files<');
    expect(html).not.toContain('>View files<');
    expect(html).not.toContain('>Hide files<');
  });
});
