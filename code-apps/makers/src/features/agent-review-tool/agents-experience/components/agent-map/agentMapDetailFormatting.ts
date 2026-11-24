import type { AgentMapNode } from '../../contracts/AgentMap';

/** Format a safe detail value for the text-only inspector. */
export function displayAgentMapDetail(value: AgentMapNode['details'][string]): string {
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'None';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}
