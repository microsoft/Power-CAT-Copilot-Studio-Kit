import { useState, useCallback, useRef } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbButton,
  BreadcrumbDivider,
  TabList,
  Tab,
} from '@fluentui/react-components';
import type { SelectTabData } from '@fluentui/react-components';
import { PowerShieldBreadcrumb } from '../../../shared/components/PowerShieldBreadcrumb';
import { useLayoutStyles } from '../../../shared/styles';
import { CategoriesTab } from './CategoriesTab';
import { CategoryDetailView } from './CategoryDetailView';
import { QuestionDetailView } from './QuestionDetailView';
import { QuestionsTab } from './QuestionsTab';
import { GettingStartedGuide } from './GettingStartedGuide';
import { QuestionConfigTour } from './QuestionConfigTour';
import type { QuestionCategoryConfig, QuestionConfig } from '../../../models/questionConfig';

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  headerRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Drill-down state
// ─────────────────────────────────────────────────────────────────────────────

type DrillDownState =
  | { level: 'categories' }
  | { level: 'category-detail'; category: QuestionCategoryConfig }
  | { level: 'question-detail'; category: QuestionCategoryConfig; question: QuestionConfig };

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function QuestionConfigScreen() {
  const styles = useStyles();
  const layoutStyles = useLayoutStyles();
  const breadcrumbRef = useRef<HTMLElement>(null);

  const [drillDown, setDrillDown] = useState<DrillDownState>({ level: 'categories' });
  const [activeTab, setActiveTab] = useState<'categories' | 'questions'>('categories');
  const [refreshKey, setRefreshKey] = useState(0);

  // Entity counts from categories list
  const [categoriesCount, setCategoriesCount] = useState(0);
  const [questionsCount, setQuestionsCount] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  function handleDrillToCategory(category: QuestionCategoryConfig) {
    setDrillDown({ level: 'category-detail', category });
  }

  function handleDrillToQuestion(category: QuestionCategoryConfig, question: QuestionConfig) {
    setDrillDown({ level: 'question-detail', category, question });
  }

  function handleBackToCategories() {
    setDrillDown({ level: 'categories' });
    setActiveTab('categories');
    refresh();
  }

  function handleBackToCategory(category: QuestionCategoryConfig) {
    setDrillDown({ level: 'category-detail', category });
  }

  // Truncate long text for breadcrumb
  function truncate(text: string, maxLen = 40): string {
    return text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
  }

  return (
    <div className={layoutStyles.pageContainer}>
      {/* Back to settings */}
      <PowerShieldBreadcrumb segments={[{ label: 'Settings', route: '/settings' }, { label: 'Question Configurations' }]} />

      {/* Header — only show full header at categories level */}
      {drillDown.level === 'categories' && (
        <>
          <div className={styles.headerRow}>
            <div className={styles.header}>
              <Text as="h1" size={700} weight="semibold">
                Question Configuration
              </Text>
              <Text style={{ color: tokens.colorNeutralForeground3 }}>
                Manage the questionnaire that makers complete when requesting connector access
              </Text>
            </div>
            <QuestionConfigTour />
          </div>

          <GettingStartedGuide
            categoriesCount={categoriesCount}
            questionsCount={questionsCount}
            onNavigateToTab={(tab) => {
              setActiveTab(tab);
              setDrillDown({ level: 'categories' });
            }}
          />
        </>
      )}

      {/* Breadcrumb navigation for drill-down levels */}
      {drillDown.level !== 'categories' && (
        <Breadcrumb ref={breadcrumbRef} size="large">
          <BreadcrumbItem>
            <BreadcrumbButton style={{ border: 'none', padding: '0 4px', background: 'transparent' }} onClick={handleBackToCategories}>
              Categories
            </BreadcrumbButton>
          </BreadcrumbItem>

          {drillDown.level === 'category-detail' && (
            <>
              <BreadcrumbDivider />
              <BreadcrumbItem>
                <BreadcrumbButton style={{ border: 'none', padding: '0 4px', background: 'transparent' }} current>
                  {truncate(drillDown.category.name)}
                </BreadcrumbButton>
              </BreadcrumbItem>
            </>
          )}

          {drillDown.level === 'question-detail' && (
            <>
              <BreadcrumbDivider />
              <BreadcrumbItem>
                <BreadcrumbButton style={{ border: 'none', padding: '0 4px', background: 'transparent' }} onClick={() => handleBackToCategory(drillDown.category)}>
                  {truncate(drillDown.category.name)}
                </BreadcrumbButton>
              </BreadcrumbItem>
              <BreadcrumbDivider />
              <BreadcrumbItem>
                <BreadcrumbButton style={{ border: 'none', padding: '0 4px', background: 'transparent' }} current>
                  {truncate(drillDown.question.questionText)}
                </BreadcrumbButton>
              </BreadcrumbItem>
            </>
          )}
        </Breadcrumb>
      )}

      {/* Tab navigation — only at root level */}
      {drillDown.level === 'categories' && (
        <TabList
          selectedValue={activeTab}
          onTabSelect={(_, data: SelectTabData) => setActiveTab(data.value as 'categories' | 'questions')}
          size="large"
        >
          <Tab value="categories">Categories</Tab>
          <Tab value="questions">Questions</Tab>
        </TabList>
      )}

      {/* Level 1 — Categories List */}
      {drillDown.level === 'categories' && activeTab === 'categories' && (
        <CategoriesTab
          refreshKey={refreshKey}
          onDrillIn={handleDrillToCategory}
          onCountChange={setCategoriesCount}
          onQuestionsCountChange={setQuestionsCount}
        />
      )}

      {/* Level 1 — Questions List (flat view) */}
      {drillDown.level === 'categories' && activeTab === 'questions' && (
        <QuestionsTab
          refreshKey={refreshKey}
          onCountChange={setQuestionsCount}
        />
      )}

      {/* Level 2 — Category Detail */}
      {drillDown.level === 'category-detail' && (
        <CategoryDetailView
          category={drillDown.category}
          onDrillToQuestion={(q) => handleDrillToQuestion(drillDown.category, q)}
          onDataChanged={refresh}
        />
      )}

      {/* Level 3 — Question Detail */}
      {drillDown.level === 'question-detail' && (
        <QuestionDetailView
          question={drillDown.question}
          category={drillDown.category}
          onDataChanged={refresh}
        />
      )}
    </div>
  );
}
