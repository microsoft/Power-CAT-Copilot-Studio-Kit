/**
 * QuickLinks Component
 *
 * 3-card grid layout with resource links at bottom of dashboard.
 * Based on Figma node-id=25-296
 *
 * Cards:
 * 1. Learn More - BookRegular icon
 * 2. Documentation - DocumentRegular icon
 * 3. Best Practices - Lightbulb32Regular icon
 *
 * Layout:
 * - 3 columns grid
 * - 16px gap between cards
 * - 16px padding top/bottom, 4px padding left/right
 * - Each card: white background, shadow, 4px border-radius, 12px padding
 */

import React from 'react';
import { Card, CardHeader, makeStyles, Text, tokens } from '@fluentui/react-components';
import {
  BookRegular,
  DocumentRegular,
  Lightbulb32Regular,
} from '@fluentui/react-icons';

/**
 * QuickLinks props
 */
export interface QuickLinksProps {
  /** Optional callback when Learn More is clicked */
  onLearnMore?: () => void;

  /** Optional callback when Documentation is clicked */
  onDocumentation?: () => void;

  /** Optional callback when Best Practices is clicked */
  onBestPractices?: () => void;
}

const useStyles = makeStyles({
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    paddingTop: '24px',
  },
  container: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: '16px',
    paddingBottom: '16px',
    paddingLeft: '4px',
    paddingRight: '4px',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: '4px',
    boxShadow:
      '0px 0px 2px 0px rgba(0, 0, 0, 0.12), 0px 2px 4px 0px rgba(0, 0, 0, 0.14)',
    padding: '12px',
    cursor: 'pointer',
    transition: 'box-shadow 0.2s',
    '&:hover': {
      boxShadow:
        '0px 0px 4px 0px rgba(0, 0, 0, 0.16), 0px 4px 8px 0px rgba(0, 0, 0, 0.18)',
    },
  },
  cardContent: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
  },
  textContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    flex: 1,
  },
  title: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#242424',
    lineHeight: '20px',
  },
  subtitle: {
    fontSize: '12px',
    fontWeight: 400,
    color: '#242424',
    lineHeight: '20px',
  },
  icon24: {
    fontSize: '24px',
    flexShrink: 0,
    color: tokens.colorBrandForeground1,
  },
  icon32: {
    fontSize: '32px',
    flexShrink: 0,
    color: tokens.colorBrandForeground1,
  },
});

/**
 * QuickLinks component
 *
 * Displays 3 resource cards for learning, documentation, and best practices.
 *
 * @example
 * ```tsx
 * <QuickLinks
 *   onLearnMore={() => window.open('/learn')}
 *   onDocumentation={() => window.open('/docs')}
 *   onBestPractices={() => window.open('/best-practices')}
 * />
 * ```
 */
export function QuickLinks({
  onLearnMore,
  onDocumentation,
  onBestPractices,
}: QuickLinksProps) {
  const styles = useStyles();

  const handleLearnMore = () => {
    if (onLearnMore) {
      onLearnMore();
    } else {
      window.open(
        'https://microsoft.github.io/mcscatblog/posts/agent-review-tool/',
        '_blank'
      );
    }
  };

  const handleDocumentation = () => {
    if (onDocumentation) {
      onDocumentation();
    } else {
      window.open(
        'https://github.com/microsoft/Power-CAT-Copilot-Studio-Kit/blob/main/AGENTREVIEWTOOL_REFERENCE_GUIDE.md',
        '_blank'
      );
    }
  };

  const handleBestPractices = () => {
    if (onBestPractices) {
      onBestPractices();
    } else {
      window.open(
        'https://learn.microsoft.com/microsoft-copilot-studio/agents-experience/analytics-agent-evaluation-intro',
        '_blank'
      );
    }
  };

  return (
    <div className={styles.wrapper}>
      {/* Section title */}
      <Text size={500} weight="semibold">Quick Links</Text>

      {/* Cards grid */}
      <div className={styles.container}>
      {/* Card 1: Agent Review Walkthrough */}
      <Card className={styles.card} onClick={handleLearnMore}>
        <CardHeader
          image={<BookRegular className={styles.icon24} />}
          header={<Text className={styles.title}>Review loop</Text>}
          description={
            <Text className={styles.subtitle}>
              Pre-release review workflow for Microsoft Copilot agents
            </Text>
          }
        />
      </Card>

      {/* Card 2: Documentation */}
      <Card className={styles.card} onClick={handleDocumentation}>
        <CardHeader
          image={<DocumentRegular className={styles.icon24} />}
          header={<Text className={styles.title}>Documentation</Text>}
          description={
            <Text className={styles.subtitle}>
              Understanding your agent review results
            </Text>
          }
        />
      </Card>

      {/* Card 3: Evaluate Agents */}
      <Card className={styles.card} onClick={handleBestPractices}>
        <CardHeader
          image={<Lightbulb32Regular className={styles.icon32} />}
          header={<Text className={styles.title}>Build better agents</Text>}
          description={
            <Text className={styles.subtitle}>
              Microsoft guidance for building effective agents
            </Text>
          }
        />
      </Card>
      </div>
    </div>
  );
}
