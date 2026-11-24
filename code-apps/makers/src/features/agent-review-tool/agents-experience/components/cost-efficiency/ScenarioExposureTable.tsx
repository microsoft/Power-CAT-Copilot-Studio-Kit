import {
  Body1,
  Body1Strong,
  Caption1,
  Subtitle2,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import type { ScenarioExposure } from '../../contracts/CostEfficiency';
import {
  formatCreditRange,
  formatPaygAmount,
  titleCase,
} from '../../services/cost-efficiency/costDisplay';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    minWidth: 0,
  },
  intro: {
    color: tokens.colorNeutralForeground2,
    margin: 0,
  },
  desktopTable: {
    width: '100%',
    '@media (max-width: 599px)': {
      display: 'none',
    },
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  definitionCell: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    maxWidth: '320px',
  },
  definitionText: {
    color: tokens.colorNeutralForeground2,
  },
  criteriaList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalXS,
    listStyleType: 'none',
    margin: 0,
    padding: 0,
  },
  criteriaItem: {
    backgroundColor: tokens.colorNeutralBackground3,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    color: tokens.colorNeutralForeground2,
    padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalS}`,
  },
  source: {
    color: tokens.colorNeutralForeground3,
    margin: 0,
  },
  cell: {
    textAlign: 'left',
    verticalAlign: 'top',
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  numericCell: {
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },
  headerCell: {
    color: tokens.colorNeutralForeground3,
    fontWeight: tokens.fontWeightSemibold,
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
  },
  // Selection must not rely on the fill alone, so the row also carries a text
  // marker in its first cell (SC 1.4.1).
  //
  // In forced-colors mode the row keeps the user agent correction. Fluent sets
  // the descendant text colour from theme variables that forced colors do not
  // remap, so pairing a `Highlight` fill with `forced-color-adjust: none` would
  // strand unreadable text. An outline marks the row without competing with any
  // Fluent rule.
  selectedRow: {
    backgroundColor: tokens.colorBrandBackground2,
    '@media (forced-colors: active)': {
      outline: '2px solid CanvasText',
      outlineOffset: '-2px',
    },
  },
  scenarioCell: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
  },
  marker: {
    color: tokens.colorNeutralForeground2,
  },
  mobileList: {
    display: 'none',
    '@media (max-width: 599px)': {
      display: 'flex',
      flexDirection: 'column',
      gap: tokens.spacingVerticalM,
    },
  },
  mobileRecord: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    minWidth: 0,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingVerticalM,
  },
  mobileSelectedRecord: {
    backgroundColor: tokens.colorBrandBackground2,
    border: `1px solid ${tokens.colorBrandStroke2}`,
    '@media (forced-colors: active)': {
      outline: '2px solid CanvasText',
      outlineOffset: '-2px',
    },
  },
  mobileRecordHeader: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalS,
  },
  mobileDetails: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    minWidth: 0,
    margin: 0,
  },
  mobileDetail: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    minWidth: 0,
  },
  mobileTerm: {
    color: tokens.colorNeutralForeground3,
  },
  mobileDefinition: {
    minWidth: 0,
    margin: 0,
    overflowWrap: 'anywhere',
  },
});

export interface ScenarioExposureTableProps {
  exposure: ScenarioExposure[];
  headingLevel?: 'h3' | 'h4';
}

/**
 * Shows every published band at the reviewer's task volume.
 *
 * The guide ties credit consumption to task complexity, so the selected band is
 * an assumption. Presenting all three bands shows the full planning range
 * instead of implying the selected figure was measured.
 */
export function ScenarioExposureTable({
  exposure,
  headingLevel = 'h3',
}: ScenarioExposureTableProps) {
  const styles = useStyles();

  return (
    <section className={styles.root} aria-labelledby="cost-exposure-heading">
      <Subtitle2 as={headingLevel} id="cost-exposure-heading">
        Range across every published scenario
      </Subtitle2>
      <Body1 as="p" className={styles.intro}>
        Every figure below is published by Microsoft. The band depends on the work
        {' '}the agent performs, so compare your expected task mix against the
        {' '}published definitions before you trust one row.
      </Body1>
      <div className={styles.desktopTable}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col" className={mergeClasses(styles.cell, styles.headerCell)}>
                <Caption1>Scenario</Caption1>
              </th>
              <th scope="col" className={mergeClasses(styles.cell, styles.headerCell)}>
                <Caption1>What Microsoft counts as this scenario</Caption1>
              </th>
              <th scope="col" className={mergeClasses(styles.cell, styles.headerCell)}>
                <Caption1>Credits per task</Caption1>
              </th>
              <th scope="col" className={mergeClasses(styles.cell, styles.headerCell)}>
                <Caption1>Monthly credits</Caption1>
              </th>
              <th scope="col" className={mergeClasses(styles.cell, styles.headerCell)}>
                <Caption1>Public PAYG</Caption1>
              </th>
            </tr>
          </thead>
          <tbody>
            {exposure.map(row => (
              <tr
                key={row.scenario}
                className={row.selected ? styles.selectedRow : undefined}
              >
                <th scope="row" className={styles.cell}>
                  <span className={styles.scenarioCell}>
                    <Body1>{titleCase(row.scenario)}</Body1>
                    {row.selected ? (
                      <Caption1 className={styles.marker}>Selected</Caption1>
                    ) : null}
                  </span>
                </th>
                <td className={styles.cell}>
                  <span className={styles.definitionCell}>
                    <Caption1 className={styles.definitionText}>{row.definition}</Caption1>
                    <ul className={styles.criteriaList}>
                      {row.criteria.map(item => (
                        <li key={item} className={styles.criteriaItem}>
                          <Caption1>{item}</Caption1>
                        </li>
                      ))}
                    </ul>
                  </span>
                </td>
                <td className={mergeClasses(styles.cell, styles.numericCell)}>
                  <Body1>{formatCreditRange(row.creditsPerTask)}</Body1>
                </td>
                <td className={mergeClasses(styles.cell, styles.numericCell)}>
                  <Body1>{formatCreditRange(row.monthlyCredits)}</Body1>
                </td>
                <td className={mergeClasses(styles.cell, styles.numericCell)}>
                  <Body1>{formatPaygAmount(row.publicPaygCostCents)}</Body1>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div
        aria-label="Scenario comparison"
        className={styles.mobileList}
        role="list"
      >
        {exposure.map(row => (
          <div
            className={mergeClasses(
              styles.mobileRecord,
              row.selected ? styles.mobileSelectedRecord : undefined,
            )}
            key={`mobile:${row.scenario}`}
            role="listitem"
          >
            <div className={styles.mobileRecordHeader}>
              <Body1Strong as="h5">{titleCase(row.scenario)}</Body1Strong>
              {row.selected ? (
                <Caption1 className={styles.marker}>Selected</Caption1>
              ) : null}
            </div>
            <dl className={styles.mobileDetails}>
              <div className={styles.mobileDetail}>
                <dt className={styles.mobileTerm}>
                  <Caption1>What Microsoft counts as this scenario</Caption1>
                </dt>
                <dd className={styles.mobileDefinition}>
                  <Caption1 className={styles.definitionText}>
                    {row.definition}
                  </Caption1>
                  <ul className={styles.criteriaList}>
                    {row.criteria.map(item => (
                      <li key={`mobile:${row.scenario}:${item}`} className={styles.criteriaItem}>
                        <Caption1>{item}</Caption1>
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
              <div className={styles.mobileDetail}>
                <dt className={styles.mobileTerm}><Caption1>Credits per task</Caption1></dt>
                <dd className={styles.mobileDefinition}>
                  <Body1>{formatCreditRange(row.creditsPerTask)}</Body1>
                </dd>
              </div>
              <div className={styles.mobileDetail}>
                <dt className={styles.mobileTerm}><Caption1>Monthly credits</Caption1></dt>
                <dd className={styles.mobileDefinition}>
                  <Body1>{formatCreditRange(row.monthlyCredits)}</Body1>
                </dd>
              </div>
              <div className={styles.mobileDetail}>
                <dt className={styles.mobileTerm}><Caption1>Public PAYG</Caption1></dt>
                <dd className={styles.mobileDefinition}>
                  <Body1>{formatPaygAmount(row.publicPaygCostCents)}</Body1>
                </dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
      <Caption1 as="p" className={styles.source}>
        Source: Microsoft Learn — Manage costs for agents powered by the
        {' '}Microsoft Copilot harness. Definitions and credit ranges
        {' '}are quoted, not derived.
      </Caption1>
    </section>
  );
}
