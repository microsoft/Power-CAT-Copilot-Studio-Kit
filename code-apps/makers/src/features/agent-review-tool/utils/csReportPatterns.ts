import type { AssessmentStatus, Pattern } from '../contracts/StageOutputs';
import { getPatternSeverity, PATTERN_INHERENT_SEVERITY } from './patternUtils';
import { getPatternAssessment, getPatternTopicAssessment, isAssessmentStatus } from './reviewAssessment';
import { transformPatternsForDisplay } from './transformUtils';
import {
  enumText, evidenceFields, object, remediationFields, reportField, SEVERITIES, text, unavailableRow,
  type CsReportField, type CsReportRow, type SavedObject,
} from './csReportFields';

function referenceStatus(item: SavedObject, parent: AssessmentStatus): AssessmentStatus {
  if (typeof item.item !== 'string'
    || ['variable', 'componentId', 'schemaName', 'setting', 'current', 'suggested', 'assessmentReason']
      .some(key => item[key] !== undefined && typeof item[key] !== 'string')) return 'not-assessed';
  return getPatternTopicAssessment(parent, {
    item: item.item,
    assessmentStatus: item.assessmentStatus === undefined ? undefined
      : isAssessmentStatus(item.assessmentStatus) ? item.assessmentStatus : 'not-assessed',
  });
}

function patternItems(value: unknown, redact: boolean, parent: AssessmentStatus): CsReportRow['items'] {
  if (!Array.isArray(value)) return [];
  return value.map(item => ({
    status: object(item) ? referenceStatus(item, parent) : 'not-assessed',
    fields: object(item) ? [
      ...(['item', 'variable', 'componentId', 'schemaName', 'setting', 'current', 'suggested'] as const).map((key, index) =>
        reportField(['Topic / resource', 'Variable', 'Component ID', 'Schema name', 'Setting', 'Reviewed value', 'Suggested value'][index], item[key], redact)),
      reportField('Saved setting assessment reason', item.assessmentReason, redact),
      ...evidenceFields(item.evidence, redact),
      ...remediationFields(item.remediation, redact),
    ] : [{ label: 'Affected-setting detail', value: 'Unavailable (malformed saved item).' }],
  }));
}

/** Project saved pattern rows and reference outcomes without changing scores or historical fallback. */
export function patternRows(values: unknown[], redact: boolean, isZipSource: boolean): CsReportRow[] {
  return values.map((value, index) => {
    const id = `pattern-${index + 1}`;
    if (!object(value) || !text(value.PatternName)?.trim()) {
      return unavailableRow(id, `Pattern check ${index + 1} (unavailable)`);
    }
    const name = value.PatternName as string;
    const knownName = Object.hasOwn(PATTERN_INHERENT_SEVERITY, name);
    const severity = enumText(getPatternSeverity(name), SEVERITIES, 'Unspecified') as CsReportRow['severity'];
    const savedStatus = getPatternAssessment(value);
    const display = isZipSource && name === 'Inadequate Test Cases' ? transformPatternsForDisplay([{
      PatternId: id, PatternName: name, Topics: [], Recommendation: '',
      Status: value.Status as boolean,
      AssessmentStatus: value.AssessmentStatus as Pattern['AssessmentStatus'],
      AssessmentReason: text(value.AssessmentReason),
    }], isZipSource)[0] : undefined;
    const status = display?.assessmentStatus ?? savedStatus;
    const fields: CsReportField[] = [
      reportField('Saved check ID', value.PatternId, redact),
      reportField('Finding', value.Description ?? value.PatternDescription, redact),
      reportField('Recommendation', value.Recommendation, redact),
      reportField('Assessment reason', value.AssessmentReason, redact),
      reportField('Evidence type', value.EvidenceKind === undefined ? undefined
        : enumText(value.EvidenceKind, ['configuration-fact', 'authoring-guidance', 'potential-risk']), false),
    ];
    if (redact && !knownName) fields.unshift(reportField('Original check title', name, true));
    if (!Array.isArray(value.Topics)) fields.push(reportField('Setting references', value.Topics, redact));
    if (display && status !== savedStatus) fields.push({
      label: 'Display applicability',
      value: `${display.assessmentReason} Saved scores are unchanged.`,
    });
    return {
      id, title: !redact || knownName ? name : `Pattern check ${index + 1}`,
      status, severity, fields,
      items: patternItems(value.Topics, redact, status),
    };
  });
}
