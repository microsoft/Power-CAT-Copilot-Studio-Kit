/**
 * Agent Map consumption of TASK 7 capability edges.
 *
 * What the model adds over the text matcher, measured rather than assumed:
 * polarity ("do not copy file contents" is not a dependency), paraphrase
 * ("saved as a prep record" naming no tool), and usage direction (read vs
 * write), which the matcher cannot produce because it only knows a name was
 * mentioned. It does NOT add recall on identical names — the matcher
 * lowercases both sides and already finds those in plain prose.
 */
import { describe, expect, it } from 'vitest';

import { buildAgentMapGraph } from '../services/agent-map/buildAgentMapGraph';
import type { AgentMapBuildInput } from '../contracts/AgentMap';
import type { AgentsExperienceModel } from '../contracts/AgentsExperienceModel';

/** Mirrors ZAVA Visual Merchandiser: two real tools, prose-only references. */
function model(): AgentsExperienceModel {
  return {
    tools: [
      {
        name: 'Planogram Archive', displayName: 'Planogram Archive',
        schemaname: 'tool.planogram', componentId: 't1', componentIdUnique: 'tu1',
      },
      {
        name: 'Display Photo Library', displayName: 'Display Photo Library',
        schemaname: 'tool.photos', componentId: 't2', componentIdUnique: 'tu2',
      },
    ],
    knowledge: [{
      name: 'ZAVA Visual Merchandising Standards v4.2.docx',
      sourceKind: 'SharePointSearchSource',
      schemaname: 'knowledge.visual-standards',
      componentId: 'k1',
      componentIdUnique: 'ku1',
    }],
    skills: [{
      name: 'display-planner',
      schemaname: 'agent.skill.display-planner',
      source: 'inline-markdown',
      markdown: [
        '# Display Planner',
        'Retrieve the approved layout from the planogram archive.',
        'Save the finished plan to the display photo library for the build team.',
      ].join('\n'),
    }],
    connectedAgents: [],
    triggers: [],
    evaluationSets: [],
    testCases: [],
    unknownKinds: [],
    agentSettings: { modelSeries: 'Claude Opus 5', instructions: 'Plan ZAVA displays.' },
  } as unknown as AgentsExperienceModel;
}

function build(review?: Record<string, unknown>) {
  const input: AgentMapBuildInput = {
    agentId: 'a1',
    agentName: 'ZAVA Visual Merchandiser',
    model: model(),
    skillBundleReviews: review
      ? [{ skillSchemaName: 'agent.skill.display-planner', ...review } as never]
      : undefined,
  };
  return buildAgentMapGraph(input);
}

const edge = (usage: string, capabilityName: string, confidence = 'high') => ({
  capabilityName, usage, confidence,
  evidence: `verbatim span naming ${capabilityName}`,
});

describe('agent map capability edges', () => {
  it('does not duplicate text matches when the reviewer identifies every relationship', () => {
    // Correction to an earlier assumption: the text matcher lowercases both
    // sides, so it DOES find "planogram archive" in prose. Its real gaps are
    // polarity, paraphrase, and usage direction — not recall on identical
    // names. The model relationship wins per target so the inspector does not
    // show the same relationship twice with different provenance.
    const textual = build().edges.filter(e => e.provenance.startsWith('textual'));
    expect(textual).toHaveLength(2);

    const graph = build({
      standard: {
        capabilityEdges: [
          edge('read', 'Planogram Archive'),
          edge('write', 'Display Photo Library'),
        ],
      },
    });
    expect(graph.edges.filter(e => e.provenance.startsWith('textual'))).toHaveLength(0);

    const drawn = graph.edges.filter(e => e.provenance === 'model-inferred');
    expect(drawn).toHaveLength(2);
    // Direction of use is information the text matcher cannot produce at all:
    // it only knows the name was mentioned, not whether the skill reads or writes.
    expect(drawn.map(e => e.relationship).sort())
      .toEqual(['reads tool', 'writes tool']);
  });

  it('reads edges from a persisted review as well as a live one', () => {
    const persisted = build({ standard: { capabilityEdges: [edge('read', 'Planogram Archive')] } });
    const live = build({ standardEvaluation: { capabilityEdges: [edge('read', 'Planogram Archive')] } });
    expect(persisted.edges.filter(e => e.provenance === 'model-inferred')).toHaveLength(1);
    expect(live.edges.filter(e => e.provenance === 'model-inferred')).toHaveLength(1);
  });

  it('carries the model evidence onto the edge so a reviewer can check it', () => {
    const graph = build({ standard: { capabilityEdges: [edge('read', 'Planogram Archive')] } });
    const [drawn] = graph.edges.filter(e => e.provenance === 'model-inferred');
    expect(drawn.evidence).toContain('verbatim span naming Planogram Archive');
    expect(drawn.evidence).toContain('high confidence');
  });

  it('lowers edge weight as the model lowers its confidence', () => {
    const weight = (c: string) => build({
      standard: { capabilityEdges: [edge('read', 'Planogram Archive', c)] },
    }).edges.filter(e => e.provenance === 'model-inferred')[0].confidence;
    expect(weight('high')).toBeGreaterThan(weight('medium'));
    expect(weight('medium')).toBeGreaterThan(weight('low'));
  });

  it('uses conservative text matching when the reviewer returns an empty edge list', () => {
    const graph = build({ standard: { capabilityEdges: [] } });
    expect(graph.edges.filter(e => e.provenance.startsWith('textual'))).toHaveLength(2);
  });

  it('uses conservative text matching when the review predates TASK 7', () => {
    const graph = build({ standard: {} });
    expect(graph.edges.every(e => e.provenance !== 'model-inferred')).toBe(true);
  });

  it('fills relationships omitted from a partial reviewer response without duplicates', () => {
    const graph = build({
      standard: {
        capabilityEdges: [edge('read', 'Planogram Archive')],
      },
    });

    const references = graph.edges.filter(e => e.provenance !== 'structural');
    expect(references).toHaveLength(2);
    expect(references.filter(e => e.provenance === 'model-inferred')).toHaveLength(1);
    expect(references.filter(e => e.provenance === 'textual-exact')).toHaveLength(1);
    expect(new Set(references.map(e => e.target)).size).toBe(2);
  });

  it('ignores malformed reviewer relationships without losing valid fallbacks', () => {
    const graph = build({
      standard: {
        capabilityEdges: [
          null,
          'invalid',
          {},
          {
            capabilityName: '',
            usage: 'read',
            evidence: 'blank capability name',
            confidence: 'high',
          },
          {
            capabilityName: 'Planogram Archive',
            usage: 'unsupported',
            evidence: 'verbatim span naming Planogram Archive',
            confidence: 'high',
          },
          {
            capabilityName: 'Planogram Archive',
            usage: 'read',
            evidence: 'verbatim span naming Planogram Archive',
            confidence: 'certain',
          },
          {
            capabilityName: 'Planogram Archive',
            usage: 'read',
            evidence: ' ',
            confidence: 'high',
          },
          edge('read', 'Planogram Archive'),
        ],
      },
    });

    expect(graph.edges.filter(e => e.provenance === 'model-inferred')).toHaveLength(1);
    expect(graph.edges.filter(e => e.provenance === 'textual-exact')).toHaveLength(1);
    expect(graph.diagnostics.filter(d => d.code === 'skill-capability-edge-invalid'))
      .toHaveLength(7);
  });

  it('keeps only the highest-confidence reviewer relationship for one target', () => {
    [
      [
        edge('reference', 'planogram-archive', 'medium'),
        edge('read', 'Planogram Archive', 'high'),
      ],
      [
        edge('read', 'Planogram Archive', 'high'),
        edge('reference', 'planogram-archive', 'medium'),
      ],
    ].forEach(capabilityEdges => {
      const graph = build({ standard: { capabilityEdges } });
      const drawn = graph.edges.filter(e => e.provenance === 'model-inferred');
      expect(drawn).toHaveLength(1);
      expect(drawn[0].relationship).toBe('reads tool');
      expect(drawn[0].evidence).toContain('high confidence');
    });
  });

  it('draws duplicate persisted text references only once per target', () => {
    const graph = build({
      standard: { capabilityEdges: [] },
      capabilityReferences: [
        {
          category: 'tool',
          targetSchemaName: 'tool.planogram',
          targetComponentId: 't1',
          targetComponentIdUnique: 'tu1',
          matchedName: 'Planogram Archive',
          matchKind: 'exact',
          lineNumber: 2,
          evidence: 'Retrieve the approved layout from the planogram archive.',
        },
        {
          category: 'tool',
          targetSchemaName: 'tool.planogram',
          targetComponentId: 't1',
          targetComponentIdUnique: 'tu1',
          matchedName: 'Planogram Archive',
          matchKind: 'exact',
          lineNumber: 3,
          evidence: 'Read the planogram archive before preparing the display.',
        },
      ],
    });

    expect(graph.edges.filter(e => e.provenance === 'textual-exact')).toHaveLength(1);
  });

  it('prefers an exact persisted reference over a strong reference for one target', () => {
    const graph = build({
      standard: { capabilityEdges: [] },
      capabilityReferences: [
        {
          category: 'knowledge',
          targetSchemaName: 'knowledge.visual-standards',
          targetComponentId: 'k1',
          targetComponentIdUnique: 'ku1',
          matchedName: 'ZAVA Visual Merchandising Standards v4.2.docx',
          matchKind: 'strong',
          lineNumber: 2,
          evidence: 'Check the ZAVA merchandising standards before planning.',
        },
        {
          category: 'knowledge',
          targetSchemaName: 'knowledge.visual-standards',
          targetComponentId: 'k1',
          targetComponentIdUnique: 'ku1',
          matchedName: 'ZAVA Visual Merchandising Standards v4.2.docx',
          matchKind: 'exact',
          lineNumber: 3,
          evidence: 'Check ZAVA Visual Merchandising Standards v4.2.docx before planning.',
        },
      ],
    });

    const drawn = graph.edges.filter(e =>
      e.provenance === 'textual-exact' || e.provenance === 'textual-strong');
    expect(drawn).toHaveLength(1);
    expect(drawn[0].provenance).toBe('textual-exact');
    expect(drawn[0].evidence).toContain('ZAVA Visual Merchandising Standards v4.2.docx');
  });

  it('does not draw a capability missing from the snapshot', () => {
    const graph = build({ standard: { capabilityEdges: [edge('read', 'Store Camera Feed')] } });
    expect(graph.edges.filter(e => e.provenance === 'model-inferred')).toHaveLength(0);
    expect(graph.diagnostics.some(d => d.code === 'skill-reference-target-missing')).toBe(true);
  });

  it('reports a capability the skill relies on but the agent does not have', () => {
    const graph = build({
      standard: {
        capabilityEdges: [],
        missingCapabilities: [
          { capabilityName: 'Store Camera Feed', evidence: 'Pull the build photograph from the store camera feed.' },
        ],
      },
    });
    const found = graph.diagnostics.find(d => d.code === 'skill-capability-not-configured');
    expect(found?.message).toContain('Store Camera Feed');
    expect(found?.message).toContain('Pull the build photograph');
  });

  it('matches a capability the model re-spelled with different separators', () => {
    // The model echoes the skill text, so the same component comes back as
    // `Planogram Archive`, `planogram-archive` or `planogram_archive` between
    // runs. Each spelling must still find the one configured tool, otherwise a
    // genuine edge is dropped as "not present in the reviewed snapshot".
    ['planogram-archive', 'Planogram_Archive', 'PLANOGRAM ARCHIVE'].forEach(spelling => {
      const graph = build({ standard: { capabilityEdges: [edge('read', spelling)] } });
      const drawn = graph.edges.filter(e => e.provenance === 'model-inferred');
      expect(drawn, `spelling "${spelling}" should resolve`).toHaveLength(1);
      expect(graph.diagnostics.some(d => d.code === 'skill-reference-target-missing')).toBe(false);
    });
  });

  it('does not report a configured capability as missing when the model re-spelled it', () => {
    // Measured on ZAVA Visual Merchandiser: TASK 7 returned `display-audit` for
    // one skill and `Display Audit` for another. Repeating the claim verbatim
    // would tell the maker to add a tool the agent already has.
    const graph = build({
      standard: {
        capabilityEdges: [],
        missingCapabilities: [
          { capabilityName: 'planogram-archive', evidence: 'Read the layout from the planogram archive.' },
        ],
      },
    });
    expect(graph.diagnostics.some(d => d.code === 'skill-capability-not-configured')).toBe(false);
    const note = graph.diagnostics.find(d => d.code === 'skill-capability-name-mismatch');
    expect(note?.severity).toBe('info');
    expect(note?.message).toContain('Planogram Archive');
  });

  it('re-checks persisted evidence and refuses an unsupported edge', () => {
    // A review saved before the evidence rule existed can still hold this exact
    // edge (measured on ZAVA Visual Merchandiser): the citation names "store
    // camera feed", a capability the agent does not have, while claiming the
    // configured "Display Photo Library". The map must not draw it just because
    // it was stored.
    const graph = build({
      standard: {
        capabilityEdges: [{
          capabilityName: 'Display Photo Library',
          usage: 'read',
          evidence: 'Pull the build photograph from the store camera feed.',
          confidence: 'medium',
        }],
      },
    });
    expect(graph.edges.filter(e => e.provenance === 'model-inferred')).toHaveLength(0);
    expect(graph.edges.filter(e => e.provenance === 'textual-exact')).toHaveLength(2);
    expect(graph.diagnostics.some(d => d.code === 'skill-capability-evidence-rejected')).toBe(true);
  });

  it('counts model and fallback edges as skill references in the summary', () => {
    const graph = build({
      standard: { capabilityEdges: [edge('read', 'Planogram Archive')] },
    });
    expect(graph.summary.skillReferenceCount).toBe(2);
    expect(graph.summary.linkedSkillCount).toBe(1);
    expect(graph.summary.unlinkedSkillCount).toBe(0);
  });
});
