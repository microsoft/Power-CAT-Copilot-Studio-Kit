/** Severity label mapping (kept separate from components for fast-refresh compliance). */
import type { Severity } from './viewTypes';

const SEV_LABEL: Record<Severity, string> = {
  error: 'Error',
  warning: 'Warning',
  info: 'Info',
};

export function severityLabel(sev: Severity): string {
  return SEV_LABEL[sev];
}
