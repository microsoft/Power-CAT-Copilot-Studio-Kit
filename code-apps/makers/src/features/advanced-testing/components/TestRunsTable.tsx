/**
 * Recent Test Runs table (columns from Figma):
 *   Name + case count · Pass rate · Owner · Test set · Agent · Status
 *
 * Clicking a row opens the Agent Test Run record in the MDA. Skeleton rows
 * are rendered during the initial load.
 */

import { useMemo, type KeyboardEvent } from "react";
import {
  Avatar,
  Badge,
  Button,
  DataGrid,
  DataGridBody,
  DataGridCell,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridRow,
  Link,
  MessageBar,
  MessageBarBody,
  Skeleton,
  SkeletonItem,
  Subtitle1,
  Text,
  Tooltip,
  createTableColumn,
  makeStyles,
  tokens,
  type TableColumnDefinition,
  type TableColumnSizingOptions,
} from "@fluentui/react-components";
import { ArrowClockwise20Regular } from "@fluentui/react-icons";
import { useQueryClient } from "@tanstack/react-query";
import { navigateToMda } from "../../../shared/utils/mda-navigation";
import type { TestRunSummary } from "../contracts/types";
import { useRecentTestRuns } from "../hooks/useRecentTestRuns";
import { mdaPages } from "../services/mda-pages";
import { CopilotStudioColorIcon20 } from "./CopilotStudioColorIcon";
import { PassRateBar } from "./PassRateBar";
import { StatusCell } from "./StatusCell";

// Widths sum to 1300px — matches the 1366px max-width page minus the table
// wrapper's 1px border + internal padding so there is no trailing gap after
// the Status column. Proportions taken from Figma frame 2142:58940.
const COLUMN_SIZING: TableColumnSizingOptions = {
  name: { defaultWidth: 320, minWidth: 220, idealWidth: 320 },
  passRate: { defaultWidth: 180, minWidth: 160, idealWidth: 180 },
  owner: { defaultWidth: 200, minWidth: 160, idealWidth: 200 },
  testSet: { defaultWidth: 200, minWidth: 160, idealWidth: 200 },
  agent: { defaultWidth: 280, minWidth: 220, idealWidth: 280 },
  status: { defaultWidth: 120, minWidth: 100, idealWidth: 120 },
};

const useStyles = makeStyles({
  section: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
  },
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
  },
  tableWrapper: {
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusLarge,
    overflow: "hidden",
  },
  nameCell: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  nameText: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  ownerCell: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    minWidth: 0,
  },
  agentCell: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    minWidth: 0,
  },
  agentIcon: {
    flexShrink: 0,
    width: "20px",
    height: "20px",
  },
  testSetBadge: {
    whiteSpace: "normal",
    height: "auto",
    minHeight: "20px",
    paddingTop: tokens.spacingVerticalXXS,
    paddingBottom: tokens.spacingVerticalXXS,
    lineHeight: tokens.lineHeightBase200,
    textAlign: "left",
  },
  skeletonRow: {
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
});

export function TestRunsTable() {
  const styles = useStyles();
  const queryClient = useQueryClient();
  const { data, isLoading, isFetching, error } = useRecentTestRuns(10);

  const onRefresh = () => {
    void queryClient.invalidateQueries({
      queryKey: ["advanced-testing", "test-runs"],
      refetchType: "all",
    });
  };

  const onSeeAll = () => {
    navigateToMda(mdaPages.testRunList);
  };

  const onRowClick = (run: TestRunSummary) => {
    navigateToMda(mdaPages.testRunById(run.cat_copilottestrunid));
  };

  const columns = useMemo<TableColumnDefinition<TestRunSummary>[]>(
    () => [
      createTableColumn<TestRunSummary>({
        columnId: "name",
        renderHeaderCell: () => "Name",
        renderCell: (run) => {
          const caseCount = run.testCaseCount ?? Number(run.cat_tests ?? 0);
          return (
            <div className={styles.nameCell}>
              <Tooltip content={run.cat_name} relationship="label">
                <Text weight="semibold" className={styles.nameText}>
                  {run.cat_name}
                </Text>
              </Tooltip>
              <Text size={200} className={styles.nameText}>
                {caseCount === 1 ? "1 case" : `${caseCount} cases`}
              </Text>
            </div>
          );
        },
      }),
      createTableColumn<TestRunSummary>({
        columnId: "passRate",
        renderHeaderCell: () => "Pass rate",
        renderCell: (run) => (
          <PassRateBar successRate={Number(run.cat_successrate ?? 0)} />
        ),
      }),
      createTableColumn<TestRunSummary>({
        columnId: "owner",
        renderHeaderCell: () => "Owner",
        renderCell: (run) => (
          <div className={styles.ownerCell}>
            <Avatar
              name={run.owneridname ?? ""}
              image={run.ownerAvatarUrl ? { src: run.ownerAvatarUrl } : undefined}
              size={24}
            />
            <Text className={styles.nameText}>{run.owneridname ?? "—"}</Text>
          </div>
        ),
      }),
      createTableColumn<TestRunSummary>({
        columnId: "testSet",
        renderHeaderCell: () => "Test set",
        renderCell: (run) =>
          run.testSetName ? (
            <Badge
              appearance="outline"
              color="informative"
              size="large"
              className={styles.testSetBadge}
            >
              {run.testSetName}
            </Badge>
          ) : (
            <Text size={200}>—</Text>
          ),
      }),
      createTableColumn<TestRunSummary>({
        columnId: "agent",
        renderHeaderCell: () => "Agent",
        renderCell: (run) => (
          <div className={styles.agentCell}>
            <CopilotStudioColorIcon20 className={styles.agentIcon} />
            <Text className={styles.nameText}>{run.agentName ?? "—"}</Text>
          </div>
        ),
      }),
      createTableColumn<TestRunSummary>({
        columnId: "status",
        renderHeaderCell: () => "Status",
        renderCell: (run) => (
          <StatusCell code={run.cat_runstatuscode} name={run.cat_runstatuscodename} />
        ),
      }),
    ],
    [styles]
  );

  return (
    <section className={styles.section} aria-label="Recent test runs">
      <div className={styles.headerRow}>
        <Subtitle1 as="h2">Recent test runs</Subtitle1>
        <div className={styles.headerActions}>
          <Tooltip content="Refresh test runs" relationship="label">
            <Button
              appearance="subtle"
              icon={<ArrowClockwise20Regular />}
              aria-label="Refresh test runs"
              onClick={onRefresh}
              disabled={isFetching}
            />
          </Tooltip>
          <Link onClick={onSeeAll} as="button">See more</Link>
        </div>
      </div>

      {error ? (
        <MessageBar intent="error">
          <MessageBarBody>Unable to load recent test runs.</MessageBarBody>
        </MessageBar>
      ) : null}

      <div className={styles.tableWrapper}>
        {isLoading ? (
          <>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={styles.skeletonRow}>
                <Skeleton>
                  <SkeletonItem size={16} />
                </Skeleton>
              </div>
            ))}
          </>
        ) : data && data.length > 0 ? (
          <DataGrid
            items={data}
            columns={columns}
            resizableColumns
            resizableColumnsOptions={{ autoFitColumns: true }}
            columnSizingOptions={COLUMN_SIZING}
            getRowId={(run) => run.cat_copilottestrunid}
            focusMode="cell"
          >
            <DataGridHeader>
              <DataGridRow>
                {({ renderHeaderCell }) => (
                  <DataGridHeaderCell>
                    <Text weight="semibold">{renderHeaderCell()}</Text>
                  </DataGridHeaderCell>
                )}
              </DataGridRow>
            </DataGridHeader>
            <DataGridBody<TestRunSummary>>
              {({ item, rowId }) => (
                <DataGridRow<TestRunSummary>
                  key={rowId}
                  onClick={() => onRowClick(item)}
                  onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onRowClick(item);
                    }
                  }}
                  tabIndex={0}
                  style={{ minHeight: "72px", cursor: "pointer" }}
                >
                  {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
                </DataGridRow>
              )}
            </DataGridBody>
          </DataGrid>
        ) : !error ? (
          <div style={{ padding: 24, textAlign: "center" }}>
            <Text size={300}>No recent test runs.</Text>
          </div>
        ) : null}
      </div>
    </section>
  );
}
