/**
 * MetricCard - Card Layout 4 (Analytics/Metrics) for KPI display.
 *
 * Uses a plain <div> body (NOT CardPreview) to preserve horizontal flex layout.
 * Each tile uses `flex: '1 1 0'` with `minWidth: 150px` per Flex Item Sizing Rule.
 */

import React from "react";
import {
  makeStyles,
  tokens,
  Body1,
  Subtitle2,
  Spinner,
  Tooltip,
} from "@fluentui/react-components";
import { Info16Regular } from "@fluentui/react-icons";
import type { MetricCardProps } from "../contracts/types";
import { formatCompact } from "../utils/metricCalculations";
import TrendIndicator from "./TrendIndicator";

const useStyles = makeStyles({
  tile: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXXS,
    flex: "1 1 0",
    minWidth: "150px",
    maxWidth: "220px",
    paddingTop: tokens.spacingVerticalS,
    paddingBottom: tokens.spacingVerticalS,
  },
  labelRow: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXS,
  },
  label: {
    color: tokens.colorNeutralForeground2,
  },
  infoIcon: {
    color: tokens.colorNeutralForeground3,
    cursor: "help",
    display: "flex",
    alignItems: "center",
  },
  valueRow: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXS,
    whiteSpace: "nowrap",
  },
});

/**
 * Single KPI metric tile. Designed to be placed inside a horizontal
 * flex container wrapped by a Card (Layout 4).
 */
const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  unit,
  trend,
  isNewMetric,
  invertTrend,
  loading,
  tooltip,
  icon,
}) => {
  const styles = useStyles();

  if (loading) {
    return (
      <div className={styles.tile}>
        <Spinner size="tiny" />
      </div>
    );
  }

  // Compact large numeric values to prevent overflow in the tile
  const numericValue = Number(String(value).replace(/,/g, ""));
  const compactValue = !isNaN(numericValue) && numericValue >= 100_000
    ? formatCompact(numericValue)
    : String(value);
  const displayValue = unit ? `${compactValue} ${unit}` : compactValue;

  return (
    <div className={styles.tile}>
      <div className={styles.labelRow}>
        {icon}
        <Body1 className={styles.label}>{label}</Body1>
        {tooltip && (
          <Tooltip content={tooltip} relationship="description">
            <span className={styles.infoIcon}>
              <Info16Regular />
            </span>
          </Tooltip>
        )}
      </div>
      <div className={styles.valueRow}>
        <Subtitle2>{displayValue}</Subtitle2>
        <TrendIndicator
          trend={trend}
          invertTrend={invertTrend}
          isNewMetric={isNewMetric}
        />
      </div>
    </div>
  );
};

export default React.memo(MetricCard);
