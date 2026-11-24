import { useMemo, useState } from 'react';
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Badge,
  Body1,
  Body1Strong,
  Caption1,
  MessageBar,
  MessageBarBody,
  Subtitle2,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import type {
  CostOpportunity,
  PotentialImpact,
} from '../../contracts/CostEfficiency';
import type { EvidenceState } from '../../contracts/TranscriptEvidence';
import { buildEvidenceOpportunities } from '../../services/cost-efficiency/buildEvidenceOpportunities';
import { titleCase } from '../../services/cost-efficiency/costDisplay';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    minWidth: 0,
  },
  heading: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalS,
    rowGap: tokens.spacingVerticalXXS,
  },
  headingTitle: {
    margin: 0,
  },
  caption: {
    color: tokens.colorNeutralForeground3,
  },
  explanation: {
    color: tokens.colorNeutralForeground2,
    margin: 0,
  },
  accordion: {
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusXLarge,
    overflow: 'hidden',
  },
  item: {
    borderBottom: `1px solid ${tokens.colorNeutralStroke3}`,
    ':last-child': {
      borderBottomWidth: 0,
    },
  },
  dimmed: {
    backgroundColor: tokens.colorNeutralBackground2,
  },
  headerButton: {
    minHeight: '44px',
  },
  headerRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalM,
    rowGap: tokens.spacingVerticalXXS,
    minWidth: 0,
    width: '100%',
  },
  title: {
    minWidth: 0,
    overflowWrap: 'anywhere',
  },
  badges: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalS,
    marginLeft: 'auto',
  },
  detail: {
    display: 'grid',
    gridTemplateColumns: 'minmax(140px, max-content) minmax(0, 1fr)',
    columnGap: tokens.spacingHorizontalXXL,
    rowGap: tokens.spacingVerticalS,
    margin: 0,
    paddingBottom: tokens.spacingVerticalM,
    '@media (max-width: 599px)': {
      gridTemplateColumns: 'minmax(0, 1fr)',
      rowGap: tokens.spacingVerticalXS,
    },
  },
  term: {
    margin: 0,
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    color: tokens.colorNeutralForeground2,
  },
  definition: {
    margin: 0,
    minWidth: 0,
    color: tokens.colorNeutralForeground2,
    overflowWrap: 'anywhere',
  },
  evidenceList: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    marginTop: 0,
    marginBottom: 0,
    paddingLeft: tokens.spacingHorizontalL,
  },
  affectedSkills: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalXS,
  },
  affectedSkillBadge: {
    height: 'auto',
    maxWidth: '100%',
    minHeight: '20px',
    overflowWrap: 'anywhere',
    whiteSpace: 'normal',
  },
});

function impactColor(
  impact: PotentialImpact,
): 'warning' | 'informative' | 'subtle' {
  if (impact === 'high') return 'warning';
  if (impact === 'medium') return 'informative';
  return 'subtle';
}

export interface CostOpportunitiesListProps {
  opportunities: CostOpportunity[];
  /** Grounded overlap or redundancy findings from the saved AI review. */
  aiOpportunities?: CostOpportunity[];
  /** Observed evidence, used to prepend evidence-backed opportunities. */
  evidence?: EvidenceState;
  /** Hides the section title when an outer disclosure already names the section. */
  showHeading?: boolean;
  headingLevel?: 'h3' | 'h4';
}

interface OpportunityProvenance {
  label: string;
  detailTitle: string;
  color: 'brand' | 'informative';
}

function provenanceFor(opportunity: CostOpportunity): OpportunityProvenance {
  switch (opportunity.evidenceLabel) {
    case 'observed':
      return {
        label: 'Observed',
        detailTitle: 'Observed evidence',
        color: 'brand',
      };
    case 'ai-reviewed':
      return {
        label: 'AI-reviewed',
        detailTitle: 'AI review evidence',
        color: 'brand',
      };
    case 'configured':
      return {
        label: 'Configured',
        detailTitle: 'Configuration evidence',
        color: 'informative',
      };
  }
}

function isAccordionItemValue(value: unknown): value is string | number {
  return typeof value === 'string' || typeof value === 'number';
}

/**
 * Renders ranked optimization opportunities, with detail revealed on demand.
 *
 * Evidence-backed opportunities lead, because they compare configuration with
 * what actually ran. Configuration-only opportunities follow and are visually
 * de-emphasized, so a reviewer can tell a measured finding from an inference.
 */
export function CostOpportunitiesList({
  opportunities,
  aiOpportunities = [],
  evidence,
  showHeading = true,
  headingLevel = 'h3',
}: CostOpportunitiesListProps) {
  const styles = useStyles();
  const evidenceOpportunities = useMemo(
    () => buildEvidenceOpportunities(evidence),
    [evidence],
  );
  const merged = useMemo(
    () => [...evidenceOpportunities, ...aiOpportunities, ...opportunities],
    [aiOpportunities, evidenceOpportunities, opportunities],
  );
  const itemIds = useMemo(
    () => merged.map(opportunity => opportunity.id),
    [merged],
  );
  const [openItems, setOpenItems] = useState<(string | number)[]>(
    () => itemIds.slice(0, 1),
  );
  const visibleOpenItems = useMemo(
    () => openItems.filter(item => itemIds.includes(String(item))),
    [itemIds, openItems],
  );

  const disclosureHeadingLevel = headingLevel === 'h4' ? 'h5' : 'h4';
  return (
    <section
      className={styles.root}
      aria-label={showHeading ? undefined : 'Potential optimization opportunities'}
      aria-labelledby={showHeading ? 'cost-opportunities-heading' : undefined}
    >
      <div className={styles.heading}>
        {showHeading ? (
          <Subtitle2
            as={headingLevel}
            className={styles.headingTitle}
            id="cost-opportunities-heading"
          >
            Potential optimization opportunities
          </Subtitle2>
        ) : null}
        {merged.length > 0 && (
          <Caption1>({merged.length})</Caption1>
        )}
      </div>
      <Body1 as="p" className={styles.explanation}>
        Observed findings can change when the rolling 30-day transcript window changes.
        {' '}Configured findings change only when the saved agent configuration or test cases change.
      </Body1>
      {aiOpportunities.length > 0 ? (
        <Body1 as="p" className={styles.explanation}>
          AI-reviewed findings come only from grounded overlap or redundancy in the
          saved cross-skill orchestration review. They do not measure cost or savings.
        </Body1>
      ) : null}
      <Body1 className={styles.caption}>
        {aiOpportunities.length > 0
          ? 'Observed findings appear first, then AI-reviewed findings, then configuration-only hypotheses. Expand an item to see its evidence and validation plan.'
          : 'Observed findings appear first. Expand an item to see its evidence and validation plan.'}
      </Body1>
      {merged.length === 0 ? (
        <MessageBar intent="info">
          <MessageBarBody>
            No specific efficiency opportunity was identified in the saved review
            or observed window. Use measured A/B runs before changing the agent for cost.
          </MessageBarBody>
        </MessageBar>
      ) : (
        <Accordion
          className={styles.accordion}
          collapsible
          multiple
          openItems={visibleOpenItems}
          onToggle={(_event, data) => {
            setOpenItems(data.openItems.filter(isAccordionItemValue));
          }}
        >
          {merged.map(opportunity => {
            const provenance = provenanceFor(opportunity);
            const higherConfidence =
              opportunity.evidenceLabel !== 'configured';
            return (
            <AccordionItem
              className={mergeClasses(
                styles.item,
                !higherConfidence
                  && evidenceOpportunities.length + aiOpportunities.length > 0
                  && styles.dimmed,
              )}
              key={opportunity.id}
              value={opportunity.id}
            >
              <AccordionHeader
                as={disclosureHeadingLevel}
                button={{ className: styles.headerButton }}
                expandIconPosition="start"
              >
                <span className={styles.headerRow}>
                  <Body1Strong className={styles.title}>{opportunity.title}</Body1Strong>
                  <span className={styles.badges}>
                    <Badge
                      appearance={
                        opportunity.evidenceLabel === 'observed'
                          ? 'filled'
                          : 'tint'
                      }
                      shape="rounded"
                      color={provenance.color}
                    >
                      {provenance.label}
                    </Badge>
                    <Badge
                      appearance="tint"
                      shape="rounded"
                      color={impactColor(opportunity.potentialImpact)}
                    >
                      {titleCase(opportunity.potentialImpact)} impact
                    </Badge>
                    <Badge appearance="outline" shape="rounded" color="informative">
                      {titleCase(opportunity.confidence)} confidence
                    </Badge>
                  </span>
                </span>
              </AccordionHeader>
              <AccordionPanel>
                <dl className={styles.detail}>
                  <dt className={styles.term}>
                    <Body1Strong>{provenance.detailTitle}</Body1Strong>
                    <Badge appearance="tint" color="brand" shape="rounded" size="small">
                      {provenance.label}
                    </Badge>
                  </dt>
                  <dd className={styles.definition}>
                    <ul className={styles.evidenceList}>
                      {opportunity.evidence.map(evidenceLine => (
                        <li key={evidenceLine}><Body1>{evidenceLine}</Body1></li>
                      ))}
                    </ul>
                  </dd>
                  {opportunity.affectedSkills
                    && opportunity.affectedSkills.length > 0 ? (
                      <>
                        <dt className={styles.term}>
                          <Body1Strong>Affected skills</Body1Strong>
                        </dt>
                        <dd
                          className={mergeClasses(
                            styles.definition,
                            styles.affectedSkills,
                          )}
                        >
                          {opportunity.affectedSkills.map(skillName => (
                            <Badge
                              appearance="outline"
                              className={styles.affectedSkillBadge}
                              key={skillName}
                              shape="rounded"
                              size="small"
                            >
                              {skillName}
                            </Badge>
                          ))}
                        </dd>
                      </>
                    ) : null}
                  <dt className={styles.term}><Body1Strong>Recommended change</Body1Strong></dt>
                  <dd className={styles.definition}><Body1>{opportunity.recommendation}</Body1></dd>
                  <dt className={styles.term}><Body1Strong>Quality or behavior risk</Body1Strong></dt>
                  <dd className={styles.definition}><Body1>{opportunity.qualityRisk}</Body1></dd>
                  <dt className={styles.term}><Body1Strong>Validation plan</Body1Strong></dt>
                  <dd className={styles.definition}><Body1>{opportunity.validationPlan}</Body1></dd>
                </dl>
              </AccordionPanel>
            </AccordionItem>
            );
          })}
        </Accordion>
      )}
    </section>
  );
}
