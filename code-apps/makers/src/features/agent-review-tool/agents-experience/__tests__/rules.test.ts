import { describe, expect, it } from 'vitest';
import { runRules } from '../services/GroundedRuleEngine';
import { parseAgentsExperience } from '../services/AgentsExperienceParser';
import { FX } from './fixtures';

describe('GroundedRuleEngine', () => {
  it('every finding carries an on-list reference id and severity', () => {
    const model = parseAgentsExperience(FX.botConfigurationCopilot,
      [FX.connectorTool, FX.mcpTool, FX.inlineSkillClean, FX.connectedAgentTool, FX.evaluationSet, FX.evaluationData]);
    const out = runRules(model);
    expect(out.evaluated).toBeGreaterThan(15);
    for (const f of out.findings) {
      expect(f.referenceId).toBeTruthy();
      expect(['error', 'warning', 'info']).toContain(f.severity);
    }
  });

  it('TOL-04 fires when connectionReference missing', () => {
    const model = parseAgentsExperience(FX.botConfigurationCopilot, [FX.connectorTool]);
    model.tools[0].connectionReference = undefined;
    const out = runRules(model);
    expect(out.findings.some(f => f.id === 'TOL-04' && f.severity === 'error')).toBe(true);
  });

  it('TOL-03 fires for non-Invoker auth', () => {
    const model = parseAgentsExperience(FX.botConfigurationCopilot, [FX.connectorTool]);
    model.tools[0].authMode = 'Maker';
    expect(runRules(model).findings.some(f => f.id === 'TOL-03')).toBe(true);
  });

  it('INS-09 fires when instructions reference an unconfigured tool', () => {
    const model = parseAgentsExperience(
      JSON.stringify({ agentSettings: { instructions: 'Use the SendFax tool for faxes.' } }), [FX.connectorTool]);
    expect(runRules(model).findings.some(f => f.id === 'INS-09')).toBe(true);
  });

  it.each([
    'If the files and a tool result disagree, report the disagreement.',
    'Start with the answer or the next safe action.',
    'State that you used the file instead of executing a tool.',
    'Select the appropriate tool for the request.',
  ])('INS-09 does not turn ordinary prose into a capability name: %s', (instructions) => {
    const model = parseAgentsExperience(
      JSON.stringify({ agentSettings: { instructions } }), [],
    );
    expect(runRules(model).findings.some(f => f.id === 'INS-09')).toBe(false);
  });

  it.each([
    'Use the "Send Fax" tool for faxes.',
    'Call the `send_fax` tool for faxes.',
    'Use the Send Fax tool for faxes.',
  ])('INS-09 keeps explicit missing capability references: %s', (instructions) => {
    const model = parseAgentsExperience(
      JSON.stringify({ agentSettings: { instructions } }), [],
    );
    expect(runRules(model).findings.some(f => f.id === 'INS-09')).toBe(true);
  });

  it('INS-09 opts out rather than passing when there are no instructions', () => {
    const model = parseAgentsExperience(
      JSON.stringify({ agentSettings: { instructions: '' } }), [FX.connectorTool]);
    expect(runRules(model).findings.some(f => f.id === 'INS-09')).toBe(false);
  });

  it('SKL-08 fires when a skill body references a sibling skill', () => {
    const model = parseAgentsExperience(FX.botConfigurationCopilot, [FX.inlineSkillClean, FX.inlineSkillFlagged]);
    model.skills[0].body += '\nWhen done, invoke the receiving-code-review skill.';
    expect(runRules(model).findings.some(f => f.id === 'SKL-08' && f.severity === 'warning')).toBe(true);
  });

  it('SKL-15 fires when a skill body names an unconfigured capability', () => {
    const model = parseAgentsExperience(FX.botConfigurationCopilot, [FX.inlineSkillClean, FX.connectorTool]);
    model.skills[0].body += '\nUse the "Send Fax" tool to deliver the summary.';
    expect(runRules(model).findings.some(f => f.id === 'SKL-15')).toBe(true);
  });

  // The anchoring defect the retired SKL-09 detector carried: it only fired when some
  // *other* reference in the same body had already resolved, so a body naming nothing
  // real stayed silent — the worst case rather than an uninteresting one.
  it('SKL-15 fires when every capability the body names is missing', () => {
    const model = parseAgentsExperience(FX.botConfigurationCopilot, [FX.inlineSkillClean]);
    model.tools = [];
    model.connectedAgents = [];
    model.knowledge = [];
    model.skills[0].body = 'Use the "Send Fax" tool, then call the "Print Report" tool.';
    expect(runRules(model).findings.some(f => f.id === 'SKL-15')).toBe(true);
  });

  it('SKL-15 passes when the named capability is configured', () => {
    const model = parseAgentsExperience(FX.botConfigurationCopilot, [FX.inlineSkillClean, FX.connectorTool]);
    model.tools[0].name = 'Send Fax';
    model.skills[0].body = 'Use the "Send Fax" tool to deliver the summary.';
    expect(runRules(model).findings.some(f => f.id === 'SKL-15')).toBe(false);
  });

  it('SKL-15 does not turn ordinary skill prose into a capability name', () => {
    const model = parseAgentsExperience(FX.botConfigurationCopilot, [FX.inlineSkillClean]);
    model.skills[0].body = 'Select the appropriate tool for the request.';
    expect(runRules(model).findings.some(f => f.id === 'SKL-15')).toBe(false);
  });

  it('SKL-15 opts out rather than passing when no skill carries a body', () => {
    const model = parseAgentsExperience(FX.botConfigurationCopilot, [FX.inlineSkillClean]);
    model.skills[0].body = '';
    expect(runRules(model).findings.some(f => f.id === 'SKL-15')).toBe(false);
  });

  it('KNW-03 fails each legacy Work IQ tool', () => {
    const out = runRules(parseAgentsExperience(FX.botConfigurationCopilot, [FX.mcpTool]));
    const finding = out.findings.find(f => f.id === 'KNW-03');
    expect(finding?.title).toBe('Tool "Work IQ User (Preview)" uses a legacy Work IQ connector');
    expect(finding?.why).toContain('part of a legacy experience');
    expect(out.ruleResults.find(r => r.ruleId === 'KNW-03')?.status).toBe('warning');
  });

  it('KNW-03 passes when the agent uses the Work IQ tool', () => {
    const out = runRules(parseAgentsExperience(FX.botConfigurationCopilot, [FX.workIqMcpTool]));
    expect(out.ruleResults.find(r => r.ruleId === 'KNW-03')?.status).toBe('passed');
  });

  it('KNW-03 passes when the agent has a Work IQ capability', () => {
    const out = runRules(parseAgentsExperience(FX.botConfigurationCopilot, [FX.iqCapabilityMail]));
    expect(out.ruleResults.find(r => r.ruleId === 'KNW-03')?.status).toBe('passed');
  });

  it('KNW-03 is not applicable when no Work IQ tool or capability is captured', () => {
    const out = runRules(parseAgentsExperience(FX.botConfigurationCopilot, [FX.connectorTool]));
    expect(out.ruleResults.find(r => r.ruleId === 'KNW-03')?.status).toBe('not-applicable');
  });

  // Replace the connectorId line only: the connectionReference line above it also contains shared_a365memcp.
  const mcpToolWithConnector = (connectorId: string) =>
    ({ ...FX.mcpTool, data: FX.mcpTool.data.replace('connectorId: shared_a365memcp', `connectorId: ${connectorId}`) });

  it.each([
    'shared_workiqonedrive',
    '/providers/Microsoft.PowerApps/apis/shared_workiqsharepoint',
  ])('KNW-03 fails the legacy Work IQ connector %s', (connectorId) => {
    const model = parseAgentsExperience(FX.botConfigurationCopilot, [mcpToolWithConnector(connectorId)]);
    expect(model.tools[0].connectorId).toBe(connectorId);
    expect(runRules(model).ruleResults.find(r => r.ruleId === 'KNW-03')?.status).toBe('warning');
  });

  it.each([
    'shared_a365adminmcp',
    'shared_a365mcpservers',
  ])('KNW-03 does not treat %s as a legacy Work IQ connector', (connectorId) => {
    const model = parseAgentsExperience(FX.botConfigurationCopilot, [mcpToolWithConnector(connectorId)]);
    expect(model.tools[0].connectorId).toBe(connectorId);
    expect(runRules(model).ruleResults.find(r => r.ruleId === 'KNW-03')?.status).toBe('not-applicable');
  });

  it('EVL-01 fires with no evaluation set; MDL-01 and LCY-01 always info', () => {
    const model = parseAgentsExperience(FX.botConfigurationCopilot, [FX.connectorTool]);
    const ids = runRules(model).findings.map(f => f.id);
    expect(ids).toContain('EVL-01');
    expect(ids).toContain('MDL-01');
    expect(ids).toContain('LCY-01');
  });

  it('LCY-01 names the Microsoft Copilot harness and the upgrade path', () => {
    const out = runRules(parseAgentsExperience(FX.botConfigurationCopilot, [FX.connectorTool]));
    const finding = out.findings.find(f => f.id === 'LCY-01');
    expect(finding?.title).toBe('This agent runs on the Microsoft Copilot harness');
    expect(finding?.why).toBe(
      'The Microsoft Copilot and standard harnesses expose different capabilities. '
      + 'You can upgrade a standard agent to a copy on the Microsoft Copilot harness (preview). '
      + 'The upgrade creates a copy and does not migrate knowledge sources, Power Fx expressions, or child agents.',
    );
  });
});

// ---------------------------------------------------------------------------
// Task 3 — explicit rule-instance outcomes (score v2)
// ---------------------------------------------------------------------------

describe('GroundedRuleEngine — ruleResults (Task 3)', () => {
  it('emits exactly one RuleEvaluationResult per registered rule', () => {
    const model = parseAgentsExperience(FX.botConfigurationCopilot, [FX.connectorTool]);
    const out = runRules(model);
    expect(out.ruleResults).toHaveLength(out.evaluated);
    const keys = new Set(out.ruleResults.map(r => r.key));
    expect(keys.size).toBe(out.ruleResults.length); // engine-level keys are globally unique
  });

  it('a rule with no findings resolves to passed', () => {
    const model = parseAgentsExperience(FX.botConfigurationCopilot, [FX.connectorTool]);
    const out = runRules(model);
    const mdl01 = out.ruleResults.find(r => r.ruleId === 'MDL-01');
    // MDL-01 is always an info finding, never absent, so its status is 'info'.
    expect(mdl01?.status).toBe('info');
  });

  it('TOL-04 (error severity) resolves its rule result to error when it fires', () => {
    const model = parseAgentsExperience(FX.botConfigurationCopilot, [FX.connectorTool]);
    model.tools[0].connectionReference = undefined;
    const out = runRules(model);
    expect(out.ruleResults.find(r => r.ruleId === 'TOL-04')?.status).toBe('error');
  });

  it('a rule that throws resolves to failed, not passed — and is excluded from passedRuleIds', () => {
    const model = parseAgentsExperience(FX.botConfigurationCopilot, [FX.connectorTool]);
    // Force a runtime exception inside a rule's check() by handing it a malformed model shape.
    const brokenModel = { ...model, tools: null as unknown as typeof model.tools };
    const out = runRules(brokenModel);
    const toolResults = out.ruleResults.filter(r => r.family === 'Tools');
    expect(toolResults.every(r => r.status === 'failed')).toBe(true);
    expect(out.passedRuleIds).not.toContain('TOL-01');
  });
});

describe('GroundedRuleEngine — Work IQ workloads (WIQ)', () => {
  const GA_WORKLOADS = ['sites', 'files', 'mail', 'teams', 'calendar', 'people'];
  const iq = (capability: string, access = 'Write') => {
    const id = `fx.iqCapability.${capability}`;
    return {
      ...FX.iqCapabilityMail,
      botcomponentid: id,
      componentidunique: id,
      name: id,
      schemaname: id,
      data: `kind: IQCapability\ncapability: ${capability}\naccess: ${access}`,
    };
  };
  const run = (components: Parameters<typeof parseAgentsExperience>[1]) =>
    runRules(parseAgentsExperience(FX.botConfigurationCopilot, components));
  const status = (out: ReturnType<typeof runRules>, id: string) =>
    out.ruleResults.find(r => r.ruleId === id)?.status;
  const findings = (out: ReturnType<typeof runRules>, id: string) =>
    out.findings.filter(f => f.id === id);

  it('WIQ rules are not applicable when no IQ capability is captured', () => {
    const out = run([FX.workIqMcpTool]);
    for (const id of ['WIQ-01', 'WIQ-02', 'WIQ-03', 'WIQ-04']) expect(status(out, id)).toBe('not-applicable');
  });

  it('WIQ-01 records IQ capabilities without the Work IQ tool, and WIQ-02 to WIQ-04 do not apply', () => {
    const out = run([FX.iqCapabilityMail]);
    const rows = findings(out, 'WIQ-01');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      title: 'Work IQ workload: Outlook mail',
      componentIdUnique: 'fx.iqCapability.mail_a1B',
    });
    expect(status(out, 'WIQ-01')).toBe('info');
    for (const id of ['WIQ-02', 'WIQ-03', 'WIQ-04']) expect(status(out, id)).toBe('not-applicable');
  });

  it('WIQ-02 and WIQ-03 record the default scope and the write access', () => {
    const out = run([FX.workIqMcpTool, ...GA_WORKLOADS.map(w => iq(w))]);
    expect(findings(out, 'WIQ-01')).toHaveLength(6);
    const scope = findings(out, 'WIQ-02');
    expect(scope).toHaveLength(1);
    expect(scope[0].why).toContain('All available workloads are selected by default.');
    const write = findings(out, 'WIQ-03');
    expect(write).toHaveLength(6);
    for (const row of write) {
      expect(row.why).toBe('Write operations are on by default. Your organization\'s permissions and policies still apply.');
      expect(row.fix).not.toMatch(/\bread\b/i);
    }
    expect(status(out, 'WIQ-04')).toBe('passed');
  });

  it('WIQ-02 and WIQ-03 add no row for a narrowed scope without write access', () => {
    const out = run([FX.workIqMcpTool, iq('mail', 'Read')]);
    expect(findings(out, 'WIQ-01')).toHaveLength(1);
    expect(findings(out, 'WIQ-02')).toHaveLength(0);
    expect(findings(out, 'WIQ-03')).toHaveLength(0);
    expect(status(out, 'WIQ-04')).toBe('passed');
  });

  it('WIQ-04 fails each preview workload', () => {
    const out = run([FX.workIqMcpTool, iq('mail'), iq('businessapps')]);
    const rows = findings(out, 'WIQ-04');
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('Work IQ workload "Business apps (preview)" is in preview');
    expect(rows[0].why).toContain('Preview features aren\'t meant for production use');
    expect(status(out, 'WIQ-04')).toBe('warning');
  });
});

describe('GroundedRuleEngine — agent authentication for user tools (TOL-06)', () => {
  const parse = (components: Parameters<typeof parseAgentsExperience>[1], authenticationMode?: number) =>
    parseAgentsExperience(FX.botConfigurationCopilot, components, { authenticationMode });
  const status = (out: ReturnType<typeof runRules>, id: string) =>
    out.ruleResults.find(r => r.ruleId === id)?.status;
  const findings = (out: ReturnType<typeof runRules>, id: string) =>
    out.findings.filter(f => f.id === id);

  it('TOL-06 is not applicable when no captured tool needs user sign-in', () => {
    expect(status(runRules(parse([], 1)), 'TOL-06')).toBe('not-applicable');
    const model = parse([FX.connectorTool], 1);
    model.tools[0].authMode = 'Maker';
    expect(status(runRules(model), 'TOL-06')).toBe('not-applicable');
  });

  it.each([undefined, 0])('TOL-06 cannot run when the agent authentication mode is %s', mode => {
    const out = runRules(parse([FX.connectorTool], mode));
    expect(status(out, 'TOL-06')).toBe('failed');
    expect(findings(out, 'TOL-06')).toHaveLength(0);
  });

  it('TOL-06 fails each tool and agent flow that needs user sign-in when the agent uses No authentication', () => {
    const out = runRules(parse([FX.connectorTool, FX.workflowTool], 1));
    expect(status(out, 'TOL-06')).toBe('error');
    const rows = findings(out, 'TOL-06');
    expect(rows.map(r => r.componentIdUnique).sort()).toEqual(['fx.tool.CreateAChat', 'fx.tool.LookUpOrder_x1Y']);
    expect(rows.map(r => r.title).sort()).toEqual([
      'Tool "Create a chat" needs user sign-in, but the agent uses No authentication',
      'Tool "Look up order" needs user sign-in, but the agent uses No authentication',
    ]);
    for (const row of rows) {
      expect(row.why).toContain('No authentication means your agent doesn\'t require your users to sign in when interacting with the agent.');
      expect(row.why).toContain('An unauthenticated configuration means your agent can only access public information and resources.');
    }
  });

  it.each([2, 3, 4])('TOL-06 passes when the agent authentication mode is %i', mode => {
    expect(status(runRules(parse([FX.connectorTool, FX.workflowTool], mode)), 'TOL-06')).toBe('passed');
  });

  it('TOL-03 is not applicable when the agent uses No authentication and every tool runs under Invoker', () => {
    const out = runRules(parse([FX.connectorTool, FX.mcpTool], 1));
    expect(status(out, 'TOL-03')).toBe('not-applicable');
    expect(findings(out, 'TOL-03')).toHaveLength(0);
    expect(status(out, 'TOL-06')).toBe('error');
  });

  it('TOL-03 still fails a non-Invoker tool when the agent uses No authentication', () => {
    const model = parse([FX.connectorTool, FX.mcpTool], 1);
    model.tools[0].authMode = 'Maker';
    const out = runRules(model);
    expect(status(out, 'TOL-03')).toBe('warning');
    const rows = findings(out, 'TOL-03');
    expect(rows).toHaveLength(1);
    expect(rows[0].why).toContain('The agent uses No authentication, so users do not sign in.');
    expect(status(out, 'TOL-06')).toBe('error');
  });

  it('TOL-03 keeps its outcome when the agent signs users in', () => {
    expect(status(runRules(parse([FX.connectorTool], 2)), 'TOL-03')).toBe('passed');
    const model = parse([FX.connectorTool], 2);
    model.tools[0].authMode = 'Maker';
    const rows = findings(runRules(model), 'TOL-03');
    expect(rows).toHaveLength(1);
    expect(rows[0].why).not.toContain('users do not sign in');
  });
});
