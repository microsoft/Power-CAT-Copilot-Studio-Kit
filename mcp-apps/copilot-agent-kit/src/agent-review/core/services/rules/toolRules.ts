import type { Rule } from './ruleTypes.js';
import type { GroundedFinding } from '../../contracts/Findings.js';

const FAMILY = 'Tools';

export const toolRules: Rule[] = [
  {
    id: 'TOL-01', family: FAMILY, severity: 'info', referenceId: 'ms-tools-skills', kind: 'record',
    check(model) {
      if (model.tools.length === 0) return null;
      const connector = model.tools.filter(t => t.kind === 'ConnectorTool').length;
      const mcp = model.tools.filter(t => t.kind === 'McpTool').length;
      return {
        id: 'TOL-01', family: FAMILY, severity: 'info', referenceId: 'ms-tools-skills', ai: false,
        title: `Tool inventory: ${model.tools.length} tools`,
        fact: `ConnectorTool: ${connector} · McpTool: ${mcp}\n` +
          model.tools.map(t => `${t.name} → ${t.operationId ?? '?'} (${t.authMode ?? '?'})`).join('\n'),
        why: 'The orchestrator selects tools by their name and description; a clear inventory is the basis for the checks below.',
        fix: 'No action required — inventory shown for the review record.',
      };
    },
  },
  {
    id: 'TOL-02', family: FAMILY, severity: 'warning', referenceId: 'ms-tools-skills',
    check(model) {
      return model.tools
        .filter(t => !t.description || t.description.trim().split(/\s+/).length < 2)
        .map<GroundedFinding>(t => ({
          componentIdUnique: t.componentIdUnique,
          id: 'TOL-02', family: FAMILY, severity: 'warning', referenceId: 'ms-tools-skills', ai: false,
          title: `Tool "${t.name}" has a weak or missing description`,
          fact: `description: ${t.description ? `"${t.description}"` : 'missing'}`,
          why: 'Well-described tools perform better — the orchestrator relies on the description to decide when to call the tool.',
          fix: 'Add a full conversational description of when and why the agent should use this tool.',
        }));
    },
  },
  {
    id: 'TOL-03', family: FAMILY, severity: 'warning', referenceId: 'ms-enduser-auth',
    check(model) {
      return model.tools
        .filter(t => (t.authMode ?? '').toLowerCase() !== 'invoker')
        .map<GroundedFinding>(t => ({
          componentIdUnique: t.componentIdUnique,
          id: 'TOL-03', family: FAMILY, severity: 'warning', referenceId: 'ms-enduser-auth', ai: false,
          title: `Tool "${t.name}" does not use user authentication`,
          fact: `authMode: ${t.authMode ?? 'unset'}`,
          why: 'Author (maker) credentials are documented for low-risk implicit access only; user authentication is required when data access must be restricted to the invoking user.',
          fix: 'Confirm the authentication mode is intentional; use user authentication for tools that reach user-scoped data.',
        }));
    },
  },
  {
    id: 'TOL-04', family: FAMILY, severity: 'error', referenceId: 'ms-connections',
    check(model) {
      return model.tools
        .filter(t => !t.connectionReference)
        .map<GroundedFinding>(t => ({
          componentIdUnique: t.componentIdUnique,
          id: 'TOL-04', family: FAMILY, severity: 'error', referenceId: 'ms-connections', ai: false,
          title: `Tool "${t.name}" has no connection reference`,
          fact: `connectionReference: missing · connector: ${t.connectorId ?? '?'}`,
          why: 'Without a connection the tool cannot authenticate to its service at runtime.',
          fix: 'Configure and attach a connection for this tool.',
        }));
    },
  },
  {
    id: 'TOL-05', family: FAMILY, severity: 'warning', referenceId: 'ms-tools-skills',
    check(model) {
      const seen = new Map<string, string>();
      const out: GroundedFinding[] = [];
      for (const t of model.tools) {
        if (!t.connectorId || !t.operationId) continue;
        const key = `${t.connectorId}::${t.operationId}`;
        const prev = seen.get(key);
        if (prev) {
          out.push({
            id: 'TOL-05', family: FAMILY, severity: 'warning', referenceId: 'ms-tools-skills', ai: false,
            title: `Duplicate tool operation: "${prev}" and "${t.name}"`,
            fact: `both call ${key}`,
            why: 'Overlapping tools make orchestrator selection ambiguous.',
            fix: 'Remove one of the duplicate tools or differentiate their purpose and description.',
          });
        } else {
          seen.set(key, t.name);
        }
      }
      return out;
    },
  },
];
