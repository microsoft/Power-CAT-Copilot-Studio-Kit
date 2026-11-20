import { createElement, type ComponentProps, type ComponentType } from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { describe, expect, it } from 'vitest';
import { PatternFindingDetails, ReviewEvidenceDetails } from '../../components/dialogs/PatternDetailsDialog';
import { ComplianceFindingDetails } from '../../components/dialogs/ComplianceDetailsDialog';
import { CSAgentDetailsDrawer } from '../../components/dialogs/CSAgentDetailsDrawer';
import { PatternsDataGrid } from '../../components/grids/PatternsDataGrid';
import { ComplianceDataGrid } from '../../components/grids/ComplianceDataGrid';
import { transformComplianceForDisplay, transformPatternsForDisplay } from '../transformUtils';
import type { Pattern } from '../../contracts/StageOutputs';

const unknownPattern: Pattern = {
  PatternId: 'synthetic-unknown', PatternName: 'Unknown trigger',
  Status: false, AssessmentStatus: 'not-assessed', AssessmentReason: 'The trigger kind could not be read.',
  Recommendation: 'Inspect the source configuration.', Topics: [],
};
const actionableRemediation = {
  findingTitle: 'Order identifier has no description',
  whyItMatters: 'The calling topic cannot confirm which order value to supply.',
  makerAction: 'Describe the order identifier, its format, and its source.',
  suggestedText: 'Order identifier supplied by the calling topic.',
  acceptanceCheck: 'Confirm that the description states the purpose, format, and source.',
};
type ActionablePatternDetailsProps = ComponentProps<typeof PatternFindingDetails> & {
  presentation?: 'full' | 'actionable';
};
const ActionablePatternFindingDetails =
  PatternFindingDetails as ComponentType<ActionablePatternDetailsProps>;
type ActionableComplianceDetailsProps = ComponentProps<typeof ComplianceFindingDetails> & {
  presentation?: 'full' | 'actionable';
};
const ActionableComplianceFindingDetails =
  ComplianceFindingDetails as ComponentType<ActionableComplianceDetailsProps>;
const agentDetailsSource = readFileSync(
  new URL('../../components/dialogs/CSAgentDetailsDrawer.tsx', import.meta.url),
  'utf8',
);
const reviewDialogSource = readFileSync(
  new URL('../../components/dialogs/ReviewDialogV2.tsx', import.meta.url),
  'utf8',
);

function render<Props extends object>(element: ComponentType<Props>, props: Props): string {
  return renderToStaticMarkup(createElement(FluentProvider, { theme: webLightTheme }, createElement(element, props)));
}

describe('standard finding display without a browser or service calls', () => {
  it('keeps unassessed zero-topic details enabled and semantically labelled', () => {
    const rows = transformPatternsForDisplay([unknownPattern]);
    const markup = render(PatternsDataGrid, { patterns: rows, onViewDetails: () => undefined });
    expect(markup).toContain('aria-label="Details for Unknown trigger: Not assessed"');
    const button = markup.match(/<button[^>]*aria-label="Details for Unknown trigger: Not assessed"[^>]*>/)?.[0];
    expect(button).toBeDefined();
    expect(button).not.toContain('disabled=""');
    expect(button).not.toContain('aria-disabled="true"');
  });

  it('keeps N/A zero-topic details enabled instead of storing a hidden Pass', () => {
    const rows = transformPatternsForDisplay([{ ...unknownPattern, AssessmentStatus: 'not-applicable' }]);
    const markup = render(PatternsDataGrid, { patterns: rows, onViewDetails: () => undefined });
    expect(markup).toContain('Details for Unknown trigger: N/A');
    expect(rows[0].status).toBeNull();
    expect(markup).not.toContain('>Pass<');
  });

  it('makes all unavailable instruction criteria accessible with zero recorded findings', () => {
    const rows = transformComplianceForDisplay(null);
    const markup = render(ComplianceDataGrid, { criteria: rows, onViewDetails: () => undefined });
    expect(markup).toContain('Details for');
    expect(markup).toContain('Not assessed');
    expect(markup).not.toContain('disabled=""');
    expect(markup).not.toContain('>Pass<');
  });

  it('renders the assessment reason and static limits without an empty-success assertion', () => {
    const [pattern] = transformPatternsForDisplay([unknownPattern]);
    const markup = render(PatternFindingDetails, { pattern });
    expect(markup).toContain('The trigger kind could not be read.');
    expect(markup).toContain('Static authoring checks');
    expect(markup).toContain('not measured runtime outcomes or production approval');
    expect(markup).toContain('Evidence type: Not recorded');
    expect(markup).not.toContain('No topics affected by this pattern');
  });

  it('puts pattern actions first and moves supporting detail out of the main drawer view', () => {
    const [pattern] = transformPatternsForDisplay([{
      ...unknownPattern,
      AssessmentStatus: 'fail',
      Topics: [{
        item: 'Create order',
        variable: 'OrderId',
        setting: 'inputs.OrderId.description',
        current: '',
        assessmentStatus: 'fail',
        remediation: actionableRemediation,
      }],
    }]);

    const markup = render(ActionablePatternFindingDetails, {
      pattern,
      presentation: 'actionable',
    });

    for (const text of [
      'Affected settings (1)',
      'Recommended action',
      actionableRemediation.makerAction,
      'Draft change',
      'Not applied',
      'How to verify',
      actionableRemediation.acceptanceCheck,
      'Review details',
    ]) expect(markup).toContain(text);
    for (const text of [
      'Why it matters',
      'Maker action',
      'Acceptance check',
      'Assessment limits',
      'Draft for maker review',
      'Review guidance',
      'No agent settings were changed.',
    ]) expect(markup).not.toContain(text);
    expect(markup.indexOf('Recommended action')).toBeLessThan(markup.indexOf('Review details'));
  });

  it('renders only the selected actionable pattern setting from a long array', () => {
    const [pattern] = transformPatternsForDisplay([{
      ...unknownPattern,
      AssessmentStatus: 'fail',
      Topics: Array.from({ length: 20 }, (_, index) => ({
        item: `Topic ${index + 1}`,
        componentId: `topic-${index + 1}`,
        current: `Saved value ${index + 1}`,
        assessmentStatus: 'fail' as const,
        remediation: {
          ...actionableRemediation,
          findingTitle: `Finding ${index + 1}`,
        },
      })),
    }]);

    const markup = render(ActionablePatternFindingDetails, {
      pattern,
      presentation: 'actionable',
    });

    expect(markup).toContain('Search or select affected settings');
    expect(markup).toContain('Saved value 1');
    expect(markup).not.toContain('Saved value 2');
    expect(markup).not.toContain('Saved value 20');
  });

  it('renders one complete overlap finding at a time', () => {
    const [pattern] = transformPatternsForDisplay([{
      ...unknownPattern,
      PatternName: 'Overlapping Topic Descriptions',
      AssessmentStatus: 'fail',
      Topics: Array.from({ length: 5 }, (_, index) => ({
        item: `Topic ${index + 1}`,
        componentId: `topic-${index + 1}`,
        current: `Description ${index + 1}`,
        assessmentStatus: 'fail' as const,
        remediation: {
          ...actionableRemediation,
          findingTitle: `Topic ${index + 1} conflicts with helper ${index + 1}`,
        },
      })),
    }]);

    const markup = render(ActionablePatternFindingDetails, {
      pattern,
      presentation: 'actionable',
    });

    expect(markup).toContain('Affected findings (5)');
    expect(markup).toContain('Search or select affected findings');
    expect(markup).toContain('Topic 1 conflicts with helper 1');
    expect(markup).toContain('Description 1');
    expect(markup).not.toContain('Topic 2 conflicts with helper 2');
    expect(markup).not.toContain('Description 2');
    expect(markup).not.toContain('Description 3');
    expect(markup).not.toContain('Description 5');
    expect(markup).not.toContain('First finding');
    expect(markup).not.toContain('Second finding');
    expect(markup).toContain('affected finding 1 of 5');
    expect(markup).not.toContain('Previous');
    expect(markup).not.toContain('Next');
  });

  it('retains every setting and distinguishes two components sharing the same display name', () => {
    const [pattern] = transformPatternsForDisplay([{
      ...unknownPattern,
      Topics: [
        { item: 'Shared name', componentId: 'first-component', schemaName: 'synthetic.first', variable: 'OrderId', setting: 'inputs.OrderId.description', current: '', suggested: 'Order identifier.' },
        { item: 'Shared name', componentId: 'second-component', variable: 'Result', setting: 'outputs.Result.description', current: 'ok', suggested: 'Outcome details.' },
      ],
    }]);
    const markup = render(PatternFindingDetails, { pattern });
    for (const value of ['first-component', 'synthetic.first', 'second-component', 'inputs.OrderId.description', 'outputs.Result.description', '(empty)', 'Order identifier.', 'Outcome details.']) {
      expect(markup).toContain(value);
    }
  });

  it('merges atomic style classes in finding details', () => {
    const [pattern] = transformPatternsForDisplay([unknownPattern]);
    const markup = render(PatternFindingDetails, { pattern });
    const classes = [...markup.matchAll(/class="([^"]+)"/g)].map(match => match[1].split(/\s+/));
    expect(classes.every(names => names.filter(name => name.startsWith('___')).length <= 1)).toBe(true);
  });

  it('labels each reference separately without hiding unresolved evidence in a failed category', () => {
    const [pattern] = transformPatternsForDisplay([{
      ...unknownPattern, AssessmentStatus: 'fail',
      Topics: [
        { item: 'Confirmed topic', assessmentStatus: 'fail', current: 'Confirmed source text.' },
        {
          item: 'Unresolved topic', assessmentStatus: 'not-assessed', assessmentReason: 'The source could not be read.',
          current: 'An unverified claim.', suggested: 'A retained suggestion.',
          evidence: { source: 'configuration', status: 'unverified', quote: 'An unverified claim.' },
        },
      ],
    }]);
    const markup = render(PatternFindingDetails, { pattern });
    for (const text of [
      'Recorded settings (2)', '1 setting marked Fail', 'Setting assessment: Fail',
      'Setting assessment: Not assessed', 'The source could not be read.',
      'An unverified claim.', 'A retained suggestion.',
    ]) expect(markup).toContain(text);
    expect(markup).not.toContain('Affected settings (2)');
  });

  it('retains evidence source, quote and validation reason without equating verified evidence to Pass', () => {
    const markup = render(ReviewEvidenceDetails, {
      evidence: { source: 'instructions', status: 'unverified', quote: 'Narrow guidance', setting: 'agentInstructions', reason: 'The quote was not an exact match.' },
    });
    expect(markup).toContain('Evidence validation: Unverified');
    expect(markup).toContain('Reviewed instructions');
    expect(markup).toContain('Narrow guidance');
    expect(markup).toContain('The quote was not an exact match.');
    expect(markup).not.toContain('>Pass<');
  });

  it('does not claim instruction compliance when a criterion has no completed assessment', () => {
    const [criterion] = transformComplianceForDisplay(null);
    const markup = render(ComplianceFindingDetails, { criterion });
    expect(markup).toContain('Not assessed');
    expect(markup).toContain('not evidence of a passed check');
    expect(markup).toContain('reviewed instruction text is unavailable');
    expect(markup).not.toContain('meets compliance requirements');
  });

  it('shows instruction fixes without report-style explanation in the main drawer view', () => {
    const criterion = transformComplianceForDisplay({
      compliancePercentage: 0,
      issues: [{
        id: 'scope-definition-1',
        criteriaId: 'scope-definition',
        title: 'Supported request scope is not explicit',
        description: actionableRemediation.whyItMatters,
        recommendation: actionableRemediation.makerAction,
        severity: 'High',
        assessmentStatus: 'fail',
        remediation: actionableRemediation,
      }],
      criterionAssessments: [{
        criteriaId: 'scope-definition',
        status: 'fail',
        reason: 'The supported request scope is incomplete.',
      }],
    }).find(row => row.criteriaId === 'scope-definition');
    expect(criterion).toBeDefined();

    const markup = render(ActionableComplianceFindingDetails, {
      criterion: criterion!,
      agentInstructions: 'Help users manage orders.',
      presentation: 'actionable',
    });

    for (const text of [
      'Findings (1)',
      'Recommended action',
      actionableRemediation.makerAction,
      'Draft change',
      'Not applied',
      'How to verify',
      actionableRemediation.acceptanceCheck,
      'Review details',
    ]) expect(markup).toContain(text);
    for (const text of [
      'Why it matters',
      'Maker action',
      'Acceptance check',
      'Assessment limits',
      'Draft for maker review',
      'Agent instructions reviewed',
      'Criterion description',
      'Review guidance',
      'No agent settings were changed.',
    ]) expect(markup).not.toContain(text);
    expect(markup.indexOf('Recommended action')).toBeLessThan(markup.indexOf('Review details'));
  });

  it('renders only the selected actionable instruction issue', () => {
    const issues = Array.from({ length: 12 }, (_, index) => ({
      id: `scope-${index + 1}`,
      criteriaId: 'scope-definition',
      title: `Scope gap ${index + 1}`,
      description: `Description ${index + 1}`,
      recommendation: `Action ${index + 1}`,
      severity: 'High' as const,
      assessmentStatus: 'fail' as const,
      uncoveredSituation: `Uncovered ${index + 1}`,
      remediation: {
        ...actionableRemediation,
        makerAction: `Action ${index + 1}`,
      },
    }));
    const criterion = transformComplianceForDisplay({
      compliancePercentage: 0,
      issues,
      criterionAssessments: [{
        criteriaId: 'scope-definition',
        status: 'fail',
        reason: 'The supported request scope is incomplete.',
      }],
    }).find(row => row.criteriaId === 'scope-definition');
    expect(criterion).toBeDefined();

    const markup = render(ActionableComplianceFindingDetails, {
      criterion: criterion!,
      agentInstructions: 'Help users manage orders.',
      presentation: 'actionable',
    });

    expect(markup).toContain('Search or select findings');
    expect(markup).toContain('Action 1');
    expect(markup).not.toContain('Action 2');
    expect(markup).not.toContain('Action 12');
  });

  it('separates source resources, retains target identities and labels unknown orchestration', () => {
    const markup = render(CSAgentDetailsDrawer, {
      open: true, onClose: () => undefined,
      stageAOutput: {
        botId: 'synthetic-id', botName: 'Synthetic agent', orchestrationMode: 'unknown',
        topicCount: 0, toolCount: 0, knowledgeCount: 0, testCaseCount: 0,
        localPatterns: [], topics: [], tools: [], knowledgeSources: [], topicComponents: [],
        entities: [{ name: 'Synthetic entity', componentId: 'entity-id', targetId: 'target-id', targetSchemaName: 'target.schema', parentComponentId: 'parent-component-id' }],
        unknownComponents: [{ name: 'Future resource', kind: 'FutureKind', reason: 'Kind is not recognised.' }],
      },
    });
    for (const text of ['Entities (1)', 'Unclassified components (1)', 'Synthetic entity', 'Future resource', 'Agent ID: synthetic-id', 'target-id', 'target.schema', 'Parent component ID: parent-component-id', 'Not assessed']) {
      expect(markup).toContain(text);
    }
    expect(markup).not.toContain('>Classic<');
  });

  it('uses fewer visible source tabs on narrow widths and stacks the legacy dialog before it becomes unreadable', () => {
    expect(agentDetailsSource).toContain('if (viewportWidth < MOBILE_TAB_BREAKPOINT) return 2;');
    expect(agentDetailsSource).toContain('if (viewportWidth < TABLET_TAB_BREAKPOINT) return 3;');
    expect(reviewDialogSource).toContain("'@media (max-width: 959px), (max-height: 559px)': { flexDirection: 'column', overflowY: 'auto' }");
    expect(reviewDialogSource).toContain("'@media (max-width: 959px), (max-height: 559px)': {");
  });

  it('retains focus before replacing the full-instructions preview action', () => {
    const handler = agentDetailsSource.match(/const showFullInstructions = \(\) => \{([\s\S]*?)\n {2}\};/)?.[1];
    expect(handler).toBeDefined();
    expect(handler).toMatch(/panelRef\.current\?\.focus\(\);[\s\S]*setActiveTab\('instructions'\);/);
    const panel = agentDetailsSource.match(/<div\s+ref=\{panelRef\}[^>]*>/)?.[0];
    expect(panel).toContain('role="tabpanel"');
    expect(panel).toContain('tabIndex={0}');
    expect(panel).not.toContain('key=');
    expect(agentDetailsSource).toContain('onClick={showFullInstructions}');
  });

  it('links the agent detail tabs to a focusable tabpanel', () => {
    const markup = render(CSAgentDetailsDrawer, {
      open: true,
      onClose: () => undefined,
      stageAOutput: {
        botId: 'synthetic-id',
        botName: 'Synthetic agent',
        orchestrationMode: 'unknown',
        topicCount: 0,
        toolCount: 0,
        knowledgeCount: 0,
        testCaseCount: 0,
        localPatterns: [],
        topics: [],
        tools: [],
        knowledgeSources: [],
        topicComponents: [],
      },
    });

    expect(markup).toMatch(/id="[^"]+-tab-overview"/);
    expect(markup).toMatch(/aria-controls="[^"]+-panel-overview"/);
    expect(markup).toMatch(/id="[^"]+-panel-overview"/);
    expect(markup).toMatch(/aria-labelledby="[^"]+-tab-overview"/);
    expect(markup).toContain('tabindex="0"');
  });
});
