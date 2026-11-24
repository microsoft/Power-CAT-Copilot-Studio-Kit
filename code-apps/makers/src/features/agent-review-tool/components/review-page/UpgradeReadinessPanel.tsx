import { useMemo } from 'react';
import {
  Body1,
  Link,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
  Subtitle2,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import type { LocalStageAOutput } from '../../contracts/StageOutputs';
import {
  AZURE_AI_SEARCH_OPTIONS,
  CHILD_AGENTS_UNAVAILABLE_MESSAGE,
  KNOWLEDGE_KIND_LEGACY_MESSAGE,
  KNOWLEDGE_UNAVAILABLE_MESSAGE,
  POWER_FX_LEGACY_MESSAGE,
  UPGRADE_BENEFIT_QUOTES,
  UPGRADE_FACTS,
  buildUpgradeReadiness,
  type KnowledgeReadinessItem,
} from '../../utils/upgradeReadiness';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    minWidth: 0,
    overflowWrap: 'anywhere',
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM}`,
  },
  loading: {
    display: 'flex',
    justifyContent: 'center',
    padding: tokens.spacingVerticalXXL,
  },
  unavailable: {
    margin: tokens.spacingVerticalM,
  },
  bannerBody: {
    minWidth: 0,
    overflowWrap: 'anywhere',
  },
  bannerText: {
    display: 'block',
    marginTop: tokens.spacingVerticalXXS,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    minWidth: 0,
  },
  heading: {
    margin: 0,
  },
  text: {
    margin: 0,
  },
  list: {
    margin: 0,
    paddingLeft: tokens.spacingHorizontalXL,
  },
});

export interface UpgradeReadinessPanelProps {
  /** The saved Stage A snapshot of the review. Null when the review has no snapshot. */
  stageA: LocalStageAOutput | null;
  /** True while the saved review details load. */
  isLoading: boolean;
}

function expressionLabel(count: number): string {
  return count === 1 ? '1 expression' : `${count} expressions`;
}

function knowledgeLabel(item: KnowledgeReadinessItem): string {
  const kind = item.kind ? `: ${item.kind}` : '';
  const azureAiSearch = item.isAzureAiSearch ? ' (Azure AI Search)' : '';
  return `${item.name}${kind}${azureAiSearch}`;
}

function ReadinessList({ items }: { items: readonly string[] }) {
  const styles = useStyles();
  if (items.length === 0) {
    return <Body1 as="p" className={styles.text}>None found.</Body1>;
  }
  return (
    <ul className={styles.list}>
      {items.map((item, index) => (
        <li key={`${index}:${item}`}>{item}</li>
      ))}
    </ul>
  );
}

/**
 * Show the parts of a standard agent that the upgrade to the Microsoft Copilot harness does not migrate.
 * Information only: the panel reads the saved Stage A snapshot. It does not change the agent, it does
 * not start an upgrade, and it calls no AI.
 */
export function UpgradeReadinessPanel({ stageA, isLoading }: UpgradeReadinessPanelProps) {
  const styles = useStyles();
  const report = useMemo(() => (stageA ? buildUpgradeReadiness(stageA) : null), [stageA]);

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <Spinner label="Loading saved upgrade readiness..." />
      </div>
    );
  }

  if (!stageA || stageA.configurationAvailable === false || !report) {
    return (
      <MessageBar intent="info" className={styles.unavailable}>
        <MessageBarBody>
          Upgrade readiness is unavailable because this review does not contain a readable source
          snapshot.
        </MessageBarBody>
      </MessageBar>
    );
  }

  const { knowledge, powerFx, childAgents, customTopics } = report;
  const knowledgeHeading = knowledge.status === 'unavailable'
    ? 'Knowledge sources'
    : `Knowledge sources (${knowledge.items.length})`;
  const powerFxHeading = powerFx.available
    ? `Topics and tools that use Power Fx (${powerFx.total})`
    : 'Topics and tools that use Power Fx';
  const childAgentsHeading = childAgents ? `Child agents (${childAgents.length})` : 'Child agents';

  return (
    <div className={styles.root}>
      <MessageBar intent="info" layout="multiline">
        <MessageBarBody className={styles.bannerBody}>
          <MessageBarTitle>Confirm the business benefit before you upgrade</MessageBarTitle>
          <span className={styles.bannerText}>{UPGRADE_FACTS}</span>
          <ul className={styles.list}>
            {UPGRADE_BENEFIT_QUOTES.map(quote => (
              <li key={quote.text}>
                {quote.lead ? `${quote.lead} ` : null}
                <q>{quote.text}</q>{' '}
                <Link
                  inline
                  href={quote.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Microsoft Learn, opens in a new tab"
                >
                  Microsoft Learn
                </Link>
              </li>
            ))}
          </ul>
        </MessageBarBody>
      </MessageBar>

      <section className={styles.section}>
        <Subtitle2 as="h3" className={styles.heading}>{knowledgeHeading}</Subtitle2>
        <Body1 as="p" className={styles.text}>
          The upgrade does not migrate knowledge sources. Add them to the new agent.
        </Body1>
        {knowledge.status === 'unavailable' ? (
          <Body1 as="p" className={styles.text}>{KNOWLEDGE_UNAVAILABLE_MESSAGE}</Body1>
        ) : (
          <>
            {knowledge.status === 'legacy-names' && knowledge.items.length > 0 && (
              <Body1 as="p" className={styles.text}>{KNOWLEDGE_KIND_LEGACY_MESSAGE}</Body1>
            )}
            <ReadinessList items={knowledge.items.map(knowledgeLabel)} />
          </>
        )}
        {knowledge.hasAzureAiSearch && (
          <>
            <Body1 as="p" className={styles.text}>
              The Microsoft Copilot harness does not support Azure AI Search as a knowledge source.
              In the new agent, use one of these options:
            </Body1>
            <ul className={styles.list}>
              {AZURE_AI_SEARCH_OPTIONS.map(option => (
                <li key={option.url}>
                  <Link
                    inline
                    href={option.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${option.label}, opens in a new tab`}
                  >
                    {option.label}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className={styles.section}>
        <Subtitle2 as="h3" className={styles.heading}>{powerFxHeading}</Subtitle2>
        <Body1 as="p" className={styles.text}>
          The upgrade does not migrate Power Fx expressions. Rebuild this logic in the new agent.
        </Body1>
        {powerFx.available ? (
          <>
            <ReadinessList
              items={powerFx.items.map(
                item => `${item.name} (${item.kind}): ${expressionLabel(item.expressionCount)}`,
              )}
            />
            {powerFx.total > powerFx.items.length && (
              <Body1 as="p" className={styles.text}>
                {`The list shows ${powerFx.items.length} of ${powerFx.total}.`}
              </Body1>
            )}
          </>
        ) : (
          <Body1 as="p" className={styles.text}>{POWER_FX_LEGACY_MESSAGE}</Body1>
        )}
      </section>

      <section className={styles.section}>
        <Subtitle2 as="h3" className={styles.heading}>{childAgentsHeading}</Subtitle2>
        <Body1 as="p" className={styles.text}>
          The upgrade does not migrate child agents. Add them to the new agent.
        </Body1>
        {childAgents ? (
          <ReadinessList items={childAgents} />
        ) : (
          <Body1 as="p" className={styles.text}>{CHILD_AGENTS_UNAVAILABLE_MESSAGE}</Body1>
        )}
      </section>

      <section className={styles.section}>
        <Subtitle2 as="h3" className={styles.heading}>{`Custom topics (${customTopics.length})`}</Subtitle2>
        <Body1 as="p" className={styles.text}>
          You can rebuild these topics as skills or workflows in the new agent. System topics are not in
          the list.
        </Body1>
        <ReadinessList items={customTopics} />
      </section>
    </div>
  );
}
