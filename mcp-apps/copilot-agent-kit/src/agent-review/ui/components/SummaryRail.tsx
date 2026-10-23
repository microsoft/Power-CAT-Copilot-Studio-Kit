import {
  Avatar, Badge, Button, Popover, PopoverSurface, PopoverTrigger, Tooltip,
  Text, makeStyles, mergeClasses, tokens,
} from '@fluentui/react-components';
import { InfoRegular, SparkleRegular } from '@fluentui/react-icons';
import type { ReviewSummaryView as ReviewSummary } from './viewTypes.js';
import { ModelProviderIcon } from './ModelProviderIcon.js';
import { modelProvider } from '../model/modelDisplay.js';
import { scoreBand, type ScoreBand } from '../model/scoreBands.js';
import {
  REVIEW_SUMMARY_GLOW_CLASS,
  ReviewSummaryGlowStyles,
} from './ReviewSummaryGlow.js';
/** Sticky summary rail: grounded score bar, agent metadata, reference counts. */

const useStyles = makeStyles({
  rail: {
    position: 'sticky',
    top: '16px',
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: '12px',
    boxShadow: tokens.shadow2,
  },
  header: {
    padding: '16px 18px 0',
    fontSize: '15px',
    fontWeight: 600,
    display: 'block',
  },
  score: {
    padding: '12px 18px 0',
  },
  scoreLabel: {
    fontSize: '12px',
    color: tokens.colorNeutralForeground2,
    display: 'block',
  },
  /** Keeps the info trigger on the caption baseline without shifting the score. */
  scoreLabelRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
  },
  infoButton: {
    minWidth: 'auto',
    height: '20px',
    padding: 0,
    color: tokens.colorNeutralForeground3,
  },
  popoverSurface: {
    maxWidth: '320px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  popoverTitle: {
    fontSize: '13px',
    fontWeight: 600,
    display: 'block',
  },
  popoverNote: {
    fontSize: '11.5px',
    color: tokens.colorNeutralForeground3,
    display: 'block',
  },
  /** Weight column is fixed so the percentages line up as a scannable column. */
  weightCell: {
    color: tokens.colorNeutralForeground3,
    fontVariantNumeric: 'tabular-nums',
  },
  pillarScore: {
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 600,
  },
  scoreValue: {
    fontSize: '30px',
    fontWeight: 700,
    letterSpacing: '-0.02em',
    fontVariantNumeric: 'tabular-nums',
    display: 'block',
    // The 30px glyphs sit tight against their box, so the caption above and the
    // bar below both need explicit breathing room rather than relying on
    // line-height.
    marginTop: '4px',
    lineHeight: 1.15,
  },
  bar: {
    display: 'flex',
    height: '9px',
    borderRadius: '999px',
    overflow: 'hidden',
    margin: '12px 0 8px',
    backgroundColor: tokens.colorNeutralStroke3,
  },
  barOk: {
    backgroundColor: tokens.colorPaletteGreenBackground3,
  },
  barWarn: {
    backgroundColor: tokens.colorPaletteMarigoldBackground3,
  },
  barErr: {
    backgroundColor: tokens.colorPaletteRedBackground3,
  },
  barFill: {
    flexShrink: 0,
    transition: 'width 200ms ease-out',
  },
  legend: {
    display: 'flex',
    gap: '8px',
    fontSize: '12px',
    color: tokens.colorNeutralForeground1,
    fontVariantNumeric: 'tabular-nums',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  legendDot: {
    display: 'inline-block',
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    marginRight: '5px',
  },
  legendOk: {
    backgroundColor: tokens.colorPaletteGreenBackground3,
  },
  legendWarn: {
    backgroundColor: tokens.colorPaletteMarigoldBackground3,
  },
  legendErr: {
    backgroundColor: tokens.colorPaletteRedBackground3,
  },
  /** Info is neutral: green would read as "passed", which it does not mean. */
  legendInfo: {
    backgroundColor: tokens.colorNeutralForeground4,
  },
  /** Not-applicable is fainter still — it is an absence, not an outcome. */
  legendNa: {
    backgroundColor: tokens.colorNeutralStroke2,
  },
  /** Same key/value rhythm as the metadata list below, so the rail reads as one card. */
  tallyList: {
    // The parent `score` block already pads 18px; adding it again here is what
    // pushed these rows out of line with Agent/Model below.
    margin: '10px 0 0',
  },
  tallyRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '10px',
    padding: '5px 0',
    fontSize: '12px',
  },
  tallyKey: {
    color: tokens.colorNeutralForeground2,
    whiteSpace: 'nowrap',
    // Dotted underline is the conventional cue that a term carries an
    // explanation, so the tooltip is discoverable rather than hidden.
    borderBottom: `1px dotted ${tokens.colorNeutralStroke2}`,
    cursor: 'help',
  },
  tallyValue: {
    color: tokens.colorNeutralForeground1,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },
  /** Never break inside "10 warn" — the count must stay with its label. */
  legendItem: {
    whiteSpace: 'nowrap',
  },
  disclaimer: {
    margin: '12px 18px 0',
  },
  scoreProvenance: {
    display: 'block',
    // Inside `score`, which already pads 18px — a second 18px double-indented it.
    margin: '8px 0 0',
    fontSize: '11.5px',
    color: tokens.colorNeutralForeground3,
  },
  scoreBadges: {
    display: 'flex',
    gap: '6px',
    margin: '8px 0 0',
    flexWrap: 'wrap',
  },
  pillarList: {
    // Lives inside the popover surface, which supplies its own padding.
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  pillarRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '11.5px',
    color: tokens.colorNeutralForeground2,
  },
  kv: {
    padding: '8px 18px 8px',
  },
  kvRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '7px 0',
    borderBottom: `1px solid ${tokens.colorNeutralStroke3}`,
    fontSize: '12.5px',
  },
  kvKey: {
    color: tokens.colorNeutralForeground2,
    whiteSpace: 'nowrap',
  },
  kvValue: {
    textAlign: 'right',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  kvQuiet: {
    fontWeight: 400,
    color: tokens.colorNeutralForeground2,
  },
  refs: {
    padding: '0 18px 16px',
    fontSize: '12px',
    color: tokens.colorNeutralForeground2,
  },
});

/** Maps a score band onto the rail's existing tone palette. */
const BAND_TONE: Record<ScoreBand, 'barOk' | 'barWarn' | 'barErr'> = {
  green: 'barOk',
  amber: 'barWarn',
  red: 'barErr',
};

export function SummaryRail({ summary }: { summary: ReviewSummary }) {
  const styles = useStyles();
  const score = summary.score;
  const hasScore = score !== null;
  const scoreTone = score === null ? undefined : styles[BAND_TONE[scoreBand(score)]];
  const isLegacyScore = summary.scoreBasisVersion === undefined;
  const isPartialScore = summary.scoreStatus === 'partial';
  const scoreAriaSuffix = isLegacyScore ? ' — legacy score, rerun recommended' : isPartialScore ? ' — partial' : '';
  const scoreAriaLabel = hasScore
    ? `Grounded configuration score ${score} out of 100${scoreAriaSuffix}`
    : 'Grounded configuration score is not applicable because no scored configuration is present';
  const citedSources = [
    { key: 'learn', count: summary.refCounts.learn, label: 'Microsoft Learn' },
    { key: 'owasp', count: summary.refCounts.owasp, label: 'OWASP' },
    { key: 'mitre', count: summary.refCounts.mitreCwe, label: 'MITRE CWE' },
    { key: 'anthropic', count: summary.refCounts.anthropic, label: 'Anthropic' },
  ].filter((source) => source.count > 0);

  return (
    <>
      <ReviewSummaryGlowStyles />
      <aside
        className={mergeClasses(styles.rail, REVIEW_SUMMARY_GLOW_CLASS)}
        aria-label="Review summary"
      >
        <Text className={styles.header}>Review summary</Text>

      <div className={styles.score}>
        <div className={styles.scoreLabelRow}>
          <Text className={styles.scoreLabel}>Grounded configuration score</Text>
          {/*
            The weight table answers "how was this calculated?" — a question
            asked once, not on every glance. Behind a trigger it stays available
            without competing with the score itself for attention.
          */}
          <Popover withArrow positioning="after">
            <PopoverTrigger disableButtonEnhancement>
              <Button
                appearance="transparent"
                size="small"
                className={styles.infoButton}
                icon={<InfoRegular />}
                aria-label="How the grounded configuration score is calculated"
              />
            </PopoverTrigger>
            <PopoverSurface className={styles.popoverSurface}>
              <Text className={styles.popoverTitle}>How this score is calculated</Text>
              <Text className={styles.popoverNote}>
                Deterministic rule outcomes and evaluation coverage, combined by weight.
                It does not measure answer quality.
              </Text>
              <Text className={styles.popoverNote}>
                <strong>Checks</strong> are the rules that ran. <strong>Findings</strong> are what
                they reported — one check can raise several findings, so the two counts
                are not expected to match.
              </Text>
              {summary.pillars && summary.pillars.length > 0 && (
                <div className={styles.pillarList} aria-label="Score pillar breakdown">
                  {summary.pillars.map(p => (
                    <div key={p.pillar} className={styles.pillarRow}>
                      <span>
                        {p.pillar} <span className={styles.weightCell}>×{p.weight}</span>
                      </span>
                      <span className={styles.pillarScore}>
                        {!p.applicable || p.score === null
                          ? 'n/a'
                          : !p.complete
                            ? `${p.score}% · partial`
                            : `${p.score}%`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </PopoverSurface>
          </Popover>
        </div>
        <Text className={styles.scoreValue}>{hasScore ? `${score}%` : 'N/A'}</Text>
        <div
          className={styles.bar}
          role="img"
          aria-label={scoreAriaLabel}
        >
          <span
            className={mergeClasses(styles.barFill, scoreTone)}
            style={{ width: `${score ?? 0}%` }}
          />
        </div>
        {/*
          Same key/value shape as the Agent and Model rows below, so these read
          as two facts about the review rather than one broken sum. Each row
          names its unit: checks are what ran, findings are what they reported.
        */}
        <div className={styles.tallyList}>
          <div className={styles.tallyRow}>
            <Tooltip
              relationship="description"
              content="Rules the review ran against this agent. Each one passes, or raises one or more findings."
            >
              <span className={styles.tallyKey} tabIndex={0}>Checks</span>
            </Tooltip>
            <span className={styles.tallyValue}>
              {summary.passed} of {summary.rulesEvaluated} passed
            </span>
          </div>
          <div className={styles.tallyRow}>
            <Tooltip
              relationship="description"
              content="What those checks reported. One check can raise several findings, so this total will not match the check count."
            >
              <span className={styles.tallyKey} tabIndex={0}>Findings</span>
            </Tooltip>
            <span className={styles.legend}>
              <span className={styles.legendItem}>
                <i className={mergeClasses(styles.legendDot, styles.legendErr)} />
                {summary.errors} {summary.errors === 1 ? 'error' : 'errors'}
              </span>
              <span className={styles.legendItem}>
                <i className={mergeClasses(styles.legendDot, styles.legendWarn)} />
                {summary.warnings} warn
              </span>
              <span className={styles.legendItem}>
                <i className={mergeClasses(styles.legendDot, styles.legendInfo)} />
                {summary.infos} info
              </span>
            </span>
          </div>
        </div>
        <Text className={styles.scoreProvenance}>
          Deterministic rule outcomes + evaluation coverage; not a measure of answer quality.
        </Text>
        <div className={styles.scoreBadges}>
          {isLegacyScore && (
            <Badge appearance="tint" color="subtle" shape="circular">
              Legacy score — rerun recommended
            </Badge>
          )}
          {!isLegacyScore && isPartialScore && (
            <Badge appearance="tint" color="warning" shape="circular">
              Partial
            </Badge>
          )}
        </div>
      </div>

      <div className={styles.disclaimer}>
        <Badge
          appearance="tint"
          color="informative"
          shape="circular"
          icon={<SparkleRegular aria-hidden="true" />}
        >
          AI-generated content may be incorrect.
        </Badge>
      </div>

      <div className={styles.kv}>
        <div className={styles.kvRow}>
          <span className={styles.kvKey}>Agent</span>
          <span className={styles.kvValue}>{summary.agentName}</span>
        </div>
        <div className={styles.kvRow}>
          {/* Matches the "Powered by" column on the agents grid, so the same
              agent is described the same way on both screens. */}
          <span className={styles.kvKey}>Powered by</span>
          <span className={styles.kvValue}>
            <Badge appearance="tint" color="brand" size="small" shape="circular">
              {summary.harness === 'standard' ? 'Standard' : 'GitHub Copilot'}
            </Badge>
          </span>
        </div>
        <div className={styles.kvRow}>
          <span className={styles.kvKey}>Model</span>
          <span className={styles.kvValue}>
            <ModelProviderIcon provider={modelProvider(summary.model)} size={16} />
            {summary.model}
          </span>
        </div>
        <div className={styles.kvRow}>
          <span className={styles.kvKey}>Memory / Web search</span>
          <span className={mergeClasses(styles.kvValue, styles.kvQuiet)}>
            {summary.memoryEnabled ? 'On' : 'Off'} / {summary.webSearchEnabled ? 'On' : 'Off'}
          </span>
        </div>
        <div className={styles.kvRow}>
          <span className={styles.kvKey}>Rules evaluated</span>
          <span className={styles.kvValue}>{summary.rulesEvaluated}</span>
        </div>
        <div className={styles.kvRow}>
          <span className={styles.kvKey}>Duration</span>
          <span className={mergeClasses(styles.kvValue, styles.kvQuiet)}>{summary.duration}</span>
        </div>
        <div className={styles.kvRow}>
          <span className={styles.kvKey}>Reviewed by</span>
          <span className={styles.kvValue}>
            <Avatar name={summary.reviewedBy} size={24} color="colorful" />
            {summary.reviewedBy}
          </span>
        </div>
      </div>

      <Text block className={styles.refs}>
        References cited:{' '}
        {citedSources.length > 0
          ? citedSources.map((source, index) => (
              <span key={source.key}>
                {index > 0 ? ' · ' : ''}
                <b>{source.count}</b> {source.label}
              </span>
            ))
          : 'None'}
      </Text>
      </aside>
    </>
  );
}
