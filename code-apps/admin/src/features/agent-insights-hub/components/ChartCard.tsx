/**
 * ChartCard - Card Layout 2 (Chart/Visualization container).
 *
 * CardHeader with Subtitle2 title. Plain div wrapper (NOT CardPreview per Cards.md Layout 2).
 * NO footer slot (explicitly excluded per Cards.md Layout 2).
 * Three-layer overflow control: Layer 1 is at CardPreview level.
 */

import React from "react";
import {
  makeStyles,
  tokens,
  Card,
  CardHeader,
  Subtitle2,
  Tooltip,
} from "@fluentui/react-components";
import { Info16Regular } from "@fluentui/react-icons";
import type { ChartCardProps } from "../contracts/types";

const useStyles = makeStyles({
  card: {
    width: "100%",
    height: "100%",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalXS,
  },
  infoIcon: {
    color: tokens.colorNeutralForeground3,
    cursor: "help",
    display: "flex",
    alignItems: "center",
  },
  preview: {
    overflow: "hidden",
    paddingTop: tokens.spacingVerticalS,
    paddingBottom: tokens.spacingVerticalM,
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalM,
  },
});

/** Chart card container with Subtitle2 title and overflow-hidden preview. */
const ChartCard: React.FC<ChartCardProps> = ({
  title,
  tooltip,
  children,
  minHeight = "250px",
}) => {
  const styles = useStyles();

  const headerContent = (
    <div className={styles.header}>
      <Subtitle2>{title}</Subtitle2>
      {tooltip && (
        <Tooltip content={tooltip} relationship="description">
          <span className={styles.infoIcon}>
            <Info16Regular />
          </span>
        </Tooltip>
      )}
    </div>
  );

  return (
    <Card appearance="filled" className={styles.card}>
      <CardHeader header={headerContent} />
      <div className={styles.preview} style={{ minHeight }}>
        {children}
      </div>
      {/* NO footer slot — Card Layout 2 excludes footer per Cards.md */}
    </Card>
  );
};

export default React.memo(ChartCard);
