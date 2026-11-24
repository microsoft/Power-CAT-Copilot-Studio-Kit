import { makeStyles, mergeClasses, tokens, Text, Subtitle2, Button, Spinner, Menu, MenuTrigger, MenuPopover, MenuList, MenuItem, Tooltip, Card, CardHeader, MenuDivider, Body1 } from '@fluentui/react-components';
import { MoreHorizontal24Regular, Delete24Regular, ArrowDownload24Regular, Lightbulb24Regular, ArrowClockwise20Regular, DataPie24Regular, ArrowReset24Regular, DataArea24Regular } from '@fluentui/react-icons';
import type { CardInstance, MetricDataset } from '../../types';
import { useAppStore } from '../../store/appStore';
import { ChartRenderer } from '../charts/ChartRenderer';
import { getCompatibleVizTypes, getVizLabel } from '../../utils/vizCompat';

/** Returns true if the dataset has no meaningful data to render. */
function isDatasetEmpty(data: MetricDataset): boolean {
  const hasPoints = data.points.length > 0;
  const hasCategorical = (data.categorical?.length ?? 0) > 0;

  // No data at all
  if (!hasPoints && !hasCategorical) return true;

  // All point values are zero and no meaningful categorical data — nothing to visualize
  const allPointsZero = hasPoints && data.points.every(p => p.value === 0);
  const allCategoricalZero = !hasCategorical || data.categorical!.every(c => c.value === 0);
  if (allPointsZero && allCategoricalZero) return true;

  return false;
}

const useStyles = makeStyles({
  card: {
    display: 'flex', flexDirection: 'column', height: '100%',
    overflow: 'hidden',
  },
  header: {
    cursor: 'move',
    userSelect: 'none',
  },
  headerContent: { flex: 1, overflow: 'hidden' },
  headerActions: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalXXS, flexShrink: 0 },
  title: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  titleRow: { display: 'flex', flexDirection: 'column', overflow: 'hidden', gap: '0px' },
  description: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200, lineHeight: tokens.lineHeightBase200, marginTop: '-2px' },
  body: { flex: 1, overflow: 'hidden', paddingTop: tokens.spacingVerticalS, paddingBottom: tokens.spacingVerticalM, paddingLeft: tokens.spacingHorizontalM, paddingRight: tokens.spacingHorizontalM, position: 'relative', minHeight: '250px' },
  empty: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: tokens.colorNeutralForeground3 },
  emptyState: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    height: '100%', gap: tokens.spacingVerticalS, color: tokens.colorNeutralForeground3,
    textAlign: 'center', paddingLeft: tokens.spacingHorizontalL, paddingRight: tokens.spacingHorizontalL,
  },
  emptyIcon: { fontSize: '32px', color: tokens.colorNeutralForeground4 },
  refreshSpin: { animationName: { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } }, animationDuration: '0.8s', animationIterationCount: 'infinite', animationTimingFunction: 'linear' },
  cardNew: {
    '@media (prefers-reduced-motion: no-preference)': {
      animationName: {
        from: { opacity: 0, transform: 'translateY(-8px)' },
        to: { opacity: 1, transform: 'translateY(0)' },
      },
      animationDuration: '300ms',
      animationTimingFunction: 'cubic-bezier(0, 0, 0, 1)',
      animationFillMode: 'backwards',
    },
  },
});

interface Props { card: CardInstance; isNew?: boolean }

export function MetricCardTile({ card, isNew }: Props) {
  const s = useStyles();
  const metric = useAppStore(st => st.metrics.find(m => m.id === card.metricId));
  const data = useAppStore(st => st.datasets[card.metricId]);
  const loading = useAppStore(st => st.loadingDatasets[card.metricId]);
  const removeCard = useAppStore(st => st.removeCard);
  const setCardViz = useAppStore(st => st.setCardViz);
  const openPredictive = useAppStore(st => st.openPredictive);
  const loadDataset = useAppStore(st => st.loadDataset);
  const filters = useAppStore(st => st.filters);

  if (!metric) return (
    <Card className={s.card} focusMode="off">
      <div className={`${s.header} ams-card-drag-handle`}>
        <CardHeader
          header={<Text as="h3" className={s.title} weight="semibold">Unknown metric</Text>}
          action={
            <Menu>
              <MenuTrigger>
                <Button
                  appearance="subtle"
                  size="small"
                  icon={<MoreHorizontal24Regular />}
                  className="ams-card-no-drag"
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                />
              </MenuTrigger>
              <MenuPopover>
                <MenuList>
                  <MenuItem icon={<Delete24Regular />} onClick={() => removeCard(card.instanceId)}>Remove</MenuItem>
                </MenuList>
              </MenuPopover>
            </Menu>
          }
        />
      </div>
      <div className={s.body}>
        <div className={s.empty}>Metric not found</div>
      </div>
    </Card>
  );

  const description = metric.description || `${metric.aggregation} of ${metric.sourceField} from ${metric.sourceTable}`;

  return (
    <Card className={mergeClasses(s.card, isNew && s.cardNew)} focusMode="off">
      <div className={`${s.header} ams-card-drag-handle`}>
        <CardHeader
          header={
            <span className={s.titleRow}>
              <Subtitle2 as="h3" className={s.title} title={metric.name}>{metric.name}</Subtitle2>
              <Text className={s.description} title={description}>{description}</Text>
            </span>
          }
          action={
            <div className="ams-card-no-drag" onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
              <Tooltip content="Refresh data" relationship="label">
                <Button
                  appearance="subtle"
                  size="small"
                  icon={<ArrowClockwise20Regular className={loading ? s.refreshSpin : undefined} />}
                  onClick={() => loadDataset(card.metricId, true)}
                  disabled={loading}
                />
              </Tooltip>
              <Menu>
                <MenuTrigger>
                  <Button
                    appearance="subtle"
                    size="small"
                    icon={<MoreHorizontal24Regular />}
                  />
                </MenuTrigger>
              <MenuPopover>
                <MenuList>
                  <MenuItem icon={<Lightbulb24Regular />} onClick={() => openPredictive(metric.id)}>Forecast this metric</MenuItem>
                  {(() => {
                    const currentViz = card.overrideViz ?? metric.visualizationType;
                    const compatibleTypes = getCompatibleVizTypes(currentViz, data);
                    if (compatibleTypes.length > 0) return (
                      <Menu>
                        <MenuTrigger disableButtonEnhancement>
                          <MenuItem icon={<DataPie24Regular />}>Change chart type</MenuItem>
                        </MenuTrigger>
                        <MenuPopover>
                          <MenuList>
                            {compatibleTypes.map(vizType => (
                              <MenuItem
                                key={vizType}
                                onClick={() => setCardViz(card.instanceId, vizType)}
                              >
                                {getVizLabel(vizType)}
                              </MenuItem>
                            ))}
                            {card.overrideViz && (
                              <>
                                <MenuDivider />
                                <MenuItem
                                  icon={<ArrowReset24Regular />}
                                  onClick={() => setCardViz(card.instanceId, undefined)}
                                >
                                  Reset to default
                                </MenuItem>
                              </>
                            )}
                          </MenuList>
                        </MenuPopover>
                      </Menu>
                    );
                    return null;
                  })()}
                  {data && (
                    <MenuItem icon={<ArrowDownload24Regular />} onClick={async () => {
                      const { exportService } = await import('../../services/exportService');
                      exportService.exportCardExcel(metric, data, filters);
                    }}>
                      Download data (Excel)
                    </MenuItem>
                  )}
                  <MenuItem icon={<Delete24Regular />} onClick={() => removeCard(card.instanceId)}>Remove</MenuItem>
                </MenuList>
              </MenuPopover>
            </Menu>
            </div>
          }
        />
      </div>
      <div className={s.body}>
        {loading && <div className={s.empty}><Spinner size="tiny" label="Loading…" /></div>}
        {!loading && !data && <div className={s.empty}>No data</div>}
        {!loading && data && isDatasetEmpty(data) && (
          <div className={s.emptyState}>
            <DataArea24Regular className={s.emptyIcon} />
            <Body1>No data available for the selected filters.</Body1>
          </div>
        )}
        {!loading && data && !isDatasetEmpty(data) && <ChartRenderer metric={metric} data={data} overrideViz={card.overrideViz} filters={filters} />}
      </div>
    </Card>
  );
}
