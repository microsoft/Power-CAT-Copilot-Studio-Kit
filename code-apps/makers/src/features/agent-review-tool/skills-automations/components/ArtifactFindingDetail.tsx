/**
 * ArtifactFindingDetail
 *
 * The body of one finding: the next action, evidence, impact, and published
 * sources for the rule.
 *
 * Split out of {@link ArtifactFindingDrawer} so the content can be rendered — and
 * therefore tested — without Fluent's overlay Drawer, which mounts through a
 * portal and produces no markup under a server render. That is not a theoretical
 * concern: this body once rendered each `fixSteps` entry (an object of
 * `{ order, action }`) straight as a React child, which threw on the first click
 * of any finding, and no test in the suite could reach it.
 */
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Badge,
  Body1,
  Body1Strong,
  Caption1,
  Caption1Strong,
  Divider,
  Link,
  Subtitle2,
  Text,
  makeStyles,
  mergeClasses,
  shorthands,
  tokens,
} from '@fluentui/react-components';
import type { ArtifactFinding } from '../contracts/ArtifactReview';
import { RUNTIME_LABELS } from '../contracts/ArtifactReview';
import { REFERENCES } from '../../agents-experience/contracts/references';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    minWidth: 0,
  },
  rootCompact: { gap: tokens.spacingVerticalS },
  section: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS },
  muted: { color: tokens.colorNeutralForeground3 },
  metadata: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    minWidth: 0,
  },
  action: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    ...shorthands.padding(tokens.spacingVerticalM, tokens.spacingHorizontalM),
    ...shorthands.borderLeft('3px', 'solid', tokens.colorBrandStroke1),
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  actionCompact: {
    gap: tokens.spacingVerticalXS,
    ...shorthands.padding(tokens.spacingVerticalS, tokens.spacingHorizontalS),
  },
  evidence: {
    ...shorthands.padding(tokens.spacingVerticalS, tokens.spacingHorizontalS),
    ...shorthands.border(tokens.strokeWidthThin, 'solid', tokens.colorNeutralStroke2),
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    minWidth: 0,
    maxWidth: '100%',
  },
  evidenceCompact: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    ...shorthands.padding(tokens.spacingVerticalS),
    ...shorthands.border(tokens.strokeWidthThin, 'solid', tokens.colorNeutralStroke2),
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    minWidth: 0,
  },
  location: {
    overflowWrap: 'anywhere',
  },
  steps: {
    margin: 0,
    paddingLeft: tokens.spacingHorizontalXXL,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
  },
  badgeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    flexWrap: 'wrap',
  },
  references: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXXS },
  compactAccordion: {
    ...shorthands.borderTop('1px', 'solid', tokens.colorNeutralStroke3),
  },
  compactAccordionItem: {
    ...shorthands.borderBottom('1px', 'solid', tokens.colorNeutralStroke3),
  },
  compactAccordionButton: {
    minHeight: '44px',
    ...shorthands.padding(tokens.spacingVerticalXS, 0),
  },
  compactAccordionPanel: {
    ...shorthands.padding(0, 0, tokens.spacingVerticalS, tokens.spacingHorizontalM),
  },
});

/** Maps a finding severity onto the Fluent badge colour that reads correctly. */
function severityColor(severity: ArtifactFinding['severity']) {
  if (severity === 'critical' || severity === 'high') return 'danger' as const;
  if (severity === 'medium') return 'warning' as const;
  return 'informative' as const;
}

function titleCase(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function sameText(left?: string, right?: string): boolean {
  if (!left || !right) return false;
  return left.replace(/\s+/g, ' ').trim() === right.replace(/\s+/g, ' ').trim();
}

export interface ArtifactFindingDetailProps {
  finding: ArtifactFinding;
  /** Uses collapsed supporting sections for the fixed-width review rail. */
  compact?: boolean;
}

/** Renders the action, evidence, impact, and sources for one review finding. */
export function ArtifactFindingDetail({ finding, compact = false }: ArtifactFindingDetailProps) {
  const styles = useStyles();
  const location = `${finding.resourcePath ?? 'Bundle'}${finding.line ? `:${finding.line}` : ''}`;
  const productScope = finding.runtimes.map((runtime) => RUNTIME_LABELS[runtime]).join(', ');
  const evidence = finding.evidence || finding.fact;
  const showFact = Boolean(finding.fact && evidence && !sameText(finding.fact, evidence));
  const sources =
    finding.referenceIds.length === 0 ? (
      <Caption1 className={styles.muted}>No published source is cited for this rule.</Caption1>
    ) : (
      <div className={styles.references}>
        {finding.referenceIds.map((id) => {
          const reference = REFERENCES[id as keyof typeof REFERENCES];
          if (!reference) return null;
          return (
            <Caption1 key={id}>
              <Link
                href={reference.url}
                target="_blank"
                rel="noreferrer"
                aria-label={`${reference.title}, opens in a new tab`}
              >
                {reference.title}
              </Link>
              <Text className={styles.muted}> — {reference.source}</Text>
            </Caption1>
          );
        })}
      </div>
    );

  return (
    <div className={mergeClasses(styles.root, compact && styles.rootCompact)}>
      <div className={styles.badgeRow}>
        <Badge
          appearance={finding.severity === 'critical' ? 'filled' : 'tint'}
          data-emphasis={finding.severity === 'critical' ? 'strong' : 'standard'}
          color={severityColor(finding.severity)}
          shape="rounded"
          size="medium"
        >
          {titleCase(finding.severity)}
        </Badge>
      </div>

      <div className={styles.metadata}>
        <Caption1 className={mergeClasses(styles.muted, styles.location)}>
          <Caption1Strong>Location:</Caption1Strong> {location}
        </Caption1>
        {productScope && (
          <Caption1 className={styles.muted}>
            <Caption1Strong>Product scope:</Caption1Strong> {productScope}
          </Caption1>
        )}
        <Caption1 className={styles.muted}>
          <Caption1Strong>Confidence:</Caption1Strong> {titleCase(finding.confidence)}
        </Caption1>
      </div>

      {(finding.recommendation || finding.fixSteps.length > 0) && (
        <div className={mergeClasses(styles.action, compact && styles.actionCompact)}>
          {compact ? (
            <Body1Strong as="h4">Recommended action</Body1Strong>
          ) : (
            <Subtitle2 as="h3">Recommended action</Subtitle2>
          )}
          {finding.recommendation && <Body1>{finding.recommendation}</Body1>}
          {finding.fixSteps.length > 0 && (
            <ol className={styles.steps}>
              {finding.fixSteps.map((step) => (
                <li key={step.order}>
                  <Body1>{step.action}</Body1>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {compact ? (
        <>
          {evidence && (
            <section className={styles.evidenceCompact} aria-labelledby={`evidence-${finding.id}`}>
              <Body1Strong as="h4" id={`evidence-${finding.id}`}>Evidence</Body1Strong>
              {showFact && <Body1>{finding.fact}</Body1>}
              <Caption1Strong className={mergeClasses(styles.muted, styles.location)}>
                {location}
              </Caption1Strong>
              <div className={styles.evidence}>{evidence}</div>
            </section>
          )}
          <Accordion className={styles.compactAccordion} multiple collapsible>
          {finding.why && (
            <AccordionItem className={styles.compactAccordionItem} value="impact">
              <AccordionHeader
                as="h4"
                expandIconPosition="end"
                button={{ className: styles.compactAccordionButton }}
              >
                Impact
              </AccordionHeader>
              <AccordionPanel className={styles.compactAccordionPanel}>
                <Body1>{finding.why}</Body1>
              </AccordionPanel>
            </AccordionItem>
          )}
          <AccordionItem className={styles.compactAccordionItem} value="sources">
            <AccordionHeader
              as="h4"
              expandIconPosition="end"
              button={{ className: styles.compactAccordionButton }}
            >
              Sources
            </AccordionHeader>
            <AccordionPanel className={styles.compactAccordionPanel}>
              {sources}
            </AccordionPanel>
          </AccordionItem>
          </Accordion>
        </>
      ) : (
        <>
          {evidence && (
            <div className={styles.section}>
              <Subtitle2 as="h3">Evidence</Subtitle2>
              {showFact && <Body1>{finding.fact}</Body1>}
              <Caption1Strong className={styles.muted}>{location}</Caption1Strong>
              <div className={styles.evidence}>{evidence}</div>
            </div>
          )}

          {finding.why && (
            <div className={styles.section}>
              <Subtitle2 as="h3">Impact</Subtitle2>
              <Body1>{finding.why}</Body1>
            </div>
          )}

          <Divider />

          <div className={styles.section}>
            <Subtitle2 as="h3">Sources</Subtitle2>
            {sources}
          </div>
        </>
      )}
    </div>
  );
}
