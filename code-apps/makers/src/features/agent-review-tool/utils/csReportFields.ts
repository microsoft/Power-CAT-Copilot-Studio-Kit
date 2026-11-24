import type { AssessmentStatus } from '../contracts/StageOutputs';

export interface CsReportField {
  label: string;
  value: string;
  omission?: 'missing' | 'public-safe';
}

export type Severity = 'High' | 'Medium' | 'Low' | 'Unspecified';
export type SavedObject = Record<string, unknown>;
export interface CsReportRow {
  id: string;
  title: string;
  status: AssessmentStatus;
  severity: Severity;
  fields: CsReportField[];
  items: { status: AssessmentStatus; fields: CsReportField[] }[];
}

export const OMITTED = 'Omitted for public-safe export';
export const NOT_RECORDED = 'Not recorded';
export const SEVERITIES = ['High', 'Medium', 'Low'] as const;
const EMPTY_VALUE = 'Empty value (saved as empty text)';

/** Identify a saved object without accepting arrays or null. */
export function object(value: unknown): value is SavedObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Read saved text without coercion. */
export function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Restrict factual labels to their supported values. */
export function enumText(value: unknown, allowed: readonly string[], fallback = NOT_RECORDED): string {
  return typeof value === 'string' && allowed.includes(value) ? value : fallback;
}

/** Distinguish missing, empty, malformed and deliberately withheld saved text. */
export function displayed(value: unknown, redact: boolean): string {
  if (value === undefined) return NOT_RECORDED;
  if (typeof value !== 'string') return 'Unavailable (malformed value)';
  return redact ? OMITTED : value === '' ? EMPTY_VALUE : value;
}

/** Keep omission metadata separate from literal saved values with the same wording. */
export function reportField(label: string, value: unknown, redact: boolean): CsReportField {
  return {
    label, value: displayed(value, redact),
    omission: value === undefined ? 'missing' : redact && typeof value === 'string' ? 'public-safe' : undefined,
  };
}

/** Retain an unreadable saved row without asserting a completed outcome. */
export function unavailableRow(id: string, title: string): CsReportRow {
  return {
    id, title, status: 'not-assessed', severity: 'Unspecified', items: [],
    fields: [{ label: 'Assessment limit', value: 'This saved row is malformed; its assessment is unavailable.' }],
  };
}

/** Show saved evidence labels and values without revalidating or exposing withheld content. */
export function evidenceFields(value: unknown, redact: boolean): CsReportField[] {
  if (value === undefined) return [reportField('Evidence validation', undefined, false)];
  if (!object(value)) return [{ label: 'Evidence validation', value: 'Unavailable (malformed evidence).' }];
  const source = enumText(value.source, ['configuration', 'instructions', 'ai-response'], 'unavailable');
  const status = enumText(value.status, ['verified', 'unverified', 'unavailable'], 'unavailable');
  return [
    { label: 'Evidence source', value: source }, { label: 'Evidence validation', value: status },
    reportField('Evidence setting', value.setting, redact),
    reportField('Evidence quote', value.quote, redact),
    reportField('Evidence reason', value.reason, redact),
  ];
}

/** Project saved contextual guidance without exposing free text in public-safe exports. */
export function remediationFields(value: unknown, redact: boolean): CsReportField[] {
  if (value === undefined) return [];
  if (!object(value)) {
    return [{
      label: 'Maker guidance',
      value: 'Unavailable (malformed contextual remediation).',
    }];
  }
  return [
    reportField('Finding title', value.findingTitle, redact),
    reportField('Why it matters', value.whyItMatters, redact),
    reportField('Maker action', value.makerAction, redact),
    reportField('Suggested text (draft for maker review)', value.suggestedText, redact),
    reportField('Acceptance check', value.acceptanceCheck, redact),
  ];
}
