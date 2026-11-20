import type { DAPackageFinding } from '../contracts/DAPackageReview';

/** Adds a deterministic finding to the package review. */
export function addPackageFinding(
  findings: DAPackageFinding[],
  finding: Omit<DAPackageFinding, 'method'>,
): void {
  findings.push({ ...finding, method: 'deterministic' });
}
