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
  Link,
  Subtitle2,
} from '@fluentui/react-components';
import { Open16Regular } from '@fluentui/react-icons';
import type { PatternDisplayRow } from '../../contracts/DisplayModels';
import { EVIDENCE_KIND_LABELS, STATUS_BADGE_COLOR } from '../../contracts/DisplayModels';
import type { PatternTopic } from '../../contracts/StageOutputs';
import { PATTERN_LEARN_DOCS } from '../../contracts/Constants';
import { ASSESSMENT_LABELS, getPatternTopicAssessment } from '../../utils/reviewAssessment';
import {
  createPatternFindingItems,
  reconcileFindingSelection,
} from '../../utils/standardFindingNavigation';
import {
  ActionGuidance,
  EvidenceDetails,
  FindingBadges,
} from './StandardFindingContentShared';
import { StandardFindingArrayNavigator } from './StandardFindingArrayNavigator';
import { useStandardFindingContentStyles } from './standardFindingContentStyles';

function PatternReviewDetails({
  pattern,
  settings,
}: {
  pattern: PatternDisplayRow;
  settings: PatternTopic[];
}) {
  const styles = useStandardFindingContentStyles();
  const learnDoc = PATTERN_LEARN_DOCS[pattern.patternName];
  const evidenceType =
    (pattern.evidenceKind && EVIDENCE_KIND_LABELS[pattern.evidenceKind]) || 'Not recorded';
  return (
    <Accordion collapsible className={styles.reviewAccordion}>
      <AccordionItem value="review-details">
        <AccordionHeader
          as="h3"
          expandIconPosition="end"
          button={{ className: styles.reviewHeader }}
        >
          Review details
        </AccordionHeader>
        <AccordionPanel className={styles.reviewPanel}>
          <div className={styles.reviewContent}>
            <section className={styles.section}>
              <Body1Strong as="h4" className={styles.heading}>Review result</Body1Strong>
              <Body1 as="p" className={styles.text}>{pattern.assessmentReason}</Body1>
              <Caption1>Evidence type: {evidenceType}</Caption1>
            </section>
            <section className={styles.section}>
              <Body1Strong as="h4" className={styles.heading}>Check</Body1Strong>
              <Body1 as="p" className={styles.text}>
                {pattern.description || 'No description was recorded.'}
              </Body1>
            </section>
            {settings.map((setting, index) => (
              <section
                className={styles.section}
                key={`${setting.componentId ?? setting.item}-${setting.variable ?? ''}-${index}`}
              >
                <Body1Strong as="h4" className={styles.heading}>{setting.item}</Body1Strong>
                {setting.assessmentReason && (
                  <Body1 as="p" className={styles.text}>{setting.assessmentReason}</Body1>
                )}
                {setting.componentId && <Caption1>Component ID: {setting.componentId}</Caption1>}
                {setting.schemaName && <Caption1>Schema: {setting.schemaName}</Caption1>}
                {setting.remediation?.whyItMatters && (
                  <div className={styles.section}>
                    <Body1Strong as="h5" className={styles.heading}>Impact</Body1Strong>
                    <Body1 as="p" className={styles.text}>
                      {setting.remediation.whyItMatters}
                    </Body1>
                  </div>
                )}
                <EvidenceDetails evidence={setting.evidence} />
              </section>
            ))}
            {learnDoc && (
              <Link
                href={learnDoc.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${learnDoc.label}, opens in a new tab`}
              >
                <Open16Regular aria-hidden /> {learnDoc.label}
              </Link>
            )}
          </div>
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  );
}

interface PatternGuidance {
  action?: string;
  suggestedText?: string;
  verify?: string;
}

function getPatternGuidance(setting: PatternTopic): PatternGuidance {
  return {
    action: setting.remediation?.makerAction,
    suggestedText: setting.remediation?.suggestedText ?? setting.suggested,
    verify: setting.remediation?.acceptanceCheck,
  };
}

function hasGuidance(guidance: PatternGuidance): boolean {
  return Object.values(guidance).some(value => value !== undefined);
}

function PatternSettingContent({
  pattern,
  setting,
  guidance,
}: {
  pattern: PatternDisplayRow;
  setting: PatternTopic;
  guidance: PatternGuidance;
}) {
  const styles = useStandardFindingContentStyles();
  const status = getPatternTopicAssessment(pattern.assessmentStatus, setting);
  const label = ASSESSMENT_LABELS[status];
  const findingTitle = setting.remediation?.findingTitle || setting.item;

  return (
    <section className={styles.setting}>
      <div className={styles.section}>
        <Body1Strong as="h4" className={styles.heading}>
          {findingTitle}
        </Body1Strong>
        <div className={styles.badges}>
          <Badge
            shape="rounded"
            appearance="outline"
            color={STATUS_BADGE_COLOR[label]}
            aria-label={`Setting assessment: ${label}`}
          >
            {label}
          </Badge>
        </div>
        <div className={styles.metadata}>
          {findingTitle !== setting.item && <Caption1>Component: {setting.item}</Caption1>}
          {(setting.setting ?? setting.evidence?.setting) && (
            <Caption1>Setting: {setting.setting ?? setting.evidence?.setting}</Caption1>
          )}
          {setting.variable && <Caption1>Variable: {setting.variable}</Caption1>}
        </div>
      </div>
      {setting.current !== undefined && (
        <section className={styles.current}>
          <Body1Strong as="h5" className={styles.heading}>Current saved value</Body1Strong>
          <Body1 as="p" className={styles.text}>
            {setting.current === '' ? '(empty)' : setting.current}
          </Body1>
        </section>
      )}
      {hasGuidance(guidance) && (
        <ActionGuidance
          action={guidance.action}
          suggestedText={guidance.suggestedText}
          verify={guidance.verify}
          headingLevel="h5"
        />
      )}
    </section>
  );
}

/** Renders pattern findings as concise maker tasks for the Standard Review drawer. */
export function ActionablePatternFindingDetails({ pattern }: { pattern: PatternDisplayRow }) {
  const styles = useStandardFindingContentStyles();
  const affectedSettings = useMemo<PatternTopic[]>(
    () => pattern.rawTopics.length
      ? pattern.rawTopics
      : pattern.topics.map(item => ({ item })),
    [pattern.rawTopics, pattern.topics],
  );
  const options = useMemo(
    () => createPatternFindingItems(affectedSettings),
    [affectedSettings],
  );
  const [storedSelectedId, setStoredSelectedId] = useState<string | null>(
    () => options[0]?.id ?? null,
  );
  const selectedId = reconcileFindingSelection(options, storedSelectedId);
  const isOverlapFinding =
    pattern.patternName.trim().toLocaleLowerCase() === 'overlapping topic descriptions';
  const selectedSetting = options.find(option => option.id === selectedId)?.value;
  const selectedSettings = selectedSetting ? [selectedSetting] : [];
  const needsGeneralAction =
    affectedSettings.length === 0
    || selectedSettings.some(setting => !setting.remediation?.makerAction);

  return (
    <div className={styles.root}>
      <FindingBadges assessment={pattern} />
      {needsGeneralAction && (
        <ActionGuidance
          action={pattern.recommendation || 'No action was recorded.'}
          headingLevel="h3"
        />
      )}
      <section className={styles.section}>
        <Subtitle2 as="h3" className={styles.heading}>
          {isOverlapFinding ? 'Affected findings' : 'Affected settings'} ({affectedSettings.length})
        </Subtitle2>
        {selectedId && selectedSetting ? (
          <div className={styles.navigator}>
            <StandardFindingArrayNavigator
              options={options}
              selectedId={selectedId}
              collectionLabel={isOverlapFinding ? 'Affected findings' : 'Affected settings'}
              itemLabel={isOverlapFinding ? 'affected finding' : 'affected setting'}
              onSelect={setStoredSelectedId}
            />
            <PatternSettingContent
              pattern={pattern}
              setting={selectedSetting}
              guidance={getPatternGuidance(selectedSetting)}
            />
          </div>
        ) : (
          <Body1>No affected setting was identified in this saved review.</Body1>
        )}
      </section>
      <PatternReviewDetails pattern={pattern} settings={selectedSettings} />
    </div>
  );
}
