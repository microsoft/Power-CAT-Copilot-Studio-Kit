/**
 * HeroSection Component
 *
 * Dismissible info banner introducing the tool with action buttons.
 * Based on ui-specification.md Section 3.6
 *
 * Features:
 * - MessageBar with info intent (blue background)
 * - Title with BotSparkle icon
 * - Descriptive text
 * - Action buttons (Start Review, Learn More, Documentation, Best Practices)
 * - Dismissible with localStorage persistence
 *
 * Styling:
 * - Margin bottom: 16px
 * - Gap between elements: 8px
 * - Gap between buttons: 16px
 * - Button size: "small"
 */

import React, { useState } from 'react';
import {
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Button,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import {
  BotSparkle24Regular,
  SparkleRegular,
  BookRegular,
  DocumentRegular,
  LightbulbRegular,
  DismissRegular,
} from '@fluentui/react-icons';

/**
 * HeroSection props
 */
export interface HeroSectionProps {
  /** Callback when dismiss button is clicked */
  onDismiss?: () => void;

  /** Callback when Start Review button is clicked */
  onStartReview?: () => void;

  /** localStorage key for persistence (default: 'agentReviewTool.heroDismissed') */
  storageKey?: string;
}

const useStyles = makeStyles({
  messageBar: {
    marginBottom: '16px',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  description: {
    fontSize: '14px',
    lineHeight: '20px',
    color: tokens.colorNeutralForeground2,
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    marginTop: '8px',
    flexWrap: 'wrap',
  },
});

/**
 * HeroSection component
 *
 * Displays an informational banner with quick action buttons.
 * Dismissible with localStorage persistence.
 *
 * @example
 * ```tsx
 * <HeroSection
 *   onStartReview={() => scrollToGrid()}
 *   onDismiss={() => setShowHero(false)}
 * />
 * ```
 */
export function HeroSection({
  onDismiss,
  onStartReview,
  storageKey = 'agentReviewTool.heroDismissed',
}: HeroSectionProps) {
  const styles = useStyles();
  // Initialize from localStorage to avoid setState in effect
  const [isVisible, setIsVisible] = useState(() => {
    const dismissed = localStorage.getItem(storageKey);
    return dismissed !== 'true';
  });

  // Handle dismiss
  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem(storageKey, 'true');
    onDismiss?.();
  };

  if (!isVisible) {
    return null;
  }

  return (
    <MessageBar intent="info" className={styles.messageBar}>
      <MessageBarBody>
        <div className={styles.content}>
          {/* Title with icon */}
          <div className={styles.titleRow}>
            <BotSparkle24Regular />
            <MessageBarTitle>Welcome to Agent Review Tool</MessageBarTitle>
          </div>

          {/* Description */}
          <div className={styles.description}>
            Review bot configurations, detect anti-patterns in instructions, and
            track optimization progress. Identify quality issues, analyze topic
            patterns, and get actionable recommendations to improve agent
            performance.
          </div>

          {/* Actions */}
          <div className={styles.actions}>
            <Button
              appearance="primary"
              size="small"
              icon={<SparkleRegular />}
              onClick={onStartReview}
            >
              Start Review
            </Button>
            <Button
              appearance="secondary"
              size="small"
              icon={<BookRegular />}
              onClick={() =>
                window.open(
                  'https://learn.microsoft.com/copilot-studio',
                  '_blank'
                )
              }
            >
              Learn More
            </Button>
            <Button
              appearance="secondary"
              size="small"
              icon={<DocumentRegular />}
              onClick={() =>
                window.open(
                  'https://learn.microsoft.com/copilot-studio/fundamentals-what-is-copilot-studio',
                  '_blank'
                )
              }
            >
              Documentation
            </Button>
            <Button
              appearance="secondary"
              size="small"
              icon={<LightbulbRegular />}
              onClick={() =>
                window.open(
                  'https://learn.microsoft.com/copilot-studio/guidance/design-best-practices',
                  '_blank'
                )
              }
            >
              Best Practices
            </Button>
          </div>
        </div>
      </MessageBarBody>

      <Button
        appearance="transparent"
        icon={<DismissRegular />}
        size="small"
        onClick={handleDismiss}
      />
    </MessageBar>
  );
}
