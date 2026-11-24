import type { AgentMapBuildInput } from '../../contracts/AgentMap';
import { withoutRecognisedSystemKinds } from '../recognisedSystemKinds';
import { AgentMapGraphBuilder } from './graphBuilderState';
import {
  addRootEdge,
  type AgentMapNodeContext,
} from './agentMapNodeContext';
import {
  clipAgentMapText,
  createAgentMapId,
  humanizeAgentMapKind,
} from './agentMapUtils';

/** Add Copilot trigger, evaluation, test, and unknown botcomponents as direct agent spokes. */
export function addAgentMapReviewNodes(
  input: AgentMapBuildInput,
  builder: AgentMapGraphBuilder,
  context: AgentMapNodeContext,
): void {
  input.model.triggers.forEach(trigger => {
    const id = createAgentMapId(
      'trigger',
      trigger.componentIdUnique ?? trigger.componentId ?? trigger.schemaname,
    );
    builder.addNode({
      id,
      category: 'trigger',
      label: trigger.name,
      subtitle: humanizeAgentMapKind(trigger.kind ?? 'Trigger'),
      schemaName: trigger.schemaname,
      componentId: trigger.componentId,
      componentIdUnique: trigger.componentIdUnique,
      parentId: context.rootId,
      depth: 1,
      details: {
        Kind: trigger.kind ?? 'Not captured',
        'Flow ID': trigger.flowId ?? 'Not captured',
      },
      warnings: [],
      resolution: 'resolved',
    });
    addRootEdge(builder, context.rootId, id);
  });

  const evaluationSetLabels = new Map<string, string>();
  input.model.evaluationSets.forEach(set => {
    const id = createAgentMapId(
      'evaluation',
      set.componentIdUnique ?? set.componentId ?? set.id ?? set.schemaname,
    );
    const label = set.displayName ?? set.name;
    if (set.id) evaluationSetLabels.set(set.id, label);
    builder.addNode({
      id,
      category: 'evaluation-set',
      label,
      subtitle: 'Evaluation set',
      schemaName: set.schemaname,
      componentId: set.componentId ?? set.id,
      componentIdUnique: set.componentIdUnique,
      parentId: context.rootId,
      depth: 1,
      details: {
        Graders: set.graders,
        'Configured graders': set.graderDetails?.filter(grader => grader.configured).length ?? 0,
      },
      warnings: set.graderDetails?.some(grader => !grader.configured)
        ? ['One or more graders are not configured.']
        : [],
      resolution: 'resolved',
    });
    addRootEdge(builder, context.rootId, id);
  });

  input.model.testCases.forEach(testCase => {
    const id = createAgentMapId(
      'case',
      testCase.componentIdUnique ?? testCase.componentId ?? testCase.schemaname,
    );
    builder.addNode({
      id,
      category: 'test-case',
      label: testCase.name,
      subtitle: testCase.multiTurn ? 'Multi-turn test' : 'Test case',
      schemaName: testCase.schemaname,
      componentId: testCase.componentId,
      componentIdUnique: testCase.componentIdUnique,
      description: clipAgentMapText(testCase.input),
      parentId: context.rootId,
      depth: 1,
      details: {
        Input: clipAgentMapText(testCase.input, 220) ?? 'Not captured',
        Expected: clipAgentMapText(testCase.expected, 220) ?? 'Not captured',
        Turns: testCase.turns ?? 1,
        Source: testCase.source ?? 'Not captured',
        'Evaluation set': testCase.setId
          ? evaluationSetLabels.get(testCase.setId) ?? testCase.setId
          : 'Not captured',
        'Expected capabilities': (testCase.expectedTools ?? []).map(step => step.schemaName),
      },
      warnings: [],
      resolution: 'resolved',
    });
    addRootEdge(builder, context.rootId, id);
  });

  // Same rule the banner applies: a system component Copilot Studio creates
  // itself is recognised, not unknown, and drawing it as an "Unresolved" node
  // reports a problem the maker neither caused nor can act on. Re-applied here
  // because saved reviews are re-rendered from a persisted model, not re-parsed.
  withoutRecognisedSystemKinds(input.model.unknownKinds).forEach(unknown => {
    const id = createAgentMapId(
      'unknown',
      unknown.componentIdUnique ?? unknown.componentId ?? unknown.schemaname,
    );
    builder.addNode({
      id,
      category: 'unknown',
      label: unknown.schemaname,
      subtitle: unknown.kind ? humanizeAgentMapKind(unknown.kind) : 'Parse error',
      schemaName: unknown.schemaname,
      componentId: unknown.componentId,
      componentIdUnique: unknown.componentIdUnique,
      description: clipAgentMapText(unknown.warning),
      parentId: context.rootId,
      depth: 1,
      details: {
        'Authored kind': unknown.kind ?? 'Unavailable',
        'Component type': unknown.componenttype,
      },
      warnings: [unknown.warning],
      resolution: 'unresolved',
    });
    addRootEdge(builder, context.rootId, id);
  });
}
