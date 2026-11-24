/**
 * TrendIndicator - Displays trend arrow + percentage badge.
 *
 * Shows green (positive) or red (negative) trend. When `isNewMetric` is true,
 * renders "New" instead of a percentage to avoid misleading 100% display.
 */

import React from "react";
import { makeStyles, tokens, Caption1Strong, Badge } from "@fluentui/react-components";
import {
  ArrowTrending20Regular,
  ArrowTrendingDown20Regular,
} from "@fluentui/react-icons";

export interface TrendIndicatorProps {
  trend?: number;
  invertTrend?: boolean;
  isNewMetric?: boolean;
}

const useStyles = makeStyles({
  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXXS,
    paddingLeft: tokens.spacingHorizontalXS,
    paddingRight: tokens.spacingHorizontalXS,
    paddingTop: tokens.spacingVerticalXXS,
    paddingBottom: tokens.spacingVerticalXXS,
    borderRadius: tokens.borderRadiusSmall,
  },
  positive: {
    backgroundColor: tokens.colorPaletteGreenBackground1,
    color: tokens.colorPaletteGreenForeground1,
  },
  negative: {
    backgroundColor: tokens.colorPaletteRedBackground1,
    color: tokens.colorPaletteRedForeground1,
  },
  newBadge: {
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorBrandForeground1,
  },
});

/** Trend arrow + percentage, with green/red semantic coloring. */
const TrendIndicator: React.FC<TrendIndicatorProps> = ({
  trend,
  invertTrend = false,
  isNewMetric = false,
}) => {
  const styles = useStyles();

  if (isNewMetric) {
    return (
      <Badge appearance="tint" color="informative" size="small">
        New
      </Badge>
    );
  }

  if (trend == null || trend === 0) return null;

  const isUp = trend > 0;
  const isPositive = invertTrend ? !isUp : isUp;
  const colorClass = isPositive ? styles.positive : styles.negative;

  const Icon = isUp ? ArrowTrending20Regular : ArrowTrendingDown20Regular;

  return (
    <span className={`${styles.badge} ${colorClass}`}>
      <Icon style={{ fontSize: tokens.fontSizeBase400 }} />
      <Caption1Strong>{Math.abs(trend) > 999 ? ">999%" : `${Math.abs(trend).toFixed(1)}%`}</Caption1Strong>
    </span>
  );
};

export default React.memo(TrendIndicator);
