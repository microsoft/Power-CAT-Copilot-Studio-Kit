import {
  MessageBar,
  MessageBarBody,
  Subtitle2,
  Text,
  makeStyles,
  shorthands,
  tokens,
} from '@fluentui/react-components';
import type { SkillResourceAnalysisView } from '../viewTypes.js';
import type { SkillFileExplorerEntry } from './skillFileExplorerTypes.js';

const useStyles = makeStyles({
  section: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap(tokens.spacingVerticalXS),
    ...shorthands.borderTop('1px', 'solid', tokens.colorNeutralStroke3),
    ...shorthands.padding(tokens.spacingVerticalM, 0, 0),
  },
  sectionTitle: {
    color: tokens.colorNeutralForeground2,
    margin: 0,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap(tokens.spacingVerticalS),
    ...shorthands.padding(0, 0, 0, tokens.spacingHorizontalL),
    margin: 0,
  },
  evidence: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.gap(tokens.spacingVerticalXXS),
  },
  evidenceLabel: {
    fontWeight: tokens.fontWeightSemibold,
  },
  evidenceText: {
    color: tokens.colorNeutralForeground2,
    overflowWrap: 'anywhere',
  },
});

interface EvidenceItem {
  label: string;
  evidence?: string;
}

function formatLabel(value: string): string {
  return value.replace(/-/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

function EvidenceSection({
  title,
  items,
}: {
  title: string;
  items: EvidenceItem[];
}) {
  const styles = useStyles();
  if (items.length === 0) return null;
  return (
    <section className={styles.section}>
      <Subtitle2 as="h4" className={styles.sectionTitle}>{title}</Subtitle2>
      <ul className={styles.list}>
        {items.map((item, index) => (
          <li key={`${item.label}:${index}`} className={styles.evidence}>
            <span className={styles.evidenceLabel}>{item.label}</span>
            {item.evidence && <span className={styles.evidenceText}>{item.evidence}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Sanitized evidence captured for one supporting skill resource. */
export function SkillResourceAnalysis({
  entry,
  analysis,
}: {
  entry: SkillFileExplorerEntry;
  analysis: SkillResourceAnalysisView;
}) {
  const styles = useStyles();
  const hasEvidence = analysis.findings.length > 0
    || analysis.observedBehaviors.length > 0
    || analysis.dependencies.length > 0
    || analysis.externalEndpoints.length > 0
    || analysis.capabilities.length > 0
    || analysis.runtimeAssumptions.length > 0
    || Boolean(analysis.purposeAlignment.rationale)
    || Boolean(analysis.parseError);

  return (
    <>
      {analysis.parseError && (
        <MessageBar intent="warning">
          <MessageBarBody>Evaluator detail: {analysis.parseError}</MessageBarBody>
        </MessageBar>
      )}
      {analysis.purposeAlignment.rationale && (
        <section className={styles.section}>
          <Subtitle2 as="h4" className={styles.sectionTitle}>Purpose alignment</Subtitle2>
          <Text>
            {analysis.purposeAlignment.matches ? 'Aligned. ' : 'Not aligned. '}
            {analysis.purposeAlignment.rationale}
          </Text>
        </section>
      )}
      <EvidenceSection
        title="Observed behavior"
        items={analysis.observedBehaviors.map(item => ({
          label: formatLabel(item.kind),
          evidence: item.evidence,
        }))}
      />
      <EvidenceSection
        title="Dependencies"
        items={analysis.dependencies.map(item => ({
          label: `${item.name} (${item.kind})`,
          evidence: item.evidence,
        }))}
      />
      <EvidenceSection
        title="External endpoints"
        items={analysis.externalEndpoints.map(item => ({
          label: item.value,
          evidence: item.evidence,
        }))}
      />
      <EvidenceSection
        title="Capabilities"
        items={analysis.capabilities.map(item => ({
          label: formatLabel(item.kind),
          evidence: item.evidence,
        }))}
      />
      <EvidenceSection
        title="Runtime assumptions"
        items={analysis.runtimeAssumptions.map(item => ({
          label: item.statement,
          evidence: item.evidence,
        }))}
      />
      {!hasEvidence && (
        <MessageBar intent="info">
          <MessageBarBody>
            The evaluator returned no detailed evidence for {entry.displayPath}.
          </MessageBarBody>
        </MessageBar>
      )}
    </>
  );
}
