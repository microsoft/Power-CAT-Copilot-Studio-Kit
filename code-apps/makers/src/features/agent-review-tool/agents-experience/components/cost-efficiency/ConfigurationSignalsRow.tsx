import type { ReactNode } from 'react';
import {
  Badge,
  Caption1,
  Caption1Strong,
  Subtitle2,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import {
  BookOpenRegular,
  BotRegular,
  BotSparkleRegular,
  FlashRegular,
  InfoRegular,
  WrenchRegular,
} from '@fluentui/react-icons';
import type { CostArchitectureFacts } from '../../contracts/CostEfficiency';
import type { EvidenceState } from '../../contracts/TranscriptEvidence';
import { modelProvider, prettyModelSeries } from '../../services/modelDisplay';
import { ModelProviderIcon } from '../ModelProviderIcon';
import { SkillGlyph } from '../common';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    minWidth: 0,
  },
  headingBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
  },
  titleRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalS,
    rowGap: tokens.spacingVerticalXXS,
  },
  heading: {
    margin: 0,
  },
  caption: {
    color: tokens.colorNeutralForeground3,
    margin: 0,
  },
  captionRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalS,
  },
  infoIcon: {
    flexShrink: 0,
    color: tokens.colorNeutralForeground3,
  },
  facts: {
    display: 'flex',
    flexWrap: 'wrap',
    columnGap: tokens.spacingHorizontalS,
    rowGap: tokens.spacingVerticalS,
    margin: 0,
  },
  fact: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalXS,
    rowGap: tokens.spacingVerticalXXS,
    minWidth: 0,
    maxWidth: '100%',
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusCircular,
    boxShadow: tokens.shadow2,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
  },
  factIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  label: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    margin: 0,
    color: tokens.colorNeutralForeground3,
  },
  value: {
    margin: 0,
    color: tokens.colorNeutralForeground1,
    fontVariantNumeric: 'tabular-nums',
  },
  detail: {
    margin: 0,
    color: tokens.colorNeutralForeground3,
    overflowWrap: 'anywhere',
  },
  observed: {
    display: 'inline-flex',
    margin: 0,
  },
});

export interface ConfigurationSignalsRowProps {
  facts: CostArchitectureFacts;
  /** Observed evidence, used only to annotate facts that can be corroborated. */
  evidence?: EvidenceState;
  headingLevel?: 'h3' | 'h4';
}

/**
 * Renders saved-configuration facts as compact, non-interactive pills.
 *
 * When transcript evidence is ready, a pill whose capability class was observed
 * gains a "Seen in transcripts: N/M" annotation. Absence of an annotation is never
 * rendered as a zero, because an unobserved class may simply not have run.
 */
export function ConfigurationSignalsRow({
  facts,
  evidence,
  headingLevel = 'h3',
}: ConfigurationSignalsRowProps) {
  const styles = useStyles();
  const toolTotal = facts.connectorTools + facts.mcpTools;
  const observedByKind = new Map<string, number>();
  if (evidence?.status === 'ready') {
    for (const coverage of evidence.coverage) {
      observedByKind.set(coverage.kind, coverage.observed);
    }
  }
  const knowledgeObserved = observedByKind.get('knowledge');
  const skillObserved = observedByKind.get('skill');
  const provider = modelProvider(facts.modelSeries);
  const entries: Array<{
    label: string;
    value: string;
    icon: ReactNode;
    iconColor?: string;
    detail?: string;
    configured?: number;
    observed?: number;
  }> = [
    {
      label: 'Model',
      value: facts.modelSeries ? prettyModelSeries(facts.modelSeries) : 'Not specified',
      icon: provider
        ? <ModelProviderIcon provider={provider} size={16} />
        : <BotSparkleRegular fontSize={16} />,
    },
    {
      label: 'Tools',
      value: String(toolTotal),
      icon: <WrenchRegular fontSize={16} />,
      iconColor: tokens.colorPaletteTealBorderActive,
      detail: `${facts.connectorTools} connector · ${facts.mcpTools} MCP`,
    },
    {
      label: 'Knowledge',
      value: String(facts.knowledgeSources),
      icon: <BookOpenRegular fontSize={16} />,
      iconColor: tokens.colorPaletteGreenBorderActive,
      detail: `Web search ${facts.webSearchEnabled === undefined ? 'not captured' : facts.webSearchEnabled ? 'on' : 'off'}`,
      configured: facts.knowledgeSources,
      observed: knowledgeObserved,
    },
    {
      label: 'Connected agents',
      value: String(facts.connectedAgents),
      icon: <BotRegular fontSize={16} />,
      iconColor: tokens.colorPaletteBerryBorderActive,
    },
    {
      label: 'Skills',
      value: String(facts.skills),
      icon: <SkillGlyph size={16} />,
      configured: facts.skills,
      observed: skillObserved,
    },
    {
      label: 'Triggers',
      value: String(facts.triggers),
      icon: <FlashRegular fontSize={16} />,
      iconColor: tokens.colorPaletteDarkOrangeBorderActive,
    },
  ];
  const evidenceCaption = evidence?.status === 'ready'
    ? `Configured values. "Seen in transcripts" shows how many configured items appeared at least once in the last ${evidence.window.days} days. It does not show how often they ran or what they cost.`
    : 'Configured values.';

  return (
    <section className={styles.root} aria-labelledby="cost-configuration-heading">
      <div className={styles.headingBlock}>
        <div className={styles.titleRow}>
          <Subtitle2
            as={headingLevel}
            className={styles.heading}
            id="cost-configuration-heading"
          >
            Configuration signals
          </Subtitle2>
          <Badge appearance="tint" color="brand" shape="rounded">
            Configured
          </Badge>
        </div>
        <div className={styles.captionRow}>
          <InfoRegular className={styles.infoIcon} fontSize={16} aria-hidden />
          <Caption1 as="p" className={styles.caption}>
            {evidenceCaption}
          </Caption1>
        </div>
      </div>
      <dl className={styles.facts}>
        {entries.map(entry => (
          <div className={styles.fact} key={entry.label}>
            <dt className={styles.label}>
              <span
                aria-hidden
                className={styles.factIcon}
                style={{ color: entry.iconColor }}
              >
                {entry.icon}
              </span>
              <Caption1>{entry.label}</Caption1>
            </dt>
            <dd className={styles.value}><Caption1Strong>{entry.value}</Caption1Strong></dd>
            {entry.detail ? (
              <dd className={styles.detail}>
                <Caption1>· {entry.detail}</Caption1>
              </dd>
            ) : null}
            {entry.observed !== undefined
              && entry.observed > 0
              && entry.configured !== undefined ? (
                <dd className={styles.observed}>
                  <Badge appearance="tint" color="success" shape="rounded" size="small">
                    Seen in transcripts: {entry.observed}/{entry.configured}
                  </Badge>
                </dd>
              ) : null}
          </div>
        ))}
      </dl>
    </section>
  );
}
