/**
 * Test Sets section: a header with "See all" link and a responsive 4-column
 * grid of TestSetCard. "See all" redirects to the Agent Test Set MDA list
 * view when running inside the Power Apps Model-Driven App.
 */

import {
  Link,
  MessageBar,
  MessageBarBody,
  Skeleton,
  SkeletonItem,
  Subtitle1,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { navigateToMda } from "../../../shared/utils/mda-navigation";
import { useRecentTestSets } from "../hooks/useRecentTestSets";
import { mdaPages } from "../services/mda-pages";
import { TestSetCard } from "./TestSetCard";

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
  grid: {
    display: "grid",
    gap: tokens.spacingHorizontalL,
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    "@media (max-width: 1024px)": { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" },
    "@media (max-width: 600px)": { gridTemplateColumns: "1fr" },
  },
  skeletonCard: {
    height: "104px",
    padding: tokens.spacingVerticalM,
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
});

export function TestSetsSection() {
  const styles = useStyles();
  const { data, isLoading, error } = useRecentTestSets(4);

  const onSeeAll = () => {
    navigateToMda(mdaPages.testSetList);
  };

  return (
    <section className={styles.section} aria-label="Test sets">
      <div className={styles.headerRow}>
        <Subtitle1 as="h2">Test sets</Subtitle1>
        <Link onClick={onSeeAll} as="button">See all</Link>
      </div>

      {error ? (
        <MessageBar intent="error">
          <MessageBarBody>Unable to load test sets.</MessageBarBody>
        </MessageBar>
      ) : null}

      {isLoading ? (
        <div className={styles.grid}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={styles.skeletonCard}>
              <Skeleton>
                <SkeletonItem size={16} />
                <SkeletonItem size={12} style={{ marginTop: 8 }} />
                <SkeletonItem size={12} style={{ marginTop: 12, width: "60%" }} />
              </Skeleton>
            </div>
          ))}
        </div>
      ) : data && data.length > 0 ? (
        <div className={styles.grid}>
          {data.map((set) => (
            <TestSetCard key={set.cat_copilottestsetid} testSet={set} />
          ))}
        </div>
      ) : !error ? (
        <MessageBar intent="info">
          <MessageBarBody>No test sets yet. Create one to get started.</MessageBarBody>
        </MessageBar>
      ) : null}
    </section>
  );
}
