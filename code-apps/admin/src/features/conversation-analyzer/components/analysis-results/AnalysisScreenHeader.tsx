import type { ReactNode } from 'react';
import { Body1, Title2, makeStyles, tokens } from '@fluentui/react-components';
import { AnalyzerBreadcrumb, type ScreenCrumb } from '../shared/AnalyzerBreadcrumb';

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS, flexShrink: 0, minWidth: 0 },
  row: { display: 'flex', alignItems: 'flex-start', gap: tokens.spacingHorizontalL, flexWrap: 'wrap' },
  text: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXXS, flex: '1 1 320px', minWidth: 0 },
  title: { overflowWrap: 'anywhere' },
  subtitle: { color: tokens.colorNeutralForeground2 },
  actions: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
});

export type { ScreenCrumb };

interface AnalysisScreenHeaderProps {
  crumbs: ScreenCrumb[];
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}

/** Breadcrumb, title, description and actions for the analysis sub-screens (G- header pattern). */
export function AnalysisScreenHeader({ crumbs, title, subtitle, actions }: AnalysisScreenHeaderProps) {
  const styles = useStyles();
  return (
    <header className={styles.root}>
      <AnalyzerBreadcrumb crumbs={crumbs} />
      <div className={styles.row}>
        <div className={styles.text}>
          <Title2 as="h1" className={styles.title}>{title}</Title2>
          {subtitle && <Body1 className={styles.subtitle}>{subtitle}</Body1>}
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </header>
  );
}
