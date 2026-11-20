import {
  Badge,
  Body1,
  Caption1,
  Field,
  Input,
  Radio,
  RadioGroup,
  Subtitle2,
  Title1,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import type {
  CostEstimate,
  CostScenario,
  MonthlyTaskParseResult,
} from '../../contracts/CostEfficiency';
import { PUBLISHED_CREDIT_RANGES, PUBLISHED_SCENARIO_DESCRIPTORS, SCENARIO_ORDER } from '../../services/cost-efficiency/buildCostEfficiencyReview';
import {
  formatCount,
  formatCreditRange,
  formatPaygAmount,
  titleCase,
} from '../../services/cost-efficiency/costDisplay';

/**
 * Derives the scenario choices from the published ranges.
 *
 * This text feeds both the visible hint and every segment's accessible name, so
 * hardcoded price prose here could silently drift from the published source.
 */
const SCENARIO_OPTIONS: ReadonlyArray<{
  value: CostScenario;
  label: string;
  range: string;
  criteria: string;
}> = SCENARIO_ORDER.map(value => {
  const published = formatCreditRange(PUBLISHED_CREDIT_RANGES[value]);
  // The formatter capitalizes an open-ended range, but this reads mid-sentence.
  const inline = published.startsWith('More than')
    ? `more than${published.slice('More than'.length)}`
    : published;
  return {
    value,
    label: titleCase(value),
    range: `${inline} credits per task`,
    criteria: PUBLISHED_SCENARIO_DESCRIPTORS[value].criteria.join(', '),
  };
});

const useStyles = makeStyles({
  hero: {
    display: 'grid',
    position: 'relative',
    gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)',
    alignItems: 'start',
    columnGap: tokens.spacingHorizontalXXL,
    rowGap: tokens.spacingVerticalL,
    backgroundColor: tokens.colorBrandBackground2,
    border: `1px solid ${tokens.colorBrandStroke2}`,
    borderRadius: tokens.borderRadiusXLarge,
    padding: `${tokens.spacingVerticalXL} ${tokens.spacingHorizontalXL}`,
    '@media (max-width: 839px)': {
      gridTemplateColumns: 'minmax(0, 1fr)',
    },
  },
  result: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    minWidth: 0,
  },
  headline: {
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    minWidth: 0,
  },
  eyebrow: {
    color: tokens.colorNeutralForeground2,
    textTransform: 'uppercase',
    letterSpacing: '0.4px',
    fontWeight: tokens.fontWeightSemibold,
  },
  eyebrowRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  headlineValue: {
    margin: 0,
    color: tokens.colorNeutralForeground1,
    fontVariantNumeric: 'tabular-nums',
    overflowWrap: 'anywhere',
    '@media (max-width: 479px)': {
      '& .fui-Title1': {
        fontSize: tokens.fontSizeHero700,
        lineHeight: tokens.lineHeightHero700,
      },
    },
  },
  payg: {
    color: tokens.colorNeutralForeground2,
    fontVariantNumeric: 'tabular-nums',
  },
  note: {
    color: tokens.colorNeutralForeground3,
    marginTop: tokens.spacingVerticalS,
  },
  subFacts: {
    display: 'flex',
    flexWrap: 'wrap',
    columnGap: tokens.spacingHorizontalXXL,
    rowGap: tokens.spacingVerticalS,
    margin: 0,
    marginTop: tokens.spacingVerticalM,
    paddingTop: tokens.spacingVerticalM,
    borderTop: `1px solid ${tokens.colorBrandStroke2}`,
  },
  subFact: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    minWidth: 0,
  },
  subFactLabel: {
    margin: 0,
    color: tokens.colorNeutralForeground3,
  },
  subFactValue: {
    margin: 0,
    color: tokens.colorNeutralForeground1,
    fontVariantNumeric: 'tabular-nums',
  },
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    minWidth: 0,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingVerticalL,
  },
  field: {
    minWidth: 0,
    width: '100%',
    flexBasis: '100%',
  },
  input: {
    minHeight: '44px',
    width: '100%',
  },
  scenarios: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'stretch',
    width: '100%',
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
  },
  radio: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 0,
    minHeight: '44px',
    alignItems: 'center',
    paddingRight: 0,
  },
  // Separates the segments without a double border on the container edge.
  segmentDivider: {
    borderLeft: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  // The segment fill replaces the radio circle. The native input stays in the
  // DOM, so keyboard and screen-reader behaviour is unchanged.
  radioIndicator: {
    display: 'none',
  },
  // Fluent's radio input is fixed at 32px, so stretching the label is what
  // makes the whole 44px row an activation target. Do not remove.
  radioLabel: {
    alignSelf: 'stretch',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    textAlign: 'center',
    cursor: 'pointer',
    color: tokens.colorNeutralForeground2,
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: tokens.spacingHorizontalS,
    paddingRight: tokens.spacingHorizontalS,
    marginTop: 0,
    marginBottom: 0,
  },
  segmentFirst: {
    borderTopLeftRadius: tokens.borderRadiusMedium,
    borderBottomLeftRadius: tokens.borderRadiusMedium,
  },
  segmentLast: {
    borderTopRightRadius: tokens.borderRadiusMedium,
    borderBottomRightRadius: tokens.borderRadiusMedium,
  },
  // Forced-colors mode drops author backgrounds, so the selected segment also
  // takes system Highlight colours. Without this the selection is invisible.
  radioLabelSelected: {
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorNeutralForeground1,
    fontWeight: tokens.fontWeightSemibold,
    // Hiding the indicator removed the only >=3:1 non-text cue, so the selected
    // segment carries a brand-stroke underline instead (SC 1.4.11).
    boxShadow: `inset 0 -2px 0 0 ${tokens.colorCompoundBrandStroke}`,
    // Fluent styles this label through a 4-class sibling selector, so an author
    // `color` here loses the cascade. Do not set `forced-color-adjust: none`:
    // that would keep the unreadable author background while the paired text
    // colour is ignored. Let the user agent supply the readable pair and mark
    // selection with an outline, which has no competing Fluent rule.
    '@media (forced-colors: active)': {
      outline: '2px solid CanvasText',
      outlineOffset: '-2px',
    },
  },
  visuallyHidden: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap',
    border: 0,
  },
});

function isCostScenario(value: string): value is CostScenario {
  return value === 'light' || value === 'medium' || value === 'heavy';
}

export interface CostEstimateHeroProps {
  monthlyTasksInput: string;
  scenario: CostScenario;
  parseResult: MonthlyTaskParseResult;
  estimate?: CostEstimate;
  onMonthlyTasksInputChange: (value: string) => void;
  onScenarioChange: (scenario: CostScenario) => void;
  headingLevel?: 'h3' | 'h4';
}

/** Leads the tab with the estimated result and the inputs that produce it. */
export function CostEstimateHero({
  monthlyTasksInput,
  scenario,
  parseResult,
  estimate,
  onMonthlyTasksInputChange,
  onScenarioChange,
  headingLevel = 'h3',
}: CostEstimateHeroProps) {
  const styles = useStyles();
  const selectedScenario = SCENARIO_OPTIONS.find(option => option.value === scenario)
    ?? SCENARIO_OPTIONS[1];
  const creditsPerTask = formatCreditRange(
    estimate ? estimate.creditsPerTask : PUBLISHED_CREDIT_RANGES[scenario],
  );
  const monthlyCredits = estimate ? formatCreditRange(estimate.monthlyCredits) : '\u2014';
  const publicPayg = estimate ? formatPaygAmount(estimate.publicPaygCostCents) : '\u2014';
  const monthlyTasks = estimate ? formatCount(estimate.monthlyTasks) : '\u2014';
  const estimateAnnouncement = estimate
    ? `${scenario} scenario for ${monthlyTasks} monthly tasks: `
      + `${monthlyCredits} estimated monthly credits; ${publicPayg} public PAYG equivalent.`
    : '';

  return (
    <div className={styles.hero}>
      <div className={styles.result}>
        <dl className={styles.headline}>
          <dt className={styles.eyebrowRow}>
            <Caption1 className={styles.eyebrow}>Estimated monthly credits</Caption1>
            <Badge appearance="outline" shape="rounded" size="small">
              Not agent-specific
            </Badge>
          </dt>          <dd className={styles.headlineValue}>
            <Title1 as="span">{monthlyCredits}</Title1>
          </dd>
        </dl>
        <Body1 as="p" className={styles.payg}>
          {publicPayg} at public pay-as-you-go
        </Body1>
        <Caption1 as="p" className={styles.note}>
          Planning estimate. This figure uses only the task volume and band you choose,
          {' '}so it is the same for any agent at the same settings. It is not derived
          {' '}from this agent&apos;s transcripts or from actual billed usage. For figures specific
          {' '}to this agent, open How do I validate it? for the evaluation run cost.
          {' '}For actual capability use, open What did we observe?
        </Caption1>
        <dl className={styles.subFacts}>
          <div className={styles.subFact}>
            <dt className={styles.subFactLabel}><Caption1>Credits per task</Caption1></dt>
            <dd className={styles.subFactValue}>
              <Subtitle2 as="span">{creditsPerTask}</Subtitle2>
            </dd>
          </div>
          <div className={styles.subFact}>
            <dt className={styles.subFactLabel}><Caption1>Monthly tasks</Caption1></dt>
            <dd className={styles.subFactValue}>
              <Subtitle2 as="span">{monthlyTasks}</Subtitle2>
            </dd>
          </div>
          <div className={styles.subFact}>
            <dt className={styles.subFactLabel}><Caption1>Scenario</Caption1></dt>
            <dd className={styles.subFactValue}>
              <Subtitle2 as="span">{titleCase(scenario)}</Subtitle2>
            </dd>
          </div>
        </dl>
      </div>
      <section className={styles.panel} aria-labelledby="cost-planning-heading">
        <Subtitle2 as={headingLevel} id="cost-planning-heading">
          Plan a monthly scenario
        </Subtitle2>
        <Field
          className={styles.field}
          label="Monthly agent tasks"
          hint="Include user and autonomous tasks. One conversation can contain several tasks."
          required
          validationState={parseResult.valid ? 'none' : 'error'}
          validationMessage={parseResult.valid ? undefined : parseResult.message}
        >
          <Input
            className={styles.input}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            required
            value={monthlyTasksInput}
            onChange={(_, data) => onMonthlyTasksInputChange(data.value)}
          />
        </Field>
        <Field
          className={styles.field}
          label="Runtime scenario"
          hint={`${titleCase(scenario)} = ${selectedScenario.range}. Microsoft defines this band as: ${selectedScenario.criteria}.`}
        >
          <RadioGroup
            className={styles.scenarios}
            value={scenario}
            onChange={(_, data) => {
              if (isCostScenario(data.value)) onScenarioChange(data.value);
            }}
          >
            {SCENARIO_OPTIONS.map((option, index) => (
              <Radio
                key={option.value}
                className={mergeClasses(
                  styles.radio,
                  index > 0 && styles.segmentDivider,
                )}
                value={option.value}
                indicator={{ className: styles.radioIndicator }}
                input={{ 'aria-label': `${option.label}, ${option.range}, ${option.criteria}` }}
                label={{
                  children: option.label,
                  className: mergeClasses(
                    styles.radioLabel,
                    index === 0 && styles.segmentFirst,
                    index === SCENARIO_OPTIONS.length - 1 && styles.segmentLast,
                    scenario === option.value && styles.radioLabelSelected,
                  ),
                }}
              />
            ))}
          </RadioGroup>
        </Field>
      </section>
      <span
        className={styles.visuallyHidden}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {estimateAnnouncement}
      </span>
    </div>
  );
}
