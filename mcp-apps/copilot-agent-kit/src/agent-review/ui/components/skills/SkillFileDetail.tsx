import { useId } from 'react';
import {
  Badge,
  Body1Strong,
  Caption1,
  CounterBadge,
  MessageBar,
  MessageBarBody,
  makeStyles,
  shorthands,
  tokens,
} from '@fluentui/react-components';
import { formatFileSize } from '../sourceTreeModel.js';
import type { SkillFileExplorerEntry } from './skillFileExplorerTypes.js';
import { SkillResourceAnalysis } from './SkillResourceAnalysis.js';

const useStyles = makeStyles({
  viewer: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    ...shorthands.gap(tokens.spacingVerticalM),
    ...shorthands.padding(tokens.spacingVerticalM, tokens.spacingHorizontalM),
  },
  viewerHead: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    ...shorthands.gap(tokens.spacingHorizontalS),
  },
  fileHeading: {
    margin: 0,
    overflowWrap: 'anywhere',
  },
  meta: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    ...shorthands.gap(tokens.spacingHorizontalXS),
  },
  size: {
    marginInlineStart: 'auto',
    color: tokens.colorNeutralForeground3,
    fontVariantNumeric: 'tabular-nums',
  },
  source: {
    maxWidth: '100%',
    overflowX: 'auto',
    overflowWrap: 'anywhere',
    whiteSpace: 'pre-wrap',
    backgroundColor: tokens.colorNeutralBackground2,
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke3),
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    ...shorthands.padding(tokens.spacingVerticalM, tokens.spacingHorizontalM),
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
    margin: 0,
  },
  visuallyHidden: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    ...shorthands.padding(0),
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
  },
});

function riskColor(
  risk: SkillFileExplorerEntry['riskLevel'],
): 'danger' | 'warning' | 'informative' | 'subtle' {
  if (risk === 'critical' || risk === 'high') return 'danger';
  if (risk === 'medium') return 'warning';
  if (risk === 'info') return 'informative';
  return 'subtle';
}

function readinessColor(
  readiness: SkillFileExplorerEntry['readiness'],
): 'danger' | 'warning' | 'success' | 'subtle' {
  if (readiness === 'unsupported') return 'danger';
  if (readiness === 'needs-configuration') return 'warning';
  if (readiness === 'ready') return 'success';
  return 'subtle';
}

function statusColor(
  status: string,
): 'danger' | 'warning' | 'success' | 'informative' | 'subtle' {
  if (status === 'failed' || status === 'cancelled') return 'danger';
  if (status === 'partial' || status === 'oversized') return 'warning';
  if (status === 'complete' || status === 'completed') return 'success';
  if (status === 'downloaded' || status === 'evaluating') return 'informative';
  return 'subtle';
}

function formatLabel(value: string): string {
  return value.replace(/-/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

function definitionUnavailableText(entry: SkillFileExplorerEntry): string {
  if (entry.sourceOmission === 'too-large') {
    return 'SKILL.md was too large to retain safely with this review.';
  }
  if (entry.sourceOmission === 'payload-budget') {
    return 'SKILL.md was omitted to keep the saved review within its storage limit.';
  }
  return 'This review was saved before SKILL.md source retention was available.';
}

/** Selected skill-file metadata, retained source, and sanitized analysis. */
export function SkillFileDetail({ entry }: { entry: SkillFileExplorerEntry }) {
  const styles = useStyles();
  const analysis = entry.analysis;
  const headingId = useId();
  const selectionStatus = [
    `Selected file ${entry.displayPath}.`,
    entry.analysisStatus ? `Manifest ${formatLabel(entry.analysisStatus)}.` : '',
    analysis ? `Evaluation ${formatLabel(analysis.evaluationStatus)}.` : '',
    analysis && analysis.findings.length > 0
      ? `${analysis.findings.length} resource findings.`
      : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={styles.viewer} role="region" aria-labelledby={headingId}>
      <span
        className={styles.visuallyHidden}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {selectionStatus}
      </span>
      <div className={styles.viewerHead}>
        <Body1Strong as="h3" id={headingId} className={styles.fileHeading}>
          {entry.displayPath}
        </Body1Strong>
        {entry.language && <Badge appearance="outline">{formatLabel(entry.language)}</Badge>}
        {entry.kind && <Badge appearance="outline">{formatLabel(entry.kind)}</Badge>}
        <Caption1 className={styles.size}>{formatFileSize(entry.sizeBytes)}</Caption1>
      </div>

      <div className={styles.meta}>
        {entry.analysisStatus && (
          <Badge appearance="tint" color={statusColor(entry.analysisStatus)}>
            Manifest: {formatLabel(entry.analysisStatus)}
          </Badge>
        )}
        {analysis && (
          <Badge appearance="tint" color={statusColor(analysis.evaluationStatus)}>
            Evaluation: {formatLabel(analysis.evaluationStatus)}
          </Badge>
        )}
        {entry.riskLevel && (
          <Badge appearance="tint" color={riskColor(entry.riskLevel)}>
            Risk: {formatLabel(entry.riskLevel)}
          </Badge>
        )}
        {entry.readiness && (
          <Badge appearance="tint" color={readinessColor(entry.readiness)}>
            Readiness: {formatLabel(entry.readiness)}
          </Badge>
        )}
        {analysis && analysis.totalChunks > 0 && (
          <Badge appearance="tint" color="informative">
            Chunks: {analysis.analyzedChunks} of {analysis.totalChunks}
          </Badge>
        )}
        {analysis && analysis.findings.length > 0 && (
          <CounterBadge
            count={analysis.findings.length}
            appearance="filled"
            color="danger"
            size="small"
            aria-label={`${analysis.findings.length} resource findings`}
          />
        )}
      </div>

      {entry.joinIssue && (
        <MessageBar intent="warning">
          <MessageBarBody>{entry.joinIssue}</MessageBarBody>
        </MessageBar>
      )}

      {entry.isSkillDefinition ? (
        entry.sourceText ? (
          <pre className={styles.source}>{entry.sourceText.trimEnd()}</pre>
        ) : (
          <MessageBar intent="info">
            <MessageBarBody>{definitionUnavailableText(entry)}</MessageBarBody>
          </MessageBar>
        )
      ) : (
        <>
          <MessageBar intent="info">
            <MessageBarBody>
              Raw resource content is not stored with saved agent reviews. The evidence
              below is the sanitized analysis recorded by the review.
            </MessageBarBody>
          </MessageBar>
          {analysis ? (
            <SkillResourceAnalysis entry={entry} analysis={analysis} />
          ) : !entry.joinIssue ? (
            <MessageBar intent="info">
              <MessageBarBody>
                No detailed resource analysis was recorded for this file.
              </MessageBarBody>
            </MessageBar>
          ) : null}
        </>
      )}
    </div>
  );
}
