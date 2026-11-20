/**
 * Compact Test Set summary card — Figma 2142:58931.
 *   Line 1: test set name (bold).
 *   Line 2: "<N> test cases".
 *   Line 3: "Last modified by <user>, <when>".
 *   Badge row: distinct test methods count.
 */

import {
  Badge,
  Card,
  Text,
  Tooltip,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { navigateToMda } from "../../../shared/utils/mda-navigation";
import type { TestSetSummary } from "../contracts/types";
import { mdaPages } from "../services/mda-pages";
import { formatRelativeTime } from "../utils/relative-time";

export type TestSetCardProps = {
  testSet: TestSetSummary;
};

const useStyles = makeStyles({
  card: {
    width: "100%",
    cursor: "pointer",
    padding: tokens.spacingVerticalM,
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalL,
  },
  textBlock: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalXS,
    minWidth: 0,
  },
  title: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  subtitle: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: tokens.colorNeutralForeground3,
  },
  badges: {
    display: "flex",
    gap: tokens.spacingHorizontalS,
    flexWrap: "wrap",
  },
});

export function TestSetCard({ testSet }: TestSetCardProps) {
  const styles = useStyles();

  const openTestSet = () => {
    navigateToMda(mdaPages.testSetById(testSet.cat_copilottestsetid));
  };

  const testCaseLabel =
    testSet.testCaseCount === 1 ? "1 test case" : `${testSet.testCaseCount} test cases`;
  const modifiedBy = testSet.latestTestModifiedByName;
  const modifiedWhen = formatRelativeTime(testSet.latestTestModifiedOn ?? testSet.modifiedon ?? null);
  const modifiedLine = modifiedBy
    ? `Last modified by ${modifiedBy}${modifiedWhen ? `, ${modifiedWhen}` : ""}`
    : modifiedWhen
      ? `Last modified ${modifiedWhen}`
      : "";

  return (
    <Card
      className={styles.card}
      onClick={openTestSet}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openTestSet();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className={styles.textBlock}>
        <Tooltip content={testSet.cat_name} relationship="label">
          <Text weight="semibold" className={styles.title}>
            {testSet.cat_name}
          </Text>
        </Tooltip>
        <Text size={200} className={styles.subtitle}>
          {testCaseLabel}
        </Text>
        {modifiedLine ? (
          <Tooltip content={modifiedLine} relationship="label">
            <Text size={200} className={styles.subtitle}>{modifiedLine}</Text>
          </Tooltip>
        ) : null}
      </div>
      <div className={styles.badges}>
        <Badge appearance="outline" color="informative">
          {testSet.distinctTestMethodCount === 1
            ? "1 test method"
            : `${testSet.distinctTestMethodCount} test methods`}
        </Badge>
      </div>
    </Card>
  );
}
