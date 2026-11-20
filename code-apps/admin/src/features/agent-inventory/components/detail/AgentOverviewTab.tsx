import {
  Badge,
  Body1,
  Body1Strong,
  Button,
  Caption1,
  Card,
  CardHeader,
  makeStyles,
  MessageBar,
  MessageBarBody,
  mergeClasses,
  Spinner,
  Subtitle1,
  Subtitle2,
  Switch,
  tokens,
} from '@fluentui/react-components';
import {
  Checkmark16Regular,
  Info16Regular,
  Warning16Regular,
} from '@fluentui/react-icons';
import type { AgentOverviewModel, AgentUsageRecord, GovernancePostureItem } from '../../contracts/types';
import { BasicDataGrid } from '../shared/BasicDataGrid';
import type { BasicDataGridColumn } from '../shared/BasicDataGrid';
import { formatUsageWeekLabel } from '../../utils/usageAnalytics';
import { useAgentGeneratedDescription } from '../../hooks/useAgentGeneratedDescription';

const useStyles = makeStyles({
  root: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 65fr) minmax(0, 35fr)',
    gap: tokens.spacingHorizontalL,
    alignItems: 'stretch',
    '@media (max-width: 1300px)': {
      gridTemplateColumns: 'minmax(0, 1fr)',
    },
  },
  card: {
    width: '100%',
    boxSizing: 'border-box',
    padding: 0,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusXLarge,
    boxShadow: tokens.shadow2,
    backgroundColor: tokens.colorNeutralBackground1,
    overflow: 'hidden',
  },
  cardHeader: {
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM} 0`,
  },
  generatingDescription: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
  descriptionClamp: {
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 3,
    overflow: 'hidden',
  },
  cardBody: {
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM} ${tokens.spacingVerticalM}`,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  fieldGrid: {
    margin: 0,
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    columnGap: tokens.spacingHorizontalL,
    '@media (max-width: 600px)': {
      gridTemplateColumns: 'minmax(0, 1fr)',
    },
  },
  field: {
    minWidth: 0,
    minHeight: '64px',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: tokens.spacingVerticalXXS,
    padding: `${tokens.spacingVerticalS} 0`,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  fieldWide: {
    gridColumn: '1 / -1',
  },
  fieldLabel: {
    margin: 0,
  },
  fieldValue: {
    margin: 0,
    overflowWrap: 'anywhere',
  },
  metrics: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 0,
    '@media (max-width: 520px)': {
      gridTemplateColumns: 'minmax(0, 1fr)',
    },
  },
  metric: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalL}`,
    '&:not(:last-child)': {
      borderRight: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    },
    '&:first-child': {
      paddingLeft: 0,
    },
    '&:last-child': {
      paddingRight: 0,
    },
    '@media (max-width: 520px)': {
      padding: `${tokens.spacingVerticalS} 0`,
      borderRight: 'none',
      '&:not(:last-child)': {
        borderRight: 'none',
        borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
      },
    },
  },
  metricValue: {
    overflowWrap: 'anywhere',
  },
  metricChecked: {
    color: tokens.colorBrandForeground1,
  },
  metricHealthyValue: {
    color: tokens.colorPaletteGreenForeground1,
  },
  metricReviewValue: {
    color: tokens.colorPaletteDarkOrangeForeground1,
  },
  governanceGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  governanceItem: {
    minHeight: '60px',
    boxSizing: 'border-box',
    display: 'grid',
    gridTemplateColumns: '28px minmax(0, 1fr) auto',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    padding: tokens.spacingVerticalS,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  governanceIcon: {
    width: '28px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: tokens.borderRadiusCircular,
  },
  healthyIcon: {
    color: tokens.colorPaletteGreenForeground1,
    backgroundColor: tokens.colorPaletteGreenBackground1,
  },
  reviewIcon: {
    color: tokens.colorPaletteRedForeground1,
    backgroundColor: tokens.colorPaletteRedBackground1,
  },
  informativeIcon: {
    color: tokens.colorBrandForeground1,
    backgroundColor: tokens.colorBrandBackground2,
  },
  governanceCopy: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
  },
  fullWidthCard: {
    gridColumn: '1 / -1',
  },
  featuresGrid: {
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM} ${tokens.spacingVerticalM}`,
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    columnGap: tokens.spacingHorizontalL,
    '@media (max-width: 900px)': {
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    },
    '@media (max-width: 560px)': {
      gridTemplateColumns: 'minmax(0, 1fr)',
    },
  },
  feature: {
    minWidth: 0,
    minHeight: '56px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalS,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  indicator: {
    pointerEvents: 'none',
    flexShrink: 0,
  },
  featureCount: {
    whiteSpace: 'nowrap',
  },
  featureCounts: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    marginLeft: 'auto',
  },
  usageAction: {
    minWidth: '140px',
    whiteSpace: 'nowrap',
  },
  usageMetrics: {
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM} 0`,
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    gap: tokens.spacingHorizontalM,
    '@media (max-width: 760px)': {
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    },
  },
  usageMetric: {
    minWidth: 0,
    minHeight: '68px',
    padding: tokens.spacingVerticalM,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    boxShadow: tokens.shadow2,
  },
  usageContent: {
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM} ${tokens.spacingVerticalM}`,
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 2fr) minmax(260px, 1fr)',
    gap: tokens.spacingHorizontalL,
    '@media (max-width: 820px)': {
      gridTemplateColumns: 'minmax(0, 1fr)',
    },
  },
  usageGridCard: {
    minWidth: 0,
    padding: 0,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    boxShadow: 'none',
    backgroundColor: tokens.colorNeutralBackground1,
  },
  usageGridHeader: {
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM} 0`,
  },
  highlights: {
    padding: tokens.spacingVerticalM,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    display: 'flex',
    flexDirection: 'column',
  },
  highlight: {
    minHeight: '48px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
});

function displayDate(value?: string) {
  return value ? new Date(value).toLocaleString() : 'Not available';
}

function publishedValue(date?: string, publishedBy?: string) {
  if (!date) return 'Not available';
  return [displayDate(date), publishedBy].filter(Boolean).join(' · ');
}

function platformValue(poweredBy?: string) {
  if (poweredBy === 'Standard' || poweredBy === 'GitHub Copilot') return 'Copilot Studio';
  if (poweredBy === 'Copilot Chat') return 'Microsoft 365 Copilot';
  return 'Unknown';
}

function formatCredits(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

const usageSnapshotColumns: BasicDataGridColumn<AgentUsageRecord>[] = [
  { key: 'usageDate', label: 'Week', width: '116px', sortable: true, render: formatUsageWeekLabel, searchValue: formatUsageWeekLabel },
  { key: 'featureName', label: 'Feature', width: '170px', sortable: true, render: (row) => row.featureName || '-' },
  { key: 'users', label: 'Users', width: '72px', sortable: true, alignment: 'end', render: (row) => row.users.toLocaleString() },
  { key: 'billedCredits', label: 'Billed credits', width: '120px', sortable: true, alignment: 'end', render: (row) => row.billedCredits.toLocaleString() },
  { key: 'nonBilledCredits', label: 'Non-billed credits', width: '140px', sortable: true, alignment: 'end', render: (row) => row.nonBilledCredits.toLocaleString() },
];

interface SummaryField {
  label: string;
  value: string;
}

interface SummarySectionProps {
  fields: SummaryField[];
  styles: ReturnType<typeof useStyles>;
}

function SummarySection({ fields, styles }: SummarySectionProps) {
  return (
    <dl className={styles.fieldGrid}>
      {fields.map((field, index) => (
        <div
          key={field.label}
          className={mergeClasses(
            styles.field,
            fields.length % 2 === 1 && index === fields.length - 1 && styles.fieldWide,
          )}
        >
          <dt className={styles.fieldLabel}>
            <Body1Strong>{field.label}</Body1Strong>
          </dt>
          <dd className={styles.fieldValue}>
            <Body1>{field.value}</Body1>
          </dd>
        </div>
      ))}
    </dl>
  );
}

interface GovernanceGroupProps {
  title: string;
  items: GovernancePostureItem[];
  styles: ReturnType<typeof useStyles>;
}

function GovernanceGroup({ title, items, styles }: GovernanceGroupProps) {
  return (
    <section className={styles.governanceGroup}>
      <Body1Strong>{title}</Body1Strong>
      {items.map((item) => {
        const iconClass = item.state === 'healthy'
          ? styles.healthyIcon
          : item.state === 'review'
            ? styles.reviewIcon
            : styles.informativeIcon;
        const label = item.label === 'Connector Maker auth context'
          ? 'Maker auth context'
          : item.label;
        return (
          <div key={item.label} className={styles.governanceItem}>
            <span className={mergeClasses(styles.governanceIcon, iconClass)} aria-hidden="true">
              {item.state === 'healthy'
                ? <Checkmark16Regular />
                : item.state === 'review'
                  ? <Warning16Regular />
                  : <Info16Regular />}
            </span>
            <div className={styles.governanceCopy}>
              <Body1Strong>{label}</Body1Strong>
              <Caption1>{item.description}</Caption1>
            </div>
            <Badge
              appearance="ghost"
              color={item.state === 'healthy' ? 'success' : item.state === 'review' ? 'warning' : 'informative'}
              shape="rounded"
            >
              {item.badge}
            </Badge>
          </div>
        );
      })}
    </section>
  );
}

interface AgentOverviewTabProps {
  model: AgentOverviewModel;
  usagePending: boolean;
  usageError: boolean;
  showUsage: boolean;
  onViewUsage: () => void;
}

export function AgentOverviewTab({
  model,
  usagePending,
  usageError,
  showUsage,
  onViewUsage,
}: AgentOverviewTabProps) {
  const styles = useStyles();
  const { agent } = model;
  const generatedDescriptionQuery = useAgentGeneratedDescription(agent);
  const descriptionText = agent.description?.trim() || generatedDescriptionQuery.data?.trim();
  const healthySignals = model.governance.filter((item) => item.state === 'healthy').length;
  const reviewSignals = model.governance.filter((item) => item.state === 'review').length;
  const enabledCount = model.features.filter((feature) => feature.enabled).length;

  const summaryFields: SummaryField[] = [
    { label: 'Agent owner', value: agent.owner || 'Not available' },
    { label: 'Owner email', value: agent.ownerEmail || 'Not available' },
    { label: 'Environment name', value: agent.environmentName || 'Not available' },
    { label: 'Environment type', value: agent.environmentType || 'Not available' },
    { label: 'Powered by', value: agent.poweredBy || 'Not available' },
    { label: 'Orchestration', value: agent.orchestrationType || 'Not available' },
    { label: 'Model', value: agent.model || 'Not available' },
    { label: 'Authentication', value: agent.authenticationType || 'Not configured' },
    { label: 'Platform', value: platformValue(agent.poweredBy) },
    { label: 'Managed state', value: agent.managedState || 'Not available' },
    { label: 'Created', value: displayDate(agent.createdDate) },
    { label: 'Last published', value: publishedValue(agent.publishedDate, agent.publishedBy) },
  ];

  return (
    <section className={styles.root} aria-label="Agent overview">
      <Card className={styles.card} appearance="filled">
        <CardHeader
          className={styles.cardHeader}
          header={<Subtitle2 as="h2">Agent summary</Subtitle2>}
          description={
            generatedDescriptionQuery.isLoading
              ? (
                <span className={styles.generatingDescription}>
                  <Spinner size="tiny" />
                  <Caption1>Generating description for GitHub Copilot agent..</Caption1>
                </span>
              )
              : descriptionText
                ? <Caption1 className={styles.descriptionClamp} title={descriptionText}>{descriptionText}</Caption1>
                : undefined
          }
        />
        <div className={styles.cardBody}>
          <SummarySection fields={summaryFields} styles={styles} />
        </div>
      </Card>

      <Card className={styles.card} appearance="filled">
        <CardHeader
          className={styles.cardHeader}
          header={<Subtitle2 as="h2">Governance posture</Subtitle2>}
          description={<Caption1>Signals relevant to administrators</Caption1>}
        />
        <div className={styles.cardBody}>
          <div className={styles.metrics}>
            <div className={styles.metric}>
              <Subtitle1 className={mergeClasses(styles.metricValue, styles.metricChecked)}>
                {model.governance.length}
              </Subtitle1>
              <Caption1>Signals checked</Caption1>
            </div>
            <div className={styles.metric}>
              <Subtitle1 className={mergeClasses(styles.metricValue, styles.metricHealthyValue)}>
                {healthySignals}
              </Subtitle1>
              <Caption1>Healthy signals</Caption1>
            </div>
            <div className={styles.metric}>
              <Subtitle1 className={mergeClasses(styles.metricValue, styles.metricReviewValue)}>
                {reviewSignals}
              </Subtitle1>
              <Caption1>Needs review</Caption1>
            </div>
          </div>
          <GovernanceGroup
            title="Security and authentication"
            items={model.governance.slice(0, 2)}
            styles={styles}
          />
          <GovernanceGroup
            title="Readiness and activity"
            items={model.governance.slice(2)}
            styles={styles}
          />
        </div>
      </Card>

      <Card className={mergeClasses(styles.card, styles.fullWidthCard)} appearance="filled">
        <CardHeader
          className={styles.cardHeader}
          header={<Subtitle2 as="h2">Feature details</Subtitle2>}
          description={<Caption1>Capabilities detected from the agent configuration</Caption1>}
          action={(
            <div className={styles.featureCounts}>
              <Badge className={styles.featureCount} appearance="tint" color="success" shape="circular">
                {enabledCount} detected
              </Badge>
            </div>
          )}
        />
        <div className={styles.featuresGrid}>
          {model.features.map((feature) => (
            <div key={feature.label} className={styles.feature}>
              <Body1Strong>{feature.label}</Body1Strong>
              <Switch
                className={styles.indicator}
                checked={feature.enabled}
                disabled={!feature.known}
                tabIndex={-1}
                aria-label={`${feature.label}: ${feature.known ? (feature.enabled ? 'enabled' : 'disabled') : 'not available'}`}
              />
            </div>
          ))}
        </div>
      </Card>

      {showUsage && (
        <Card className={mergeClasses(styles.card, styles.fullWidthCard)} appearance="filled">
          <CardHeader
            className={styles.cardHeader}
            header={<Subtitle2 as="h2">Usage snapshot</Subtitle2>}
            description={<Caption1>Credit usage at a glance· Last 180 days</Caption1>}
            action={(
              <Button className={styles.usageAction} appearance="outline" onClick={onViewUsage}>
                View usage details
              </Button>
            )}
          />
          {usagePending ? (
            <Spinner label="Loading usage snapshot" />
          ) : usageError ? (
            <MessageBar intent="warning">
              <MessageBarBody>Usage history is currently unavailable.</MessageBarBody>
            </MessageBar>
          ) : (
            <>
              <div className={styles.usageMetrics}>
                <div className={styles.usageMetric} style={{ borderInlineStart: `${tokens.strokeWidthThicker} solid #637CEF` }}>
                  <Subtitle1>{formatCredits(model.usage.billedCredits + model.usage.nonBilledCredits)}</Subtitle1>
                  <Caption1>Total credits</Caption1>
                </div>
                <div className={styles.usageMetric} style={{ borderInlineStart: `${tokens.strokeWidthThicker} solid #E3008C` }}>
                  <Subtitle1>{formatCredits(model.usage.billedCredits)}</Subtitle1>
                  <Caption1>Billed credits</Caption1>
                </div>
                <div className={styles.usageMetric} style={{ borderInlineStart: `${tokens.strokeWidthThicker} solid #13A10E` }}>
                  <Subtitle1>{formatCredits(model.usage.nonBilledCredits)}</Subtitle1>
                  <Caption1>Non-billed credits</Caption1>
                </div>
                <div className={styles.usageMetric} style={{ borderInlineStart: `${tokens.strokeWidthThicker} solid #9373C0` }}>
                  <Subtitle1>
                    {model.usage.lastUsage ? new Date(model.usage.lastUsage).toLocaleDateString() : 'Never'}
                  </Subtitle1>
                  <Caption1>Last usage</Caption1>
                </div>
              </div>
              <div className={styles.usageContent}>
                <BasicDataGrid
                  title="Recent usage"
                  subtitle="Latest weekly activity"
                  actions={<Badge appearance="tint" color="informative">Top 3</Badge>}
                  columns={usageSnapshotColumns}
                  records={model.usage.recent.slice(0, 3)}
                  getRecordId={(row) => row.id}
                  pageSize={3}
                  showSearch={false}
                  showPagination={false}
                  cardClassName={styles.usageGridCard}
                  headerClassName={styles.usageGridHeader}
                />
                <div className={styles.highlights}>
                  <Body1Strong>Usage highlights</Body1Strong>
                  <div className={styles.highlight}>
                    <Caption1>Top feature</Caption1>
                    <Body1Strong>{model.usage.topFeature || 'Not available'}</Body1Strong>
                  </div>
                  <div className={styles.highlight}>
                    <Caption1>Peak activity</Caption1>
                    <Body1Strong>{model.usage.peakActivity || 'Not available'}</Body1Strong>
                  </div>
                  <div className={styles.highlight}>
                    <Caption1>Credits per user</Caption1>
                    <Body1Strong>{formatCredits(model.usage.creditsPerUser)}</Body1Strong>
                  </div>
                  <div className={styles.highlight}>
                    <Caption1>Growth vs. prior period</Caption1>
                    <Body1Strong>
                      {model.usage.growth === undefined
                        ? 'Not available'
                        : `${model.usage.growth >= 0 ? '+' : ''}${model.usage.growth.toFixed(1)}%`}
                    </Body1Strong>
                  </div>
                </div>
              </div>
            </>
          )}
        </Card>
      )}
    </section>
  );
}
