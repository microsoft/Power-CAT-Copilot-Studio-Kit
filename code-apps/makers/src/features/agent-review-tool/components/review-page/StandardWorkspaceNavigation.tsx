import {
  Badge,
  Tab,
  TabList,
  Tooltip,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import {
  ArrowSwapRegular,
  MapRegular,
  TaskListSquareSparkleRegular,
} from '@fluentui/react-icons';

export type StandardWorkspaceId = 'findings' | 'agent-map' | 'harness';

const useStyles = makeStyles({
  root: {
    flexShrink: 0,
  },
  tabs: {
    width: '100%',
    padding: 0,
    flexWrap: 'wrap',
    rowGap: tokens.spacingVerticalXS,
  },
  count: {
    marginLeft: tokens.spacingHorizontalSNudge,
  },
});

export interface StandardWorkspaceNavigationProps {
  selectedWorkspace: StandardWorkspaceId;
  findingCount: number;
  findingSummary: string;
  onWorkspaceChange: (workspace: StandardWorkspaceId) => void;
}

/** Selects the primary Standard Review workspace. */
export function StandardWorkspaceNavigation({
  selectedWorkspace,
  findingCount,
  findingSummary,
  onWorkspaceChange,
}: StandardWorkspaceNavigationProps) {
  const styles = useStyles();

  return (
    <nav className={styles.root} aria-label="Review workspace">
      <TabList
        className={styles.tabs}
        appearance="subtle-circular"
        size="medium"
        selectedValue={selectedWorkspace}
        onTabSelect={(_, data) => onWorkspaceChange(data.value as StandardWorkspaceId)}
        aria-label="Review workspaces"
      >
        <Tab icon={<TaskListSquareSparkleRegular />} value="findings">
          Review findings
          <Tooltip relationship="description" content={findingSummary}>
            <Badge
              className={styles.count}
              appearance="tint"
              color={selectedWorkspace === 'findings' ? 'brand' : 'informative'}
              size="small"
              shape="circular"
              aria-label={`Review findings: ${findingSummary}`}
            >
              {findingCount}
            </Badge>
          </Tooltip>
        </Tab>
        <Tab icon={<MapRegular />} value="agent-map">
          Architecture
        </Tab>
        <Tab icon={<ArrowSwapRegular />} value="harness">
          Harness
        </Tab>
      </TabList>
    </nav>
  );
}
