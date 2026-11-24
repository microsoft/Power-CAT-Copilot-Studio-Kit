import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Badge,
  Body1Strong,
  Button,
  Caption1,
  CounterBadge,
  makeStyles,
  shorthands,
  tokens,
  useRestoreFocusTarget,
} from '@fluentui/react-components';
import { ChevronRightRegular } from '@fluentui/react-icons';
import type { ArtifactFinding } from '../contracts/ArtifactReview';
import type { SkillFindingSeverity } from '../../agents-experience/contracts/Findings';

const SEVERITIES: readonly SkillFindingSeverity[] = ['critical', 'high', 'medium', 'low', 'info'];

const useStyles = makeStyles({
  root: {
    overflow: 'hidden',
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  item: {
    backgroundColor: tokens.colorNeutralBackground1,
  },
  headerButton: {
    minHeight: '44px',
    ...shorthands.padding(tokens.spacingVerticalXS, tokens.spacingHorizontalM),
  },
  headerContent: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: tokens.spacingHorizontalS,
    rowGap: tokens.spacingVerticalXXS,
    width: '100%',
    minWidth: 0,
  },
  headerTitle: {
    display: 'inline-flex',
    alignItems: 'center',
    flex: '1 1 auto',
    minWidth: 0,
    gap: tokens.spacingHorizontalS,
  },
  headerSummary: {
    flex: '0 0 auto',
    minWidth: 'fit-content',
    color: tokens.colorNeutralForeground3,
  },
  panel: {
    ...shorthands.margin(0),
    ...shorthands.padding(0),
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    ...shorthands.borderTop('1px', 'solid', tokens.colorNeutralStroke3),
  },
  findingRow: {
    width: '100%',
    minHeight: '44px',
    justifyContent: 'flex-start',
    borderRadius: tokens.borderRadiusNone,
    ...shorthands.padding(tokens.spacingVerticalS, tokens.spacingHorizontalM),
    ...shorthands.borderBottom('1px', 'solid', tokens.colorNeutralStroke3),
    ':last-child': {
      borderBottomWidth: 0,
    },
  },
  findingRowContent: {
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr) auto',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    width: '100%',
    minWidth: 0,
  },
  findingTitle: {
    minWidth: 0,
    overflowWrap: 'anywhere',
    textAlign: 'left',
  },
  findingLocation: {
    color: tokens.colorNeutralForeground3,
    whiteSpace: 'nowrap',
  },
});

function badgeColour(severity: SkillFindingSeverity): 'danger' | 'warning' | 'informative' {
  if (severity === 'critical' || severity === 'high') return 'danger';
  if (severity === 'medium') return 'warning';
  return 'informative';
}

function severitySummary(findings: readonly ArtifactFinding[]): string {
  const counts = new Map<SkillFindingSeverity, number>();
  for (const finding of findings) {
    counts.set(finding.severity, (counts.get(finding.severity) ?? 0) + 1);
  }

  return SEVERITIES.flatMap((severity) => {
    const count = counts.get(severity);
    return count ? [`${count} ${severity}`] : [];
  }).join(' · ');
}

export interface FileFindingsDisclosureProps {
  findings: readonly ArtifactFinding[];
  onSelectFinding: (finding: ArtifactFinding) => void;
}

/** Show compact findings for the selected file and open the shared detail drawer. */
export function FileFindingsDisclosure({
  findings,
  onSelectFinding,
}: FileFindingsDisclosureProps) {
  const styles = useStyles();
  const findingFocusTarget = useRestoreFocusTarget();

  if (findings.length === 0) return null;

  return (
    <Accordion className={styles.root} collapsible defaultOpenItems={['file-findings']}>
      <AccordionItem className={styles.item} value="file-findings">
        <AccordionHeader
          as="h3"
          button={{ className: styles.headerButton }}
          expandIconPosition="end"
        >
          <span className={styles.headerContent}>
            <span className={styles.headerTitle}>
              <Body1Strong as="span">File findings</Body1Strong>
              <CounterBadge
                appearance="ghost"
                color="informative"
                count={findings.length}
                size="small"
              />
            </span>
            <Caption1 className={styles.headerSummary}>{severitySummary(findings)}</Caption1>
          </span>
        </AccordionHeader>
        <AccordionPanel className={styles.panel}>
          <div className={styles.list}>
            {findings.map((finding) => {
              const location = finding.line ? `Line ${finding.line}` : 'File-level';
              return (
                <Button
                  key={finding.id}
                  type="button"
                  appearance="subtle"
                  className={styles.findingRow}
                  icon={<ChevronRightRegular />}
                  iconPosition="after"
                  aria-label={`Open finding: ${finding.title}. ${finding.severity}. ${location}.`}
                  {...findingFocusTarget}
                  onClick={() => onSelectFinding(finding)}
                >
                  <span className={styles.findingRowContent}>
                    <Badge
                      appearance={finding.severity === 'critical' ? 'filled' : 'tint'}
                      color={badgeColour(finding.severity)}
                      shape="rounded"
                      size="small"
                    >
                      {finding.severity}
                    </Badge>
                    <Body1Strong className={styles.findingTitle} as="span">
                      {finding.title}
                    </Body1Strong>
                    <Caption1 className={styles.findingLocation}>{location}</Caption1>
                  </span>
                </Button>
              );
            })}
          </div>
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  );
}
