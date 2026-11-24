import { describe, expect, it } from 'vitest';
import { parseAgentsExperience } from '../services/AgentsExperienceParser';
import { FX } from './fixtures';

const all = [FX.connectorTool, FX.mcpTool, FX.inlineSkillClean, FX.inlineSkillFlagged,
  FX.connectedAgentTool, FX.knowledgeSource, FX.evaluationSet, FX.evaluationData,
  FX.multiTurnCase, FX.unknownKind, FX.brokenYaml];

describe('AgentsExperienceParser', () => {
  const m = parseAgentsExperience(FX.botConfigurationCopilot, all);

  it('parses agentSettings', () => {
    expect(m.agentSettings.instructions).toContain('IT help desk');
    expect(m.agentSettings.modelSeries).toBe('Sonnet46');
    expect(m.agentSettings.enableWebSearch).toBe(true);
  });
  it('parses published segmented agent instructions', () => {
    const model = parseAgentsExperience(JSON.stringify({
      agentSettings: {
        instructions: {
          $kind: 'Instructions',
          segments: [
            { $kind: 'StaticSegment', value: 'First instruction.' },
            { $kind: 'StaticSegment', value: 'Second instruction.' },
          ],
        },
      },
    }), []);

    expect(model.agentSettings.instructions).toBe(
      'First instruction.\nSecond instruction.',
    );
  });
  it('parses ConnectorTool + McpTool with auth fields', () => {
    expect(m.tools).toHaveLength(2);
    expect(m.tools[0]).toMatchObject({ kind: 'ConnectorTool', authMode: 'Invoker', operationId: 'CreateAChat' });
  });
  it('parses skills with frontmatter split', () => {
    expect(m.skills).toHaveLength(2);
    expect(m.skills[0].frontmatterDescription).toContain('Generate and organize');
    expect(m.skills[0].body).toContain('# Brainstorming');
  });
  it('parses connected agents, knowledge, eval sets, cases', () => {
    expect(m.connectedAgents[0].botSchemaName).toBe('Default_draft_-mYBnc');
    expect(m.knowledge[0].sourceKind).toBe('SharePointSearchSource');
    expect(m.evaluationSets[0].graders).toEqual(['GeneralQualityGrader']);
    // Multi-turn cases are first-class test cases as well as multi-turn cases.
    expect(m.testCases).toHaveLength(2);
    expect(m.multiTurnCases).toHaveLength(1);
  });
  it('parses each top-level uploaded file as a knowledge source', () => {
    const uploadedFiles = [
      {
        botcomponentid: 'file-1',
        botid: 'fx-bot',
        componenttype: '14',
        content: '',
        name: 'Simple_Java_Code.docx',
        componentidunique: 'file-unique-1',
        schemaname: 'fx.file.simple-java-code',
        filedata_name: 'Simple_Java_Code.docx',
      },
      {
        botcomponentid: 'file-2',
        botid: 'fx-bot',
        componenttype: '14',
        content: '',
        name: 'SKILL.md',
        componentidunique: 'file-unique-2',
        schemaname: 'fx.file.skill',
        filedata_name: 'SKILL.md',
        parentbotcomponentid: 'skill-parent',
      },
    ];

    const parsed = parseAgentsExperience(
      FX.botConfigurationCopilot,
      uploadedFiles,
    );

    expect(parsed.knowledge).toEqual([expect.objectContaining({
      name: 'Simple_Java_Code.docx',
      sourceKind: 'UploadedFile',
      componentId: 'file-1',
    })]);
  });
  it('reads EvaluationData from rows[] rather than source', () => {
    const single = m.testCases.find(c => !c.multiTurn);
    expect(single?.input).toBe('Create a chat with Megan');
    expect(single?.expected).toBe('A one-on-one chat with Megan is created in Teams.');
    expect(single?.turns).toBe(1);
  });
  it('extracts user and agent turns from a MultiTurnEvaluationCase', () => {
    const multi = m.testCases.find(c => c.multiTurn);
    expect(multi?.turns).toBe(2);
    expect(multi?.input).toContain('customer feedback table');
    expect(multi?.input).toContain('My selected environment.');
    // Agent turns are the expected responses, so a multi-turn case is gradeable.
    expect(multi?.expected).toBe('Which environment should I use?');
  });
  it('retains grader thresholds, names and configured state', () => {
    const set = parseAgentsExperience(FX.botConfigurationCopilot,
      [FX.evaluationSetMisconfigured]).evaluationSets[0];
    expect(set.graderDetails).toHaveLength(6);
    expect(set.graderDetails?.filter(g => g.kind === 'CompareMeaningGrader').map(g => g.threshold))
      .toEqual([0.6, 0.3]);
    expect(set.graderDetails?.find(g => g.kind === 'ToolCallGrader')?.name).toBe('tool_name');
    // Verified against 38 live botcomponents: ContainsAnyGrader and ToolCallGrader
    // carry their targets on the test cases (expectedKeywords / expectedExecutionSteps),
    // so a bare `kind` is correct authoring, not a misconfiguration.
    expect(set.graderDetails?.find(g => g.kind === 'ContainsAnyGrader')?.configured).toBe(true);
    expect(set.graderDetails?.find(g => g.kind === 'GeneralQualityGrader')?.configured).toBe(true);
    // PromptGrader is the only kind whose rubric must live on the grader itself.
    expect(set.graderDetails?.find(g => g.kind === 'PromptGrader')?.configured).toBe(false);
  });
  it('never throws: unknown kind and broken YAML land in unknownKinds', () => {
    expect(m.unknownKinds.map(u => u.kind ?? 'parse-error')).toContain('HoloDeckTool');
    expect(m.unknownKinds).toHaveLength(2);
  });
  it('ignores standard-shaped dialogs instead of creating Microsoft Copilot topic/action topology', () => {
    const dialog = {
      ...FX.connectorTool,
      botcomponentid: 'standard-dialog-id',
      componentidunique: 'standard-dialog-unique',
      name: 'Standard dialog',
      schemaname: 'standard.dialog',
      data: 'kind: AdaptiveDialog\nbeginDialog:\n  kind: OnRecognizedIntent',
    };
    const model = parseAgentsExperience(FX.botConfigurationCopilot, [dialog]);

    expect(model.tools).toHaveLength(0);
    expect(model.unknownKinds).toHaveLength(0);
    expect('topics' in model).toBe(false);
  });
});

describe('AgentsExperienceParser — Microsoft Copilot harness component kinds', () => {
  it('maps IQCapability components into iqCapabilities', () => {
    const model = parseAgentsExperience(FX.botConfigurationCopilot, [FX.iqCapabilityMail]);

    expect(model.iqCapabilities).toEqual([{
      name: 'fx.iqCapability.mail_a1B', schemaname: 'fx.iqCapability.mail_a1B',
      capability: 'mail', access: 'Write',
      componentId: 'fx.iqCapability.mail_a1B', componentIdUnique: 'fx.iqCapability.mail_a1B',
    }]);
    expect(model.unknownKinds).toHaveLength(0);
  });

  it('maps WorkflowTool components into workflowTools and never into tools', () => {
    const model = parseAgentsExperience(FX.botConfigurationCopilot, [FX.workflowTool]);

    expect(model.workflowTools).toEqual([{
      name: 'Look up order', displayName: 'Look up order',
      description: 'Looks up an order by its number',
      schemaname: 'fx.tool.LookUpOrder_x1Y',
      workflowId: '00000000-0000-0000-0000-000000000001', connectionMode: 'Invoker',
      componentId: 'fx.tool.LookUpOrder_x1Y', componentIdUnique: 'fx.tool.LookUpOrder_x1Y',
    }]);
    expect(model.tools).toHaveLength(0);
    expect(model.unknownKinds).toHaveLength(0);
  });

  it('maps AgentHook components into hooks', () => {
    const model = parseAgentsExperience(FX.botConfigurationCopilot, [FX.agentHook]);

    expect(model.hooks).toEqual([{
      name: 'fx.tool.Onsessionstart_z9Q', schemaname: 'fx.tool.Onsessionstart_z9Q',
      event: 'SessionStartHookEvent', action: 'WorkflowHookAction',
      workflowId: '00000000-0000-0000-0000-000000000002',
      componentId: 'fx.tool.Onsessionstart_z9Q', componentIdUnique: 'fx.tool.Onsessionstart_z9Q',
    }]);
    expect(model.unknownKinds).toHaveLength(0);
  });

  it('leaves the new arrays absent when no such component is captured', () => {
    const model = parseAgentsExperience(FX.botConfigurationCopilot, [FX.connectorTool]);

    expect('iqCapabilities' in model).toBe(false);
    expect('workflowTools' in model).toBe(false);
    expect('hooks' in model).toBe(false);
  });
});

describe('AgentsExperienceParser — agent authentication mode', () => {
  it('keeps the captured authentication mode on the model', () => {
    const model = parseAgentsExperience(FX.botConfigurationCopilot, [], { authenticationMode: 1 });
    expect(model.authenticationMode).toBe(1);
  });

  it('leaves the field out when the mode is not captured', () => {
    const model = parseAgentsExperience(FX.botConfigurationCopilot, []);
    expect('authenticationMode' in model).toBe(false);
  });

  it('ignores a mode that is not a whole number', () => {
    const model = parseAgentsExperience(FX.botConfigurationCopilot, [], { authenticationMode: 1.5 });
    expect(model.authenticationMode).toBeUndefined();
  });
});
