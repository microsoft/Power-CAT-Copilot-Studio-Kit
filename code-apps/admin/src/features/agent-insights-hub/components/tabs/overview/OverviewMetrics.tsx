/**
 * OverviewMetrics - Row of 7 KPI MetricCard tiles with action buttons.
 *
 * Renders a Card with header containing title, subtitle, and 4 action
 * buttons (Sync now, Add agent, Show agents).
 * Each tile uses flex: '1 1 0' with minWidth: 150px.
 */

import React from "react";
import { makeStyles, tokens, Card, CardHeader, Subtitle2, Button, Tooltip } from "@fluentui/react-components";
import {
  ArrowSync20Regular,
  Add20Regular,
  Eye20Regular,
  Info16Regular,
} from "@fluentui/react-icons";
import { TAB_DESCRIPTIONS } from "../../../utils/metricDescriptions";
import { useDialogContext } from "../../../context/DialogContext";
import MetricCard from "../../MetricCard";
import type { OverviewMetric } from "../../../hooks/useOverviewMetrics";

export interface OverviewMetricsProps {
  metrics: OverviewMetric[];
  lastMetricDate?: string;
}

const useStyles = makeStyles({
  headerRow: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXS },
  infoIcon: { color: tokens.colorNeutralForeground3, cursor: "help", display: "flex", alignItems: "center" },
  metricsRow: {
    display: "flex",
    flexDirection: "row",
    alignItems: "stretch",
    gap: tokens.spacingHorizontalL,
    flexWrap: "wrap",
  },
  cardWrapper: {
    flex: "1 1 0",
    minWidth: "150px",
  },
  actions: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    flexShrink: 0,
    whiteSpace: "nowrap",
  },
});

/** Row of 7 KPI cards inside an Overview card with action buttons. */
const OverviewMetrics: React.FC<OverviewMetricsProps> = ({
  metrics,
  lastMetricDate,
}) => {
  const styles = useStyles();
  const { openDialog } = useDialogContext();

  if (metrics.length === 0) return null;

  const subtitle = lastMetricDate
    ? `Last updated ${lastMetricDate}`
    : undefined;

  return (
    <Card appearance="filled">
      <CardHeader
        header={<div className={styles.headerRow}><Subtitle2>Overview</Subtitle2><Tooltip content={TAB_DESCRIPTIONS.overview} relationship="description"><span className={styles.infoIcon}><Info16Regular /></span></Tooltip></div>}
        description={subtitle}
        action={
          <div className={styles.actions}>
            <Button
              appearance="outline"
              icon={<ArrowSync20Regular />}
              onClick={() => openDialog("generateMetrics")}
              size="small"
            >
              Sync
            </Button>
            <Button
              appearance="primary"
              icon={<Add20Regular />}
              onClick={() => openDialog("addAgent")}
              size="small"
            >
              Add agent
            </Button>
            <Button
              appearance="transparent"
              icon={<Eye20Regular />}
              onClick={() => openDialog("showAgents")}
              size="small"
            >
              Show agents
            </Button>
          </div>
        }
      />
      <div className={styles.metricsRow}>
        {metrics.map((m) => (
          <div key={m.label} className={styles.cardWrapper}>
            <MetricCard
              label={m.label}
              value={m.value}
              unit={m.unit}
              trend={m.trend}
              isNewMetric={m.isNewMetric}
              invertTrend={m.invertTrend}
              tooltip={m.tooltip}
            />
          </div>
        ))}
      </div>
    </Card>
  );
};

export default React.memo(OverviewMetrics);
