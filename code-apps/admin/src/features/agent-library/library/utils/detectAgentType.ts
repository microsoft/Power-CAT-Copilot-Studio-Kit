/**
 * detectAgentType — decide whether an uploaded ZIP is a Copilot Studio solution
 * ('custom') or an M365 declarative agent package ('declarative').
 *
 * The two package types have mutually-exclusive signatures, which the parse
 * paths already rely on:
 *   - Custom solution → a root `solution.xml` (see SolutionZipService).
 *   - Declarative     → a `declarativeAgent*.json` manifest (see DeclarativeAgentService).
 *
 * A Copilot Studio solution never contains a declarativeAgent manifest, and a
 * declarative package never contains solution.xml, so the detection is
 * unambiguous. Returns 'unknown' when neither marker is present (e.g. a stray
 * or corrupt ZIP) so callers can decide on a fallback.
 */

import JSZip from 'jszip';

export type DetectedAgentType = 'custom' | 'declarative' | 'unknown';

/**
 * Inspect a ZIP's entries to classify its agent type. Accepts any input JSZip
 * understands (File/Blob/ArrayBuffer/Uint8Array).
 */
export async function detectAgentTypeFromZip(
  input: File | Blob | ArrayBuffer | Uint8Array,
): Promise<DetectedAgentType> {
  const zip = await JSZip.loadAsync(input);
  // Declarative: an M365 Copilot declarativeAgent manifest.
  if (zip.file(/declarativeAgent.*\.json/i).length > 0) return 'declarative';
  // Custom: a Copilot Studio solution always has a root solution.xml.
  if (zip.file('solution.xml')) return 'custom';
  return 'unknown';
}
