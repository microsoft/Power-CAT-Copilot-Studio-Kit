import { Tab, TabList, makeStyles, tokens } from '@fluentui/react-components';
import {
  MapRegular,
  MoneySettingsRegular,
  TaskListSquareSparkleRegular,
} from '@fluentui/react-icons';

export type ReviewSection = 'review' | 'map' | 'cost';

interface ReviewSectionNavigationProps {
  selectedSection: ReviewSection;
  onSectionChange: (section: ReviewSection) => void;
}

const useStyles = makeStyles({
  root: {
    flexShrink: 0,
  },
  tabs: {
    width: '100%',
    padding: 0,
    flexWrap: 'wrap',
    rowGap: tokens.spacingVerticalXS,
  },
});

/**
 * Selects the main workspace shown for an agent review.
 */
export function ReviewSectionNavigation({
  selectedSection,
  onSectionChange,
}: ReviewSectionNavigationProps) {
  const styles = useStyles();

  return (
    <nav className={styles.root} aria-label="Review workspace">
      <TabList
        className={styles.tabs}
        appearance="subtle-circular"
        size="medium"
        selectedValue={selectedSection}
        onTabSelect={(_, data) => onSectionChange(data.value as ReviewSection)}
        aria-label="Review sections"
      >
        <Tab
          icon={<TaskListSquareSparkleRegular />}
          value="review"
          id="copilot-review-section-review"
          aria-controls="copilot-review-section-panel-review"
        >
          Review
        </Tab>
        <Tab
          icon={<MapRegular />}
          value="map"
          id="copilot-review-section-map"
          aria-controls="copilot-review-section-panel-map"
        >
          Architecture
        </Tab>
        <Tab
          icon={<MoneySettingsRegular />}
          value="cost"
          id="copilot-review-section-cost"
          aria-controls="copilot-review-section-panel-cost"
        >
          Cost &amp; efficiency
        </Tab>
      </TabList>
    </nav>
  );
}
