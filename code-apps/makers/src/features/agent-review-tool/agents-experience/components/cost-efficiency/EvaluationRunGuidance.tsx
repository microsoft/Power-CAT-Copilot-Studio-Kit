import {
  Badge,
  Body1,
  Caption1,
  Subtitle2,
  Title3,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { formatCount } from '../../services/cost-efficiency/costDisplay';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    minWidth: 0,
  },
  headingRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  intro: {
    color: tokens.colorNeutralForeground2,
    margin: 0,
  },
  card: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    columnGap: tokens.spacingHorizontalXXL,
    rowGap: tokens.spacingVerticalM,
    padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalL}`,
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  figure: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    minWidth: 0,
  },
  value: {
    fontVariantNumeric: 'tabular-nums',
  },
  label: {
    color: tokens.colorNeutralForeground3,
  },
  empty: {
    color: tokens.colorNeutralForeground2,
    margin: 0,
  },
});

export interface EvaluationRunGuidanceProps {
  testCases: number;
  headingLevel?: 'h3' | 'h4';
}

/** Shows validation coverage without inferring runtime tasks from test-case count. */
export function EvaluationRunGuidance({
  testCases,
  headingLevel = 'h3',
}: EvaluationRunGuidanceProps) {
  const styles = useStyles();

  return (
    <section className={styles.root} aria-labelledby="cost-evaluation-heading">
      <div className={styles.headingRow}>
        <Subtitle2 as={headingLevel} id="cost-evaluation-heading">
          Plan one evaluation pass
        </Subtitle2>
        <Badge appearance="tint" color="informative" shape="rounded" size="small">
          Consumption varies
        </Badge>
      </div>
      <Body1 as="p" className={styles.intro}>
        Run the same saved test cases before and after one focused change.
        {' '}Saved case count alone cannot determine the Copilot Credits consumed by a pass.
      </Body1>

      {testCases === 0 ? (
        <Body1 as="p" className={styles.empty}>
          This review has no saved test cases. Add representative cases before
          {' '}changing the configuration for efficiency.
        </Body1>
      ) : (
        <div className={styles.card}>
          <div className={styles.figure}>
            <Caption1 className={styles.label}>Saved test cases</Caption1>
            <Title3 as="p" className={styles.value}>{formatCount(testCases)}</Title3>
          </div>
        </div>
      )}

      <Caption1 className={styles.label}>
        A test case can contain multiple interactions and runtime tasks. Review
        {' '}recorded credit consumption after each pass instead of treating case
        {' '}count as task count.
      </Caption1>
    </section>
  );
}
