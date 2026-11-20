import type {
  AgentMapDetailValue,
  AgentMapEdge,
  AgentMapNode,
} from '../../contracts/AgentMap';

/** Normalize authored identities for exact lookup and deterministic ordering. */
export function normalizeAgentMapKey(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

/**
 * Normalize a capability name the reviewing model produced, for comparison
 * against a configured component.
 *
 * The model echoes whatever the skill text used, so the same capability comes
 * back as `display-audit`, `Display Audit` or `display_audit` between runs and
 * even between skills in one run. `normalizeAgentMapKey` only folds case and
 * whitespace, so those spellings compare unequal and a genuine edge is dropped
 * as "not present in the reviewed snapshot". Treating the three word separators
 * as equivalent is what makes the match survive the model's phrasing.
 *
 * This is deliberately looser than `normalizeAgentMapKey` and must stay
 * separate from it: authored identities are matched exactly first, and this is
 * only ever a fallback tier.
 */
export function normalizeCapabilityName(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[\s_-]+/g, ' ').trim();
}

/** Stable, non-cryptographic hash used only for deterministic UI identities. */
export function agentMapHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** Build a readable React Flow-safe ID without relying on array order. */
export function createAgentMapId(prefix: string, identity: string): string {
  const normalized = normalizeAgentMapKey(identity);
  const slug = normalized
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72) || 'item';
  return `${prefix}:${slug}:${agentMapHash(normalized)}`;
}

export function clipAgentMapText(value: string | undefined, maxLength = 180): string | undefined {
  if (!value) return undefined;
  const text = value.trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function detailsText(details: Record<string, AgentMapDetailValue>): string {
  return Object.entries(details)
    .flatMap(([key, value]) => [key, ...(Array.isArray(value) ? value : [String(value)])])
    .join(' ');
}

/** Populate the normalized text searched by both Map and List views. */
export function withNodeSearchText(node: Omit<AgentMapNode, 'searchText'>): AgentMapNode {
  return {
    ...node,
    searchText: normalizeAgentMapKey([
      node.label,
      node.subtitle,
      node.schemaName,
      node.description,
      node.category,
      detailsText(node.details),
      ...node.warnings,
    ].filter(Boolean).join(' ')),
  };
}

/** Populate edge search text without exposing raw source content. */
export function withEdgeSearchText(edge: Omit<AgentMapEdge, 'searchText'>): AgentMapEdge {
  return {
    ...edge,
    searchText: normalizeAgentMapKey([
      edge.relationship,
      edge.provenance,
      edge.evidence,
      edge.resolution,
      edge.sourceField,
    ].filter(Boolean).join(' ')),
  };
}

export function humanizeAgentMapKind(kind: string): string {
  return kind
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase());
}
