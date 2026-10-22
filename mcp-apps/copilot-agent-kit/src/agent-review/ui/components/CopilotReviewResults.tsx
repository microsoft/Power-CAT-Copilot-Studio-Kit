import { useEffect, useRef, useState } from 'react';
import {
  Badge,
  Button,
  Tab,
  TabList,
  Tooltip,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import { normalizeReviewTab, type CopilotReviewResultsProps, type ReviewNodeFilter, type ReviewTabId } from '../contracts.js';
import { FindingsTab } from './FindingsTab.js';
import { InlineFindingsPreview } from './InlineFindingsPreview.js';
import { SummaryRail } from './SummaryRail.js';
import { ReviewAgentMap } from './ReviewAgentMap.js';

const fill = {
  display: 'flex',
  flexDirection: 'column',
  flexGrow: 1,
  flexShrink: 1,
  flexBasis: 'auto',
  minWidth: 0,
  minHeight: 0,
} as const;

const useStyles = makeStyles({
  layout: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 316px',
    gap: tokens.spacingHorizontalL,
    alignItems: 'start',
    '@media (max-width: 840px)': {
      gridTemplateColumns: '1fr',
    },
  },
  mapLayout: { gridTemplateColumns: 'minmax(0, 1fr)' },
  // Inline, the result fills the height that the host gives the widget and nothing scrolls.
  inlineLayout: { ...fill, alignItems: 'stretch', overflowX: 'hidden', overflowY: 'hidden' },
  inlineCard: { ...fill },
  inlinePanel: { ...fill, overflowX: 'hidden', overflowY: 'hidden' },
  contentCard: {
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: '12px',
    boxShadow: tokens.shadow2,
    overflow: 'hidden',
    paddingBottom: tokens.spacingVerticalS,
  },
  contentCardInline: {
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '0',
    boxShadow: 'none',
  },
  tabBar: {
    padding: `${tokens.spacingVerticalSNudge} ${tokens.spacingHorizontalM} 0`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke3}`,
    flexWrap: 'wrap',
    flexShrink: 0,
    rowGap: tokens.spacingVerticalXS,
    '& [role="tab"]': { minHeight: 'unset' },
  },
  tabCount: { marginLeft: tokens.spacingHorizontalSNudge },
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
  loadMore: {
    display: 'flex',
    justifyContent: 'center',
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM}`,
  },
});

export function CopilotReviewResults({
  model,
  activeTab,
  showSummary = true,
  onTabChange,
  onOpenFinding,
  reviewId,
  mapNavigation,
  onMapNavigationChange,
  nodeFilter,
  onNodeFilterChange,
  onActivateNode,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  fullscreenAvailable = false,
  onViewAllFindings,
  onOpenFullscreen,
}: CopilotReviewResultsProps) {
  const styles = useStyles();
  const inline = !showSummary;
  const selectedTab = normalizeReviewTab(activeTab);
  const [focusFindingId, setFocusFindingId] = useState<string | null>(null);
  const [localNodeFilter, setLocalNodeFilter] = useState<ReviewNodeFilter | null>(null);
  const resultIdentity = reviewId ?? model.agentMap?.reviewId;
  const intendedNodeFilter = nodeFilter === undefined ? localNodeFilter : nodeFilter;
  const savedNodeFilter = intendedNodeFilter?.reviewId === resultIdentity ? intendedNodeFilter : null;
  const selectedNode = savedNodeFilter && model.agentMap?.state === 'ready'
    ? model.agentMap.graph.nodes.find(node => node.id === savedNodeFilter.nodeId)
    : undefined;
  const previousIdentity = useRef(resultIdentity);
  useEffect(() => {
    if (previousIdentity.current === resultIdentity) return;
    previousIdentity.current = resultIdentity;
    setFocusFindingId(null);
    setLocalNodeFilter(null);
    onNodeFilterChange?.(null);
    onTabChange('map');
  }, [onNodeFilterChange, onTabChange, resultIdentity]);
  const findings = model.findings ?? [];
  const capabilityChips = model.capabilityChips ?? [];
  const checks = model.checks ?? {
    recorded: false,
    groups: [],
    totals: {
      passed: 0,
      info: 0,
      warning: 0,
      error: 0,
      notApplicable: 0,
      failed: 0,
      recorded: 0,
      evaluated: 0,
    },
  };
  const findingProblems = findings.filter((finding) => finding.sev !== 'info').length;
  const componentCount = model.agentMap?.state === 'ready'
    ? model.agentMap.graph.nodes.filter(node => node.category !== 'agent').length
    : undefined;
  const changeNodeFilter = (filter: ReviewNodeFilter | null) => {
    setLocalNodeFilter(filter);
    onNodeFilterChange?.(filter);
    setFocusFindingId(null);
  };
  const openFinding = (findingId: string) => {
    changeNodeFilter(null);
    setFocusFindingId(findingId);
    onTabChange('findings');
    onOpenFinding?.(findingId);
  };
  const canViewAllInFullscreen = fullscreenAvailable && Boolean(onViewAllFindings);

  const tab = (
    value: ReviewTabId,
    label: string,
    badge: React.ReactNode,
    description: string,
    ariaLabel: string,
  ) => (
    <Tab
      value={value}
      id={`copilot-review-tab-${value}`}
      aria-controls={`copilot-review-panel-${value}`}
    >
      {label}
      <Tooltip relationship="description" content={description}>
        <Badge
          className={styles.tabCount}
          appearance="tint"
          color={selectedTab === value ? 'brand' : 'informative'}
          size="small"
          shape="circular"
          aria-label={ariaLabel}
        >
          {badge}
        </Badge>
      </Tooltip>
    </Tab>
  );

  return (
    <div
      className={mergeClasses(
        styles.layout,
        (selectedTab === 'map' || inline) && styles.mapLayout,
        inline && styles.inlineLayout,
      )}
    >
      <div className={mergeClasses(styles.contentCard, inline && styles.contentCardInline, inline && styles.inlineCard)}>
        <TabList
          className={styles.tabBar}
          selectedValue={selectedTab}
          onTabSelect={(_, data) => onTabChange(normalizeReviewTab(data.value))}
          aria-label="Review views"
        >
          {tab(
            'findings',
            'Findings',
            findingProblems,
            `${findingProblems} findings need attention (errors and warnings; informational findings are not counted)`,
            `${findingProblems} findings need attention`,
          )}
          <Tab value="map" id="copilot-review-tab-map" aria-controls="copilot-review-panel-map">Agent map</Tab>
        </TabList>

        <div
          role="tabpanel"
          id="copilot-review-panel-map"
          aria-labelledby="copilot-review-tab-map"
          hidden={selectedTab !== 'map'}
          className={inline && selectedTab === 'map' ? styles.inlinePanel : undefined}
        >
          <ReviewAgentMap
            key={resultIdentity}
            map={model.agentMap}
            topicReviews={model.topicReviews}
            summary={model.summary}
            showSummary={showSummary}
            findings={findings}
            active={selectedTab === 'map'}
            navigation={mapNavigation}
            onNavigationChange={onMapNavigationChange}
            onOpenFinding={openFinding}
            onActivateNode={(nodeId, navigation) => {
              if (!resultIdentity) return;
              const filter = { reviewId: resultIdentity, nodeId };
              // Inline with fullscreen keeps the map: the host then shows the node's findings in fullscreen.
              if (!inline || !fullscreenAvailable) {
                changeNodeFilter(filter);
                onTabChange('findings');
              }
              onActivateNode?.(filter, navigation);
            }}
            onViewAllFindings={() => {
              changeNodeFilter(null);
              onTabChange('findings');
            }}
            fullscreenAvailable={inline && fullscreenAvailable}
            onOpenFullscreen={onOpenFullscreen}
          />
        </div>
        <div
          role="tabpanel"
          id="copilot-review-panel-findings"
          aria-labelledby="copilot-review-tab-findings"
          hidden={selectedTab !== 'findings'}
          className={inline && selectedTab === 'findings' ? styles.inlinePanel : undefined}
        >
          {selectedTab === 'findings' && inline && (
            <>
              <h2 className={styles.visuallyHidden}>Review findings</h2>
              <InlineFindingsPreview
                key={`${resultIdentity}:${savedNodeFilter?.nodeId ?? 'all'}`}
                findings={findings}
                checks={checks}
                issueCount={findingProblems}
                componentCount={componentCount}
                hasMore={hasMore}
                loadingMore={loadingMore}
                onLoadMore={onLoadMore}
                focusFindingId={focusFindingId}
                nodeFilter={savedNodeFilter ? { nodeId: savedNodeFilter.nodeId, node: selectedNode } : undefined}
                onClearNodeFilter={() => changeNodeFilter(null)}
                onViewAll={canViewAllInFullscreen ? () => onViewAllFindings?.(savedNodeFilter) : undefined}
              />
            </>
          )}
          {selectedTab === 'findings' && !inline && (
            <>
              <h2 className={styles.visuallyHidden}>Review findings</h2>
              <FindingsTab
                key={`${resultIdentity}:${savedNodeFilter?.nodeId ?? 'all'}`}
                findings={findings}
                capabilityChips={capabilityChips}
                checks={checks}
                issueCount={findingProblems}
                componentCount={componentCount}
                hasMore={hasMore}
                focusFindingId={focusFindingId}
                nodeFilter={savedNodeFilter ? { nodeId: savedNodeFilter.nodeId, node: selectedNode } : undefined}
                onClearNodeFilter={() => changeNodeFilter(null)}
              />
              {hasMore && onLoadMore && (
                <div className={styles.loadMore}>
                  <Button disabled={loadingMore} onClick={onLoadMore}>
                    {loadingMore ? 'Loading more…' : 'Load more'}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {showSummary && selectedTab !== 'map' && <SummaryRail summary={model.summary} />}
    </div>
  );
}
