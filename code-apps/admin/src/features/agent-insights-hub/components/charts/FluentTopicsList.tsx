/**
 * FluentTopicsList - Styled ranked list for top topics.
 *
 * Not a chart component — renders colored indicators + topic names + counts.
 * Uses CHART_COLORS_ARRAY for color indicators.
 */

import React from "react";
import { makeStyles, tokens, Body1, Body1Strong } from "@fluentui/react-components";
import { CHART_COLORS_ARRAY } from "../../contracts/types";

export interface TopicsListItem {
  label: string;
  value: number;
  color?: string;
}

export interface FluentTopicsListProps {
  items: TopicsListItem[];
}

const useStyles = makeStyles({
  list: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
    width: "100%",
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    paddingTop: tokens.spacingVerticalXS,
    paddingBottom: tokens.spacingVerticalXS,
  },
  indicator: {
    width: tokens.spacingHorizontalSNudge,
    height: tokens.spacingHorizontalSNudge,
    borderRadius: tokens.borderRadiusCircular,
    flexShrink: 0,
  },
  label: {
    flex: "1 1 auto",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: tokens.colorNeutralForeground1,
  },
  value: {
    flexShrink: 0,
    color: tokens.colorNeutralForeground2,
  },
  rank: {
    flexShrink: 0,
    width: tokens.spacingHorizontalXL,
    textAlign: "center",
    color: tokens.colorNeutralForeground3,
  },
});

/** Ranked topic list with colored indicators and counts. */
const FluentTopicsList: React.FC<FluentTopicsListProps> = ({ items }) => {
  const styles = useStyles();

  if (items.length === 0) return null;

  return (
    <div className={styles.list}>
      {items.map((item, idx) => (
        <div key={item.label} className={styles.row}>
          <Body1 className={styles.rank}>{idx + 1}</Body1>
          <span
            className={styles.indicator}
            style={{
              backgroundColor:
                item.color ?? CHART_COLORS_ARRAY[idx % CHART_COLORS_ARRAY.length],
            }}
          />
          <Body1 className={styles.label} title={item.label}>
            {item.label}
          </Body1>
          <Body1Strong className={styles.value}>
            {item.value.toLocaleString()}
          </Body1Strong>
        </div>
      ))}
    </div>
  );
};

export default React.memo(FluentTopicsList);
