/**
 * HelpScreenLayout — Shared wrapper layout for Agent Type and Agent Behavior help screens.
 * Provides the back button, title/subtitle header row with FeedbackButton, and content slot.
 */
import { makeStyles, tokens, Button } from '@fluentui/react-components';
import { ArrowLeft20Regular } from '@fluentui/react-icons';
import { Body1, Subtitle1 } from '@fluentui/react-components';
import { FeedbackButton } from '../shared/FeedbackButton';
import type { ReactNode } from 'react';

interface HelpScreenLayoutProps {
  title: string;
  subtitle: string;
  onReturnToDashboard: () => void;
  children: ReactNode;
}

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100%',
  },
  contentRegion: {
    maxWidth: '1366px',
    width: '100%',
    marginLeft: 'auto',
    marginRight: 'auto',
    paddingTop: tokens.spacingVerticalM,
    paddingRight: tokens.spacingHorizontalXL,
    paddingLeft: tokens.spacingHorizontalXL,
    paddingBottom: tokens.spacingVerticalXXL,
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  headerRow: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalL,
  },
  headerLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  subtitle: {
    color: tokens.colorNeutralForeground2,
    marginBottom: tokens.spacingVerticalL,
  },
});

/**
 * Shared layout for help screens. Renders a back button at the top,
 * then a header row (title + subtitle on the left, FeedbackButton on the right),
 * followed by the main content area.
 */
export function HelpScreenLayout({
  title,
  subtitle,
  onReturnToDashboard,
  children,
}: HelpScreenLayoutProps) {
  const styles = useStyles();

  return (
    <div className={styles.root}>
      <div className={styles.contentRegion}>
        {/* Back button */}
        <div>
          <Button
            appearance="outline"
            icon={<ArrowLeft20Regular />}
            onClick={onReturnToDashboard}
            aria-label="Return to dashboard"
          >
            Return to dashboard
          </Button>
        </div>

        {/* Header row: title + subtitle (left) + FeedbackButton (right) */}
        <div className={styles.headerRow}>
          <div className={styles.headerLeft}>
            <Subtitle1 as="h1">{title}</Subtitle1>
            <Body1 className={styles.subtitle}>{subtitle}</Body1>
          </div>
          <FeedbackButton />
        </div>

        {/* Main content */}
        {children}
      </div>
    </div>
  );
}

export default HelpScreenLayout;
