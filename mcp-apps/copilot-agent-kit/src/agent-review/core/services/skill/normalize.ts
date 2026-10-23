/**
 * Pre-scan normalization (research §5): Unicode NFKC → record then strip
 * zero-width / RTL-override chars → hand back both the cleaned text and the
 * hidden-character hits so the injection scan runs on stable input.
 */
export interface PatternHit { id: string; category: string; severity: 'critical' | 'high' | 'medium' | 'info'; evidence: string; }

// Zero-width and RTL/LRO-override code points, written as escapes so they are
// visible in source and lint-clean (research §5 HID-01/HID-02).
const ZERO_WIDTH = /(?:\u200B|\u200C|\u200D|\u2060|\uFEFF|\u180E)/gu;
const RTL_OVERRIDE = /[\u202A-\u202E\u2066-\u2069]/gu;

export function normalizeForScan(text: string): { normalized: string; hiddenFindings: PatternHit[] } {
  const hiddenFindings: PatternHit[] = [];
  if (ZERO_WIDTH.test(text)) {
    hiddenFindings.push({ id: 'HID-01', category: 'hidden-obfuscated', severity: 'critical', evidence: 'zero-width character(s)' });
  }
  if (RTL_OVERRIDE.test(text)) {
    hiddenFindings.push({ id: 'HID-02', category: 'hidden-obfuscated', severity: 'critical', evidence: 'RTL/LRO override character(s)' });
  }
  const normalized = text.normalize('NFKC').replace(ZERO_WIDTH, '').replace(RTL_OVERRIDE, '');
  return { normalized, hiddenFindings };
}
