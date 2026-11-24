/**
 * EmptyStates - Two variants for when no data is available.
 *
 * 1. NoConfigsEmpty: "No insights yet" — no configurations exist
 * 2. NoDataEmpty: Configs exist but no metrics data — prompts sync
 *
 * Both variants show: Add agent, Sync now buttons
 * and a Learn more link.
 */

import React from "react";
import {
  makeStyles,
  tokens,
  Subtitle2,
  Body1,
  Button,
  Link,
} from "@fluentui/react-components";
import {
  Add20Regular,
  ArrowSync20Regular,
  Eye20Regular,
  Folder20Regular,
} from "@fluentui/react-icons";
import { useDialogContext } from "../context/DialogContext";
import { useFilterContext } from "../context/FilterContext";
import noResultsImage from "../../../shared/assets/no-results.png?inline";

export interface EmptyStatesProps {
  variant: "no-configs" | "no-data" | "no-filter-results";
  message?: string;
}

const LEARN_MORE_URL = "https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/AGENT_INSIGHTS_HUB.md";

const useStyles = makeStyles({
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: tokens.spacingVerticalL,
    paddingTop: tokens.spacingVerticalXXL,
    paddingBottom: tokens.spacingVerticalXXL,
    paddingLeft: tokens.spacingHorizontalXL,
    paddingRight: tokens.spacingHorizontalXL,
    textAlign: "center",
    minHeight: "300px",
  },
  iconContainer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "80px",
    height: "80px",
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorNeutralBackground4,
    color: tokens.colorNeutralForeground3,
  },
  description: {
    color: tokens.colorNeutralForeground3,
    maxWidth: "480px",
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    gap: tokens.spacingHorizontalM,
    justifyContent: "center",
  },
  noResultsImg: {
    width: "120px",
    height: "120px",
  },
});

/** Empty state component with action buttons. */
const EmptyStates: React.FC<EmptyStatesProps> = ({ variant, message }) => {
  const styles = useStyles();
  const { openDialog } = useDialogContext();
  const { configurations } = useFilterContext();
  const configCount = configurations.length;

  if (variant === "no-filter-results") {
    return (
      <div className={styles.container}>
        <Subtitle2>No results found</Subtitle2>
        <img src={noResultsImage} alt="No results" className={styles.noResultsImg} />
        <Body1 className={styles.description}>
          {message ?? "No data matches the current filters. Try adjusting the agent, date range, channel, or data mode filters to see results."}
        </Body1>
      </div>
    );
  }

  const description =
    variant === "no-configs"
      ? "Add agents to start seeing insights about your Agent performance and user engagement."
      : `You have ${configCount} agent configuration${configCount !== 1 ? "s" : ""}. Sync to start collecting metrics data.`;

  return (
    <div className={styles.container}>
      <div className={styles.iconContainer}>
        <Folder20Regular style={{ fontSize: tokens.fontSizeHero800 }} />
      </div>
      <Subtitle2>No insights yet</Subtitle2>
      <Body1 className={styles.description}>{description}</Body1>
      <Link href={LEARN_MORE_URL} target="_blank" rel="noopener noreferrer">
        Learn more
      </Link>
      <div className={styles.actions}>
        <Button
          appearance="primary"
          icon={<Add20Regular />}
          onClick={() => openDialog("addAgent")}
        >
          Add agent
        </Button>
        {configCount > 0 && (
          <Button
            appearance="outline"
            icon={<Eye20Regular />}
            onClick={() => openDialog("showAgents")}
          >
            Show agents
          </Button>
        )}
        <Button
          appearance="outline"
          icon={<ArrowSync20Regular />}
          onClick={() => openDialog("generateMetrics")}
        >
          Sync now
        </Button>
      </div>
    </div>
  );
};

export default React.memo(EmptyStates);
