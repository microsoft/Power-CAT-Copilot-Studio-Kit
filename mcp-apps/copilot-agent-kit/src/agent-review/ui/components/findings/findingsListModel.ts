import type { RuleEvaluationStatus } from "../../../core/index.js";
import type { CheckRowView, ChecksView, FindingRowView, FindingView } from "../viewTypes.js";
import { ruleDisplayLabel } from "../ruleDisplayLabels.js";

export type FindingStatus = RuleEvaluationStatus | "recorded";

export interface ReviewResultRow {
  key: string;
  title: string;
  family: string;
  ruleId: string;
  subject?: string;
  status: FindingStatus;
  finding?: FindingView;
  check?: CheckRowView;
}

export interface FindingsFilter {
  query: string;
  family: string;
  status: FindingStatus | "all";
  order: "severity" | "family" | "title";
}

export const EMPTY_FINDINGS_FILTER: FindingsFilter = {
  query: "", family: "all", status: "all", order: "severity",
};

export const FINDING_STATUS_LABEL: Record<FindingStatus, string> = {
  error: "Error",
  warning: "Warning",
  info: "Information",
  passed: "Passed",
  "not-applicable": "Not assessed",
  failed: "Could not run",
  recorded: "Recorded",
};

export const FINDING_STATUS_HINT: Record<FindingStatus, string> = {
  error: "The check found an error.",
  warning: "The check found a warning.",
  info: "The check reported information.",
  passed: "The saved review records a completed check with nothing to report.",
  "not-applicable": "This check did not apply to the agent. It was not assessed, and this is not a pass.",
  failed: "This check could not complete. The agent was not assessed against it.",
  recorded: "The review recorded a configuration fact. This is not a scored check or a pass.",
};

const STATUS_RANK: Record<FindingStatus, number> = {
  error: 0, failed: 1, warning: 2, info: 3, passed: 4, "not-applicable": 5, recorded: 6,
};

function identity(finding: FindingView): string {
  return JSON.stringify([finding.id, finding.componentIdUnique, finding.title, finding.fact]);
}

export function buildReviewResultRows(findings: readonly FindingView[], checks?: ChecksView): ReviewResultRow[] {
  const checkRows = checks?.recorded ? checks.groups.flatMap((group) => group.rows) : [];
  const recordedFacts = new Set(
    checkRows.filter((row) => row.record).flatMap((row) => row.findings.map(identity)),
  );
  const rows: ReviewResultRow[] = findings.map((finding, index) => ({
    key: String(index),
    title: finding.title,
    family: finding.family,
    ruleId: finding.id,
    subject: finding.sub,
    status: recordedFacts.has(identity(finding)) ? "recorded" : finding.sev,
    finding,
  }));
  for (const check of checkRows) {
    if (check.findings.length) continue;
    rows.push({
      key: `check:${check.key}`,
      title: ruleDisplayLabel(check.ruleId, check.family),
      family: check.family,
      ruleId: check.ruleId,
      subject: check.subject,
      status: check.record ? "recorded" : check.status,
      check,
    });
  }
  return rows;
}

export function filterReviewResultRows(rows: readonly ReviewResultRow[], filter: FindingsFilter): ReviewResultRow[] {
  const query = filter.query.trim().toLocaleLowerCase();
  return rows.filter((row) => (
    (filter.family === "all" || row.family === filter.family)
    && (filter.status === "all" || row.status === filter.status)
    && (!query || [
      row.title, row.family, row.ruleId, row.subject,
      row.finding?.fact, row.finding?.why, row.finding?.fix,
    ].filter(Boolean).join(" ").toLocaleLowerCase().includes(query))
  )).sort((a, b) => {
    const severity = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    const family = a.family.localeCompare(b.family);
    const title = a.title.localeCompare(b.title);
    return (filter.order === "family" ? family || severity
      : filter.order === "title" ? title || severity : severity || family)
      || title || a.key.localeCompare(b.key, undefined, { numeric: true });
  });
}

export function findingRows(rows: readonly ReviewResultRow[]): FindingRowView[] {
  return rows.flatMap((row) => row.finding ? [{ key: row.key, finding: row.finding }] : []);
}
