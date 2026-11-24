import type {
  ComplianceIssueDetail,
} from '../contracts/DisplayModels';
import type { PatternTopic } from '../contracts/StageOutputs';

export interface FindingNavigatorOption {
  id: string;
  label: string;
  searchText: string;
}

export interface FindingNavigationItem<T> extends FindingNavigatorOption {
  value: T;
}

function normalize(value: string | undefined): string {
  return (value ?? '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

function hash(value: string): string {
  let result = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x01000193);
  }
  return (result >>> 0).toString(36);
}

function createItems<T>(
  values: readonly T[],
  getIdentity: (value: T) => string,
  getLabel: (value: T) => string,
  getSearchText: (value: T) => string,
): FindingNavigationItem<T>[] {
  const occurrences = new Map<string, number>();
  return values.map(value => {
    const identity = getIdentity(value);
    const baseId = `finding-item:${hash(identity)}`;
    const occurrence = occurrences.get(baseId) ?? 0;
    occurrences.set(baseId, occurrence + 1);
    return {
      id: occurrence === 0 ? baseId : `${baseId}:${occurrence + 1}`,
      label: getLabel(value),
      searchText: normalize(getSearchText(value)),
      value,
    };
  });
}

/** Build stable navigator items from saved pattern-setting identity and content. */
export function createPatternFindingItems(
  settings: readonly PatternTopic[],
): FindingNavigationItem<PatternTopic>[] {
  return createItems(
    settings,
    setting => [
      setting.componentId ? `component:${normalize(setting.componentId)}` : '',
      setting.schemaName ? `schema:${normalize(setting.schemaName)}` : '',
      `item:${normalize(setting.item)}`,
      `variable:${normalize(setting.variable)}`,
      `setting:${normalize(setting.setting ?? setting.evidence?.setting)}`,
      `current:${normalize(setting.current)}`,
    ].filter(Boolean).join('|'),
    setting => setting.remediation?.findingTitle || setting.item,
    setting => [
      setting.remediation?.findingTitle,
      setting.item,
      setting.componentId,
      setting.schemaName,
      setting.variable,
      setting.setting,
      setting.evidence?.setting,
      setting.current,
    ].filter(Boolean).join(' '),
  );
}

/** Build stable navigator items from saved instruction-issue identity and content. */
export function createComplianceFindingItems(
  issues: readonly ComplianceIssueDetail[],
): FindingNavigationItem<ComplianceIssueDetail>[] {
  return createItems(
    issues,
    issue => [
      `id:${normalize(issue.id)}`,
      `title:${normalize(issue.title)}`,
      `gap:${normalize(issue.uncoveredSituation)}`,
      `description:${normalize(issue.description)}`,
    ].join('|'),
    issue => issue.title,
    issue => [
      issue.title,
      issue.description,
      issue.uncoveredSituation,
      issue.assessmentReason,
    ].filter(Boolean).join(' '),
  );
}

/** Keep a stable selection when possible and otherwise select the first item. */
export function reconcileFindingSelection(
  options: readonly FindingNavigatorOption[],
  selectedId: string | null | undefined,
): string | null {
  if (selectedId && options.some(option => option.id === selectedId)) {
    return selectedId;
  }
  return options[0]?.id ?? null;
}

/** Reconcile two overlap selections while keeping them distinct when possible. */
export function reconcileFindingComparison(
  options: readonly FindingNavigatorOption[],
  leftId: string | null | undefined,
  rightId: string | null | undefined,
): { leftId: string | null; rightId: string | null } {
  const left = reconcileFindingSelection(options, leftId);
  if (!left) return { leftId: null, rightId: null };
  const right = rightId && rightId !== left && options.some(option => option.id === rightId)
    ? rightId
    : options.find(option => option.id !== left)?.id ?? null;
  return { leftId: left, rightId: right };
}
