/**
 * DetailPanel — Right-side detail panel for Agent Type and Agent Behavior help screens.
 * Shows a customer story, heading, checkmark list, and a "Read the story" link.
 */
import { makeStyles, tokens, Card, Button, Divider } from '@fluentui/react-components';
import { Body1, Subtitle1, Body1Strong } from '@fluentui/react-components';
import { Checkmark16Filled } from '@fluentui/react-icons';

interface DetailPanelProps {
  /** Image source for the customer logo */
  customerLogoSrc: string;
  /** Customer/company name for alt text */
  customerName: string;
  /** Short customer story description */
  customerStory: string;
  /** Main heading text, e.g. "Agent type: Assistant" */
  heading: string;
  /** Label above the checkmark list, e.g. "Value benefits" or "Common agent types" */
  listLabel: string;
  /** Items to show in the checkmark list */
  listItems: string[];
  /** Optional example text shown below the heading (used by behavior screen) */
  exampleText?: string;
  /** URL for the "Read the story →" button */
  storyUrl: string;
}

const useStyles = makeStyles({
  card: {
    borderRadius: tokens.borderRadiusLarge,
    padding: '28px',
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow4,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    height: '100%',
    boxSizing: 'border-box',
  },
  customerRow: {
    display: 'flex',
    flexDirection: 'row',
    gap: tokens.spacingHorizontalL,
    alignItems: 'center',
  },
  logoWrapper: {
    width: '100px',
    height: '70px',
    borderRadius: '8px',
    backgroundColor: tokens.colorBrandBackground2,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
  },
  logoImage: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
  },
  heading: {
    color: tokens.colorNeutralForeground1,
  },
  exampleText: {
    fontStyle: 'italic',
    color: tokens.colorNeutralForeground2,
  },
  listLabel: {
    color: tokens.colorNeutralForeground1,
    marginBottom: tokens.spacingVerticalS,
  },
  checkList: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    listStyle: 'none',
    padding: 0,
    margin: 0,
  },
  checkItem: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  checkIcon: {
    color: tokens.colorPaletteGreenForeground1,
    flexShrink: 0,
  },
  readMoreButton: {
    alignSelf: 'flex-start',
    marginTop: 'auto',
  },
});

/**
 * Shared detail panel used by AgentTypeHelpScreen and AgentBehaviorHelpScreen.
 * Displays a customer story, benefit/type checkmarks, and a story link.
 */
export function DetailPanel({
  customerLogoSrc,
  customerName,
  customerStory,
  heading,
  listLabel,
  listItems,
  exampleText,
  storyUrl,
}: DetailPanelProps) {
  const styles = useStyles();

  const handleReadStory = () => {
    window.open(storyUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <Card appearance="filled" className={styles.card}>
      {/* Customer story row */}
      <div className={styles.customerRow}>
        <div className={styles.logoWrapper}>
          <img
            src={customerLogoSrc}
            alt={`${customerName} logo`}
            className={styles.logoImage}
          />
        </div>
        <Body1>{customerStory}</Body1>
      </div>

      <Divider />

      {/* Heading */}
      <Subtitle1 className={styles.heading}>{heading}</Subtitle1>

      {/* Optional example text (behavior screen only) */}
      {exampleText && (
        <Body1 className={styles.exampleText}>
          Example: {exampleText}
        </Body1>
      )}

      {/* Checkmark list */}
      <div>
        <Body1Strong className={styles.listLabel}>{listLabel}</Body1Strong>
        <ul className={styles.checkList} aria-label={listLabel}>
          {listItems.map((item) => (
            <li key={item} className={styles.checkItem}>
              <Checkmark16Filled
                className={styles.checkIcon}
                aria-hidden="true"
              />
              <Body1>{item}</Body1>
            </li>
          ))}
        </ul>
      </div>

      {/* Read the story link */}
      <Button
        appearance="outline"
        className={styles.readMoreButton}
        onClick={handleReadStory}
        aria-label={`Read the customer story for ${customerName} (opens in new tab)`}
      >
        Read the story →
      </Button>
    </Card>
  );
}

export default DetailPanel;
