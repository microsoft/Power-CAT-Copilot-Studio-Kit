import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Button,
  Caption1,
  Combobox,
  DataGrid,
  DataGridBody,
  DataGridCell,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridRow,
  Dropdown,
  Field,
  Image,
  Input,
  MessageBar,
  MessageBarBody,
  Option,
  Spinner,
  Text,
  Title3,
  Tooltip,
  createTableColumn,
  makeStyles,
  mergeClasses,
  tokens,
  type TableColumnDefinition,
  type TableColumnSizingOptions,
} from "@fluentui/react-components";
import {
  ArrowMaximizeRegular,
  ArrowMinimizeRegular,
  BotSparkle24Color,
  BotSparkle24Regular,
  ChevronLeftRegular,
  ChevronRightRegular,
  CodeColor,
  Eye20Regular,
  SearchRegular,
} from "@fluentui/react-icons";
import {
  CopilotReviewResults,
  type ReviewTabId,
  type ReviewViewModel,
} from "../../agent-review/ui/index.js";
import { useMcpApp } from "../shared/McpAppProvider";
import {
  fullscreenHeight,
  fullscreenOffered,
  inlineContentHeight,
  measureFrameInset,
} from "../shared/fullscreen";
import {
  REVIEW_BROWSER_INLINE_ROW_HEIGHT,
  estimateReviewBrowserInlineChrome,
  requestReviewBrowserDisplayMode,
  reviewBrowserColumnIds,
  reviewBrowserInlineFirstRow,
  reviewBrowserInlinePageSize,
  reviewBrowserLayout,
  reviewBrowserPresentationKey,
  reviewBrowserRangeCaption,
  resolveReviewBrowserFullscreen,
  shouldSynchronizeFullscreenHost,
  type ReviewBrowserColumnId,
} from "./presentation";

interface Environment {
  id: string;
  name: string;
  region: string;
}

interface ReviewRow {
  botId: string;
  componentIdUnique: string;
  botName: string;
  iconBase64?: string;
  reviewId?: string;
  overallScore: number;
  totalIssueCount: number;
  highSeverityCount: number;
  reviewedOn?: string;
  status: "completed" | "failed" | "not-reviewed";
  hasReviewData: boolean;
  harness: "standard" | "copilot";
}

interface ToolData {
  state?: string;
  environments?: Environment[];
  environment?: Environment;
  rows?: ReviewRow[];
  presentation?: "inline" | "fullscreen";
  selectionId?: string;
  reviewId?: string;
  model?: ReviewViewModel;
  error?: { message?: string };
}

const layout = reviewBrowserLayout();

const useStyles = makeStyles({
  root: {
    minWidth: 0,
    width: "100%",
    padding: 0,
    color: tokens.colorNeutralForeground1,
    backgroundColor: "transparent",
  },
  fullRoot: {
    minWidth: 0,
    height: "100vh",
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    padding: tokens.spacingHorizontalXL,
    color: tokens.colorNeutralForeground1,
    backgroundColor: tokens.colorNeutralBackground2,
    overflow: "hidden",
  },
  card: {
    maxWidth: "none",
    width: "100%",
    margin: 0,
    boxSizing: "border-box",
    overflow: "hidden",
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusXLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow8,
  },
  inlineContent: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
    minWidth: 0,
    padding: tokens.spacingHorizontalL,
    boxSizing: "border-box",
  },
  inlineSpacing: {
    marginBottom: 0,
  },
  inlineCaption: {
    color: tokens.colorNeutralForeground2,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  inlineMessage: {
    flexShrink: 0,
  },
  inlineMessageText: {
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    whiteSpace: "normal",
    overflowWrap: "anywhere",
  },
  inlineEmpty: {
    display: "grid",
    placeItems: "center",
    minHeight: "96px",
    color: tokens.colorNeutralForeground2,
  },
  inlineFooter: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: tokens.spacingHorizontalS,
  },
  inlineRange: {
    flex: "1 1 0px",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: tokens.colorNeutralForeground2,
  },
  inlineNavigation: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: tokens.spacingHorizontalXS,
  },
  fullCard: {
    display: "flex",
    flexDirection: "column",
    ...layout.outerSurface,
    maxWidth: "1440px",
    width: "100%",
    margin: "0 auto",
    boxSizing: "border-box",
    overflow: "auto",
  },
  detailCard: {
    overflowX: "hidden",
    overflowY: "auto",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.spacingHorizontalL,
    marginBottom: tokens.spacingVerticalL,
  },
  headerTitle: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    minWidth: 0,
  },
  toolbar: {
    display: "flex",
    alignItems: "end",
    gap: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalL,
    flexWrap: "wrap",
  },
  environment: {
    minWidth: "260px",
  },
  search: {
    minWidth: "260px",
    flexGrow: 1,
  },
  grid: {
    ...layout.grid,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusLarge,
    overflow: "hidden",
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow4,
  },
  nameCell: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    minWidth: 0,
  },
  botIcon: {
    width: "36px",
    height: "36px",
    borderRadius: tokens.borderRadiusMedium,
    objectFit: "cover",
    flexShrink: 0,
  },
  botFallback: {
    width: "36px",
    height: "36px",
    flexShrink: 0,
  },
  nameText: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  score: {
    fontSize: "18px",
    fontWeight: 600,
  },
  placeholder: {
    color: tokens.colorNeutralForeground3,
  },
  issues: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXS,
  },
  pagination: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.spacingHorizontalM,
    paddingTop: tokens.spacingVerticalL,
    flexWrap: "wrap",
  },
  pageSize: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
  },
  navigation: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
  },
  empty: {
    display: "grid",
    placeItems: "center",
    minHeight: "180px",
    color: tokens.colorNeutralForeground2,
  },
  detailHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: tokens.spacingHorizontalL,
    maxWidth: "1440px",
    margin: `0 auto ${tokens.spacingVerticalL}`,
  },
  detailTitle: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
});

function structured(result: unknown): ToolData {
  return ((result as { structuredContent?: ToolData })?.structuredContent ?? {}) as ToolData;
}

function iconSource(value: string | undefined): string | undefined {
  const icon = value?.trim();
  if (!icon) return undefined;
  return icon.startsWith("data:image/") ? icon : `data:image/png;base64,${icon}`;
}

function relativeDate(value: string | undefined): string {
  if (!value) return "Never";
  const elapsed = Math.max(0, Date.now() - Date.parse(value));
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 60) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months < 24 ? `${months}mo ago` : `${Math.floor(months / 12)}y ago`;
}

function scoreColor(score: number): string {
  if (score >= 80) return tokens.colorPaletteGreenForeground1;
  if (score >= 60) return tokens.colorPaletteMarigoldForeground2;
  return tokens.colorPaletteRedForeground1;
}

export function ReviewBrowserApp() {
  const styles = useStyles();
  const { app, data, host, replaceData } = useMcpApp();
  const initial = (data ?? {}) as ToolData;
  const presentationKey = reviewBrowserPresentationKey(initial.selectionId);
  const storedPresentationValue = presentationKey
    ? window.sessionStorage.getItem(presentationKey)
    : null;
  const storedPresentation = storedPresentationValue === "inline"
    || storedPresentationValue === "fullscreen"
    ? storedPresentationValue
    : undefined;
  const expandedHeight = fullscreenHeight(
    host?.containerDimensions,
    window.screen.availHeight,
  );
  const [environments, setEnvironments] = useState<Environment[]>(initial.environments ?? []);
  const [environmentId, setEnvironmentId] = useState(initial.environment?.id ?? "");
  const [environmentFilter, setEnvironmentFilter] = useState(initial.environment?.name ?? "");
  const [rows, setRows] = useState<ReviewRow[]>(initial.rows ?? []);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize, setPageSize] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initial.error?.message ?? null);
  const [detail, setDetail] = useState<ReviewViewModel | undefined>(initial.model);
  const [activeTab, setActiveTab] = useState<ReviewTabId>("map");
  const [inlineStart, setInlineStart] = useState(0);
  const [inlineMeasure, setInlineMeasure] = useState<{ chrome: number; row: number }>();
  const [frameInset] = useState(measureFrameInset);
  // The mode that the host last reported or granted; the full-screen layout needs it.
  const [confirmedMode, setConfirmedMode] = useState(host?.displayMode);
  const [fullscreenRefused, setFullscreenRefused] = useState(false);
  const inlineContentRef = useRef<HTMLDivElement>(null);
  const fullscreenSyncAttempt = useRef<string>();
  const [isFullscreen, setIsFullscreen] = useState(() =>
    resolveReviewBrowserFullscreen({
      presentation: initial.presentation,
      storedPresentation,
      state: initial.state,
      hostDisplayMode: host?.displayMode,
      current: false,
    }));
  const fullscreen = isFullscreen && confirmedMode === "fullscreen";

  useEffect(() => {
    const next = (data ?? {}) as ToolData;
    if (next.environments) setEnvironments(next.environments);
    if (next.rows) setRows(next.rows);
    if (next.environment) {
      setEnvironmentId(next.environment.id);
      setEnvironmentFilter(next.environment.name);
    }
    if (next.model) setDetail(next.model);
    setIsFullscreen((current) => resolveReviewBrowserFullscreen({
      presentation: next.presentation,
      storedPresentation,
      state: next.state,
      hostDisplayMode: host?.displayMode,
      current,
    }));
  }, [data, host?.displayMode, storedPresentation]);

  useEffect(() => {
    if (host?.displayMode) setConfirmedMode(host.displayMode);
  }, [host?.displayMode]);

  useEffect(() => {
    const next = (data ?? {}) as ToolData;
    if (!app || !shouldSynchronizeFullscreenHost({
      presentation: next.presentation,
      storedPresentation,
      state: next.state,
      hostDisplayMode: host?.displayMode,
    })) {
      fullscreenSyncAttempt.current = undefined;
      return;
    }

    const attemptKey = `${storedPresentation ?? next.presentation ?? next.state}:${host?.displayMode ?? "unknown"}`;
    if (fullscreenSyncAttempt.current === attemptKey) return;
    fullscreenSyncAttempt.current = attemptKey;

    // A refusal keeps the inline list and shows a neutral caption, not an error.
    void app.requestDisplayMode({ mode: "fullscreen" }).then((response) => {
      setConfirmedMode(response.mode);
      setFullscreenRefused(response.mode !== "fullscreen");
    }).catch(() => {
      setFullscreenRefused(true);
    });
  }, [app, data, host?.displayMode, storedPresentation]);

  useEffect(() => {
    setCurrentPage(0);
  }, [search, pageSize, environmentId]);

  useEffect(() => {
    setInlineStart(0);
  }, [search, environmentId]);

  const selectedEnvironment = useMemo(
    () => environments.find((environment) => environment.id === environmentId),
    [environmentId, environments],
  );
  const filteredEnvironments = useMemo(() => {
    const query = environmentFilter.trim().toLocaleLowerCase();
    if (!query || selectedEnvironment?.name === environmentFilter) return environments;
    return environments.filter((environment) =>
      environment.name.toLocaleLowerCase().includes(query));
  }, [environmentFilter, environments, selectedEnvironment]);
  const filteredRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return (query
      ? rows.filter((row) => row.botName.toLocaleLowerCase().includes(query))
      : rows
    ).filter((row) => row.reviewId && row.hasReviewData);
  }, [rows, search]);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pagedRows = useMemo(
    () => filteredRows.slice(currentPage * pageSize, (currentPage + 1) * pageSize),
    [currentPage, filteredRows, pageSize],
  );
  const fullscreenUnavailable = fullscreenRefused || !fullscreenOffered(host);
  // Inline, the whole document (with the #root frame padding) fits the host height budget.
  const inlineHeight = inlineContentHeight(host?.containerDimensions, frameInset.height);
  const inlinePageSize = reviewBrowserInlinePageSize(
    inlineHeight,
    inlineMeasure?.chrome
      ?? estimateReviewBrowserInlineChrome({ caption: fullscreenUnavailable, error: Boolean(error) }),
    inlineMeasure?.row,
  );
  const inlineFirst = reviewBrowserInlineFirstRow(inlineStart, inlinePageSize, filteredRows.length);
  const inlineRows = useMemo(
    () => filteredRows.slice(inlineFirst, inlineFirst + inlinePageSize),
    [filteredRows, inlineFirst, inlinePageSize],
  );

  const measureInlineChrome = useCallback(() => {
    const content = inlineContentRef.current;
    if (!content) return;
    const rowElements = [...content.querySelectorAll<HTMLElement>("[data-review-row]")];
    const natural = content.getBoundingClientRect().height;
    if (rowElements.length === 0 || natural <= 0) return;
    const rowsHeight = rowElements.reduce(
      (sum, row) => sum + row.getBoundingClientRect().height,
      0,
    );
    const card = content.parentElement;
    const frame = card ? card.offsetHeight - card.clientHeight : 0;
    const chrome = Math.ceil(natural + frame - rowsHeight);
    const row = Math.max(1, Math.ceil(rowsHeight / rowElements.length));
    setInlineMeasure((current) =>
      current?.chrome === chrome && current.row === row ? current : { chrome, row });
  }, []);

  useLayoutEffect(() => {
    if (!fullscreen) measureInlineChrome();
  });

  useEffect(() => {
    const content = inlineContentRef.current;
    if (fullscreen || !content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measureInlineChrome());
    observer.observe(content);
    return () => observer.disconnect();
  }, [fullscreen, measureInlineChrome]);

  // The stylesheet's html min-height (100%) would hold the auto-resize
  // measurement at the frame height, so inline drops it.
  useLayoutEffect(() => {
    if (fullscreen) return;
    const { style } = document.documentElement;
    const previous = style.minHeight;
    style.minHeight = "0px";
    return () => {
      style.minHeight = previous;
    };
  }, [fullscreen]);

  const loadEnvironment = async (id: string) => {
    const environment = environments.find((item) => item.id === id);
    setEnvironmentId(id);
    setEnvironmentFilter(environment?.name ?? "");
    setRows([]);
    setError(null);
    if (!id || !app) return;
    setLoading(true);
    try {
      const output = structured(await app.callServerTool({
        name: "list_agent_reviews",
        arguments: {
          environmentId: id,
          presentation: fullscreen ? "fullscreen" : "inline",
        },
      }));
      if (output.state === "error") {
        throw new Error(output.error?.message ?? "Unable to load reviews.");
      }
      replaceData({ ...output, selectionId: initial.selectionId });
      setRows(output.rows ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load reviews.");
    } finally {
      setLoading(false);
    }
  };

  const toggleFullscreen = async () => {
    if (!app) return;
    const presentation = fullscreen ? "inline" : "fullscreen";
    fullscreenSyncAttempt.current = `${presentation}:${host?.displayMode ?? "unknown"}`;
    setError(null);
    setIsFullscreen(presentation === "fullscreen");
    try {
      const mode = await requestReviewBrowserDisplayMode(
        app,
        presentation,
        window.sessionStorage,
        initial.selectionId,
      );
      setConfirmedMode(mode);
      setIsFullscreen(mode === "fullscreen");
      if (presentation === "fullscreen") setFullscreenRefused(mode !== "fullscreen");
    } catch (caught) {
      if (presentation === "fullscreen") {
        setIsFullscreen(false);
        setFullscreenRefused(true);
        return;
      }
      setError(caught instanceof Error ? caught.message : "Unable to change the review display mode.");
    }
  };

  const openReview = async (row: ReviewRow) => {
    if (!app || !row.reviewId) return;
    const listData = data;
    // The review summary shows only in full screen, so a refused request keeps the list.
    const keepList = () => {
      setDetail(undefined);
      if (listData) replaceData(listData);
      setIsFullscreen(false);
      setFullscreenRefused(true);
    };
    setError(null);
    setLoading(true);
    let displayRequested = false;
    try {
      const output = structured(await app.callServerTool({
        name: "get_agent_review_result",
        arguments: { reviewId: row.reviewId, presentation: "fullReview" },
      }));
      if (!output.model) throw new Error("The stored review result is unavailable.");
      setActiveTab("map");
      replaceData({ ...output, selectionId: initial.selectionId });
      setDetail(output.model);
      setIsFullscreen(true);
      displayRequested = true;
      const mode = await requestReviewBrowserDisplayMode(
        app,
        "fullscreen",
        window.sessionStorage,
        initial.selectionId,
      );
      setConfirmedMode(mode);
      if (mode === "fullscreen") {
        setIsFullscreen(true);
        setFullscreenRefused(false);
      } else {
        keepList();
      }
    } catch (caught) {
      if (displayRequested) {
        keepList();
      } else {
        setError(caught instanceof Error ? caught.message : "Unable to open the review.");
      }
    } finally {
      setLoading(false);
    }
  };

  const closeDetail = async () => {
    if (!app || !environmentId) return;
    setLoading(true);
    try {
      const output = structured(await app.callServerTool({
        name: "list_agent_reviews",
        arguments: { environmentId, presentation: "inline" },
      }));
      if (output.state === "error") {
        throw new Error(output.error?.message ?? "Unable to close the full review.");
      }
      replaceData({ ...output, selectionId: initial.selectionId });
      setRows(output.rows ?? []);
      setDetail(undefined);
      setIsFullscreen(false);
      const mode = await requestReviewBrowserDisplayMode(
        app,
        "inline",
        window.sessionStorage,
        initial.selectionId,
      );
      setConfirmedMode(mode);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to close the full review.");
    } finally {
      setLoading(false);
    }
  };

  const allColumns: TableColumnDefinition<ReviewRow>[] = [
    createTableColumn({
      columnId: "name",
      compare: (left, right) => left.botName.localeCompare(right.botName),
      renderHeaderCell: () => "Name",
      renderCell: (row) => (
        <div className={styles.nameCell}>
          {iconSource(row.iconBase64) ? (
            <Image className={styles.botIcon} src={iconSource(row.iconBase64)} alt="" />
          ) : (
            <BotSparkle24Regular className={styles.botFallback} aria-hidden="true" />
          )}
          <Text className={styles.nameText} title={row.botName}>{row.botName}</Text>
        </div>
      ),
    }),
    createTableColumn({
      columnId: "poweredBy",
      compare: (left, right) => left.harness.localeCompare(right.harness),
      renderHeaderCell: () => "Powered by",
      renderCell: (row) => (
        <Badge appearance="tint" color="brand" size="small" shape="circular">
          {row.harness === "copilot" ? "GitHub Copilot" : "Standard"}
        </Badge>
      ),
    }),
    createTableColumn({
      columnId: "score",
      compare: (left, right) => left.overallScore - right.overallScore,
      renderHeaderCell: () => "Score",
      renderCell: (row) => row.status === "completed" ? (
        <span className={styles.score} style={{ color: scoreColor(row.overallScore) }}>
          {row.overallScore}%
        </span>
      ) : <span className={styles.placeholder}>--</span>,
    }),
    createTableColumn({
      columnId: "issues",
      compare: (left, right) => left.totalIssueCount - right.totalIssueCount,
      renderHeaderCell: () => "Issues",
      renderCell: (row) => (
        <div className={styles.issues}>
          <Text weight="semibold">{row.totalIssueCount}</Text>
          {row.highSeverityCount > 0 && (
            <Badge appearance="filled" color="danger" size="medium">
              {row.highSeverityCount} high
            </Badge>
          )}
        </div>
      ),
    }),
    createTableColumn({
      columnId: "lastReviewed",
      compare: (left, right) =>
        Date.parse(left.reviewedOn ?? "") - Date.parse(right.reviewedOn ?? ""),
      renderHeaderCell: () => "Last Reviewed",
      renderCell: (row) => <Text size={200}>{relativeDate(row.reviewedOn)}</Text>,
    }),
    createTableColumn({
      columnId: "details",
      renderHeaderCell: () => "Details",
      renderCell: (row) => (
        <Button
          appearance="subtle"
          icon={<Eye20Regular />}
          disabled={!row.reviewId || !row.hasReviewData}
          onClick={() => void openReview(row)}
        >
          View
        </Button>
      ),
    }),
  ];
  const visibleColumnIds = new Set(reviewBrowserColumnIds(fullscreen));
  const columns = allColumns.filter((column) =>
    visibleColumnIds.has(column.columnId as ReviewBrowserColumnId));

  const columnSizing: TableColumnSizingOptions = {
    name: { defaultWidth: fullscreen ? 320 : 240, minWidth: 180 },
    poweredBy: { defaultWidth: 140, minWidth: 120 },
    score: { defaultWidth: 90, minWidth: 70 },
    issues: { defaultWidth: 120, minWidth: 90 },
    lastReviewed: { defaultWidth: 130, minWidth: 100 },
    details: { defaultWidth: 100, minWidth: 80 },
  };

  if (detail && fullscreen) {
    return (
      <div
        className={styles.fullRoot}
        style={{ height: expandedHeight, minHeight: expandedHeight }}
      >
        <div className={styles.detailHeader}>
          <div className={styles.headerTitle}>
            <BotSparkle24Color />
            <div className={styles.detailTitle}>
              <Title3>{detail.summary.agentName}</Title3>
              <Text size={200}>Agent review results</Text>
            </div>
          </div>
          <Tooltip content="Exit fullscreen" relationship="label">
            <Button
              appearance="secondary"
              size="small"
              icon={<ArrowMinimizeRegular />}
              aria-label="Exit fullscreen"
              onClick={() => void closeDetail()}
            />
          </Tooltip>
        </div>
        <div className={`${styles.fullCard} ${styles.detailCard}`}>
          <CopilotReviewResults
            model={detail}
            reviewId={initial.reviewId}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        </div>
      </div>
    );
  }

  const headerView = (
    <div className={fullscreen ? styles.header : mergeClasses(styles.header, styles.inlineSpacing)}>
      <div className={styles.headerTitle}>
        <CodeColor style={{ fontSize: "32px" }} />
        <Title3>Agent Reviews</Title3>
        <Badge appearance="tint" color="informative" size="small">
          {filteredRows.length}
        </Badge>
      </div>
      <Tooltip
        content={fullscreen ? "Exit fullscreen" : "Expand to fullscreen"}
        relationship="label"
      >
        <Button
          appearance="secondary"
          size="small"
          icon={fullscreen ? <ArrowMinimizeRegular /> : <ArrowMaximizeRegular />}
          aria-label={fullscreen ? "Exit fullscreen" : "Expand to fullscreen"}
          onClick={() => void toggleFullscreen()}
        />
      </Tooltip>
    </div>
  );

  const filtersView = (
    <div className={fullscreen ? styles.toolbar : mergeClasses(styles.toolbar, styles.inlineSpacing)}>
      <Field label="Environment" className={styles.environment}>
        <Combobox
          value={environmentFilter}
          selectedOptions={environmentId ? [environmentId] : []}
          placeholder="Choose an environment"
          onChange={(event) => {
            const value = event.target.value;
            setEnvironmentFilter(value);
            if (environmentId && value !== selectedEnvironment?.name) {
              setEnvironmentId("");
              setRows([]);
            }
          }}
          onOptionSelect={(_, option) => {
            if (option.optionValue) void loadEnvironment(option.optionValue);
          }}
        >
          {filteredEnvironments.map((environment) => (
            <Option key={environment.id} value={environment.id} text={environment.name}>
              {environment.name}
            </Option>
          ))}
        </Combobox>
      </Field>
      <Field label="Search reviews" className={styles.search}>
        <Input
          contentBefore={<SearchRegular />}
          value={search}
          onChange={(_, value) => setSearch(value.value)}
          placeholder="Search agents"
        />
      </Field>
    </div>
  );

  const emptyText = environmentId
    ? "No completed reviews match this environment and search."
    : "Choose an environment to browse completed reviews.";

  const renderGrid = (items: ReviewRow[], inline: boolean) => (
    <div className={styles.grid}>
      <DataGrid
        items={items}
        columns={columns}
        sortable
        resizableColumns
        columnSizingOptions={columnSizing}
        getRowId={(row) => row.reviewId ?? row.botId}
        aria-label="Agent reviews"
      >
        <DataGridHeader>
          <DataGridRow>
            {({ renderHeaderCell }) => (
              <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>
            )}
          </DataGridRow>
        </DataGridHeader>
        <DataGridBody<ReviewRow>>
          {({ item, rowId }) => (
            <DataGridRow<ReviewRow>
              key={rowId}
              data-review-row={inline ? "" : undefined}
              style={inline
                ? { height: `${REVIEW_BROWSER_INLINE_ROW_HEIGHT}px` }
                : { minHeight: "60px" }}
            >
              {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
            </DataGridRow>
          )}
        </DataGridBody>
      </DataGrid>
    </div>
  );

  if (fullscreen) {
    return (
      <div
        className={styles.fullRoot}
        style={{ height: expandedHeight, minHeight: expandedHeight }}
      >
        <div className={styles.fullCard}>
          {headerView}

          {error && (
            <MessageBar intent="error">
              <MessageBarBody>{error}</MessageBarBody>
            </MessageBar>
          )}

          {filtersView}

          {loading ? (
            <div className={styles.empty}><Spinner label="Loading reviews" /></div>
          ) : pagedRows.length === 0 ? (
            <div className={styles.empty}>
              <Text>{emptyText}</Text>
            </div>
          ) : (
            <>
              {renderGrid(pagedRows, false)}
              <div className={styles.pagination}>
                <div className={styles.pageSize}>
                  <Text>Show</Text>
                  <Dropdown
                    value={String(pageSize)}
                    selectedOptions={[String(pageSize)]}
                    style={{ width: "80px", minWidth: "80px" }}
                    onOptionSelect={(_, option) => {
                      if (option.optionValue) setPageSize(Number(option.optionValue));
                    }}
                  >
                    {[5, 10, 25, 50, 100].map((size) => (
                      <Option key={size} value={String(size)} text={String(size)}>{size}</Option>
                    ))}
                  </Dropdown>
                  <Text>records per page</Text>
                </div>
                <div className={styles.navigation}>
                  <Button
                    icon={<ChevronLeftRegular />}
                    disabled={currentPage === 0}
                    onClick={() => setCurrentPage((page) => Math.max(0, page - 1))}
                  >
                    Previous
                  </Button>
                  <Text>
                    Page {currentPage + 1} of {totalPages} ({filteredRows.length} total)
                  </Text>
                  <Button
                    icon={<ChevronRightRegular />}
                    iconPosition="after"
                    disabled={currentPage >= totalPages - 1}
                    onClick={() =>
                      setCurrentPage((page) => Math.min(totalPages - 1, page + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // Inline shows one page of rows that fits the height budget, with no scroll.
  const total = filteredRows.length;
  const hasNextPage = inlineFirst + inlineRows.length < total;
  return (
    <div className={styles.root}>
      <div className={styles.card} style={{ maxHeight: `${inlineHeight}px` }}>
        <div
          ref={inlineContentRef}
          className={styles.inlineContent}
          data-review-inline-content=""
        >
          {headerView}
          {fullscreenUnavailable && (
            <Caption1 role="status" className={styles.inlineCaption}>
              Fullscreen is not available in this host.
            </Caption1>
          )}
          {error && (
            <MessageBar intent="error" className={styles.inlineMessage}>
              <MessageBarBody className={styles.inlineMessageText} title={error}>
                {error}
              </MessageBarBody>
            </MessageBar>
          )}
          {filtersView}
          {loading ? (
            <div className={styles.inlineEmpty}><Spinner label="Loading reviews" /></div>
          ) : inlineRows.length === 0 ? (
            <div className={styles.inlineEmpty}>
              <Text>{emptyText}</Text>
            </div>
          ) : (
            <>
              {renderGrid(inlineRows, true)}
              <div className={styles.inlineFooter}>
                <Text size={200} className={styles.inlineRange} aria-live="polite">
                  {reviewBrowserRangeCaption(inlineFirst, inlineRows.length, total)}
                </Text>
                <div className={styles.inlineNavigation}>
                  <Button
                    size="small"
                    icon={<ChevronLeftRegular />}
                    disabled={inlineFirst === 0}
                    onClick={() => setInlineStart(Math.max(0, inlineFirst - inlinePageSize))}
                  >
                    Previous page
                  </Button>
                  <Button
                    size="small"
                    icon={<ChevronRightRegular />}
                    iconPosition="after"
                    disabled={!hasNextPage}
                    onClick={() => setInlineStart(inlineFirst + inlinePageSize)}
                  >
                    Next page
                  </Button>
                  {!fullscreenUnavailable && total > inlinePageSize && (
                    <Button
                      size="small"
                      icon={<ArrowMaximizeRegular />}
                      onClick={() => void toggleFullscreen()}
                    >
                      {`View all ${total} reviews in full screen`}
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
