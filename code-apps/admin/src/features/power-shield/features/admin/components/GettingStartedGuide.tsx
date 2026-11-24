import { useState, useCallback } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Card,
  Badge,
  Checkbox,
} from '@fluentui/react-components';
import {
  ChevronDownRegular,
  ChevronUpRegular,
  FolderRegular,
  QuestionCircleRegular,
  ArrowRightRegular,
} from '@fluentui/react-icons';

// ─────────────────────────────────────────────────────────────────────────────
// LocalStorage key
// ─────────────────────────────────────────────────────────────────────────────

const LS_DISMISSED_KEY = 'powershield-qc-guide-dismissed';
const LS_COLLAPSED_KEY = 'powershield-qc-guide-collapsed';

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  card: {
    padding: '20px 24px',
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
    borderLeftWidth: '3px',
    borderLeftStyle: 'solid',
    borderLeftColor: tokens.colorBrandBackground,
    overflow: 'hidden',
    position: 'relative' as const,
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  headerIcon: {
    fontSize: '20px',
    color: tokens.colorBrandForeground1,
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    marginTop: tokens.spacingVerticalM,
  },
  subtitle: {
    color: tokens.colorNeutralForeground3,
    lineHeight: tokens.lineHeightBase300,
  },
  stepsRow: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
  },
  stepCard: {
    flex: '1 1 200px',
    minWidth: '180px',
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    padding: '16px',
    borderRadius: '10px',
    backgroundColor: tokens.colorNeutralBackground2,
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: tokens.colorNeutralStroke2,
    borderRightWidth: '1px',
    borderRightStyle: 'solid',
    borderRightColor: tokens.colorNeutralStroke2,
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: tokens.colorNeutralStroke2,
    borderLeftWidth: '1px',
    borderLeftStyle: 'solid',
    borderLeftColor: tokens.colorNeutralStroke2,
    transitionProperty: 'border-color, box-shadow',
    transitionDuration: '200ms',
    transitionTimingFunction: 'ease',
    ':hover': {
      borderTopColor: tokens.colorBrandStroke1,
      borderRightColor: tokens.colorBrandStroke1,
      borderBottomColor: tokens.colorBrandStroke1,
      borderLeftColor: tokens.colorBrandStroke1,
      boxShadow: '0 2px 8px rgba(7, 127, 171, 0.1)',
    },
  },
  stepHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  stepNumber: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
    fontSize: '12px',
    fontWeight: 600,
    flexShrink: 0,
  },
  stepIcon: {
    fontSize: '16px',
    color: tokens.colorBrandForeground1,
  },
  stepDescription: {
    color: tokens.colorNeutralForeground3,
    lineHeight: tokens.lineHeightBase200,
  },
  stepFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 'auto',
    paddingTop: tokens.spacingVerticalXS,
  },
  arrow: {
    display: 'flex',
    alignItems: 'center',
    alignSelf: 'center',
    color: tokens.colorNeutralForeground3,
    flexShrink: 0,
    '@media (max-width: 640px)': {
      display: 'none',
    },
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingTop: tokens.spacingVerticalXS,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface GettingStartedGuideProps {
  categoriesCount: number;
  questionsCount: number;
  onNavigateToTab: (tab: 'categories' | 'questions') => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function GettingStartedGuide({
  categoriesCount,
  questionsCount,
  onNavigateToTab,
}: GettingStartedGuideProps) {
  const styles = useStyles();

  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(LS_DISMISSED_KEY) === 'true',
  );
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(LS_COLLAPSED_KEY) === 'true',
  );

  const handleToggleCollapse = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(LS_COLLAPSED_KEY, String(next));
      return next;
    });
  }, []);

  const handleDismiss = useCallback(
    (_: unknown, data: { checked: boolean | 'mixed' }) => {
      const isDismissed = data.checked === true;
      setDismissed(isDismissed);
      localStorage.setItem(LS_DISMISSED_KEY, String(isDismissed));
    },
    [],
  );

  if (dismissed) return null;

  const steps = [
    {
      number: 1,
      label: 'Categories',
      tab: 'categories' as const,
      icon: <FolderRegular className={styles.stepIcon} />,
      description: 'Organize questions into sections. These appear as section headers in the maker\'s request form.',
      count: categoriesCount,
    },
    {
      number: 2,
      label: 'Questions',
      tab: 'questions' as const,
      icon: <QuestionCircleRegular className={styles.stepIcon} />,
      description: 'Define what information you need from makers. Click a category to add questions inside it. For Choice questions, manage answer options from the question detail view.',
      count: questionsCount,
    },
  ];

  return (
    <Card className={styles.card}>
      <div className={styles.headerRow}>
        <div className={styles.headerLeft}>
          <Text size={400} weight="semibold">
            Getting Started with Question Configuration
          </Text>
        </div>
        <Button
          appearance="subtle"
          size="small"
          icon={collapsed ? <ChevronDownRegular /> : <ChevronUpRegular />}
          onClick={handleToggleCollapse}
        >
          {collapsed ? 'Expand' : 'Collapse'}
        </Button>
      </div>

      {!collapsed && (
        <div className={styles.body}>
          <Text size={300} className={styles.subtitle}>
            Set up the questionnaire that makers complete in Step 2 of a policy request.
            Their answers will help you make informed approval decisions. Follow these steps:
          </Text>

          <div className={styles.stepsRow}>
            {steps.map((step, idx) => (
              <div key={step.tab} style={{ display: 'flex', alignItems: 'stretch', gap: tokens.spacingHorizontalM, flex: '1 1 200px', minWidth: '180px' }}>
                <div className={styles.stepCard} style={{ flex: 1 }}>
                  <div className={styles.stepHeader}>
                    <div className={styles.stepNumber}>{step.number}</div>
                    {step.icon}
                    <Text weight="semibold" size={300}>
                      {step.label}
                    </Text>
                  </div>

                  <Text size={200} className={styles.stepDescription}>
                    {step.description}
                  </Text>

                  <div className={styles.stepFooter}>
                    <Badge
                      appearance="filled"
                      color={step.count > 0 ? 'success' : 'informative'}
                      size="small"
                    >
                      {step.count} created
                    </Badge>
                    <Button
                      appearance="subtle"
                      size="small"
                      onClick={() => onNavigateToTab(step.tab)}
                    >
                      Go to tab →
                    </Button>
                  </div>
                </div>

                {idx < steps.length - 1 && (
                  <div className={styles.arrow}>
                    <ArrowRightRegular fontSize={16} />
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className={styles.footer}>
            <Checkbox
              label="Don't show this again"
              checked={dismissed}
              onChange={handleDismiss}
            />
          </div>
        </div>
      )}
    </Card>
  );
}
