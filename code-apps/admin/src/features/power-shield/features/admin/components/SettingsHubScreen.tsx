import { useState, useEffect } from 'react';
import {
  Card,
  makeStyles,
  tokens,
  Text,
  Badge,
  Spinner,
} from '@fluentui/react-components';
import {
  ChevronRightRegular,
  ShieldRegular,
  PlugConnectedRegular,
  QuestionCircleRegular,
  WrenchRegular,
} from '@fluentui/react-icons';
import { useNavigate } from '../../../shared/hooks/useNavigate';
import { useLayoutStyles } from '../../../shared/styles';
import { PowerShieldBreadcrumb } from '../../../shared/components/PowerShieldBreadcrumb';
import { getQuestionCategories, getQuestions } from '../services/questionConfigService';
import { validateNotificationSettings } from '../services/notificationSettingsService';

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  subtitle: {
    color: tokens.colorNeutralForeground3,
  },
  groupSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  groupHeader: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  groupIcon: {
    fontSize: tokens.fontSizeBase500,
    color: tokens.colorBrandForeground1,
  },
  groupTitle: {
    fontSize: tokens.fontSizeBase400,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
  },
  groupDescription: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    marginTop: `-${tokens.spacingVerticalXXS}`,
  },
  settingCard: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    cursor: 'pointer',
  },
  settingContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    flex: 1,
    minWidth: 0,
  },
  settingTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  settingIcon: {
    fontSize: tokens.fontSizeBase400,
    color: tokens.colorNeutralForeground3,
    flexShrink: 0,
  },
  settingTitle: {
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground1,
  },
  settingDescription: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    paddingLeft: tokens.spacingHorizontalXL,
  },
  chevron: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase400,
    flexShrink: 0,
    marginLeft: tokens.spacingHorizontalM,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface SettingsSummary {
  categoryCount: number | null;
  questionCount: number | null;
  notificationsConfigured: boolean | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function SettingsHubScreen() {
  const styles = useStyles();
  const layoutStyles = useLayoutStyles();
  const navigate = useNavigate();

  const [summary, setSummary] = useState<SettingsSummary>({
    categoryCount: null,
    questionCount: null,
    notificationsConfigured: null,
  });

  useEffect(() => {
    void (async () => {
      const [categories, questions, validation] = await Promise.allSettled([
        getQuestionCategories(),
        getQuestions(),
        validateNotificationSettings(),
      ]);

      setSummary({
        categoryCount: categories.status === 'fulfilled' ? categories.value.length : null,
        questionCount: questions.status === 'fulfilled' ? questions.value.length : null,
        notificationsConfigured: validation.status === 'fulfilled' ? validation.value.isValid : null,
      });
    })();
  }, []);

  function renderBadge(text: string | null | undefined) {
    if (text === undefined) return null;
    if (text === null) return <Spinner size="tiny" />;
    return (
      <Badge appearance="tint" size="small" color="informative">
        {text}
      </Badge>
    );
  }

  const questionBadge =
    summary.categoryCount !== null && summary.questionCount !== null
      ? `${summary.categoryCount} ${summary.categoryCount !== 1 ? 'categories' : 'category'} · ${summary.questionCount} ${summary.questionCount !== 1 ? 'questions' : 'question'}`
      : null;

  const notificationBadge =
    summary.notificationsConfigured !== null
      ? summary.notificationsConfigured
        ? 'Enabled'
        : 'Not configured'
      : null;

  const sections = [
    {
      key: 'setup',
      icon: <PlugConnectedRegular className={styles.settingIcon} />,
      title: 'Setup',
      description: 'Configure prerequisites - connections, cloud flows, and email notifications',
      badge: notificationBadge,
      route: '/settings/setup',
    },
    {
      key: 'connectors',
      icon: <WrenchRegular className={styles.settingIcon} />,
      title: 'Connector Configurations',
      description: 'Manage connector catalog, risk levels, and visibility',
      badge: undefined,
      route: '/settings/connectors',
    },
    {
      key: 'questions',
      icon: <QuestionCircleRegular className={styles.settingIcon} />,
      title: 'Question Configurations',
      description: 'Configure the questionnaire makers complete when requesting access',
      badge: questionBadge,
      route: '/settings/questions',
    },
  ];

  return (
    <div className={layoutStyles.pageContainer}>
      <PowerShieldBreadcrumb segments={[{ label: 'Settings' }]} />

      {/* Page title */}
      <div className={styles.header}>
        <Text as="h1" size={700} weight="semibold">
          Settings
        </Text>
        <Text className={styles.subtitle}>
          Manage Request Center configuration and administration
        </Text>
      </div>

      {/* Group section */}
      <div className={styles.groupSection}>
        <div className={styles.groupHeader}>
          <ShieldRegular className={styles.groupIcon} />
          <span className={styles.groupTitle}>Request Center Administration</span>
        </div>
        <span className={styles.groupDescription}>
          Configure connectors, questionnaires, and notification delivery for your organization.
        </span>

        {/* Settings cards */}
        {sections.map((section) => (
          <Card
            key={section.key}
            appearance="outline"
            className={styles.settingCard}
            onClick={() => void navigate(section.route)}
            aria-label={`Navigate to ${section.title}`}
          >
            <div className={styles.settingContent}>
              <div className={styles.settingTitleRow}>
                {section.icon}
                <span className={styles.settingTitle}>{section.title}</span>
                {renderBadge(section.badge)}
              </div>
              <span className={styles.settingDescription}>{section.description}</span>
            </div>
            <ChevronRightRegular className={styles.chevron} />
          </Card>
        ))}
      </div>
    </div>
  );
}
