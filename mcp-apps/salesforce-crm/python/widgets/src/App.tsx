import React from 'react';
import { Text, tokens } from '@fluentui/react-components';
import { useMcpBridge, useTheme, useToast, useToolData } from '@gtc/mcp-shared';
import { AccountsView } from './views/AccountsView';
import { LeadsView } from './views/LeadsView';
import { ContactsView } from './views/ContactsView';
import { OpportunitiesView } from './views/OpportunitiesView';
import { CasesView, CaseActivityView } from './views/CasesView';
import { TasksView } from './views/TasksView';
import { CampaignsView } from './views/CampaignsView';
import { ApprovalsView } from './views/ApprovalsView';
import { SalesDashboardView } from './views/DashboardView';
import { FormView, SuccessPivot } from './views/FormView';
import { SkeletonTable } from './components/SkeletonTable';
import { SldsFooter } from './components/SldsFooter';
import { useStyles } from './styles';
import { slds } from './theme';
import type { SalesDashboardData, SfData, SfListData } from './types';

function renderListView(entity: string, data: any, callTool: (n: string, a?: any) => Promise<any>, toast: (...args: any[]) => void, theme: 'light' | 'dark', isFullscreen?: boolean): React.ReactNode {
  const items = data?.items || [];
  const cacheInfo = data?._cache;
  switch (entity) {
    case 'lead':        return <LeadsView         items={items} callTool={callTool} toast={toast} theme={theme} cacheInfo={cacheInfo} isFullscreen={isFullscreen} />;
    case 'account':     return <AccountsView      items={items} callTool={callTool} toast={toast} theme={theme} cacheInfo={cacheInfo} isFullscreen={isFullscreen} />;
    case 'contact':     return <ContactsView      items={items} callTool={callTool} toast={toast} theme={theme} cacheInfo={cacheInfo} isFullscreen={isFullscreen} />;
    case 'opportunity': return <OpportunitiesView items={items} callTool={callTool} toast={toast} theme={theme} cacheInfo={cacheInfo} isFullscreen={isFullscreen} />;
    case 'case':        return <CasesView         items={items} callTool={callTool} toast={toast} theme={theme} cacheInfo={cacheInfo} isFullscreen={isFullscreen} />;
    case 'task':        return <TasksView         items={items} callTool={callTool} toast={toast} theme={theme} cacheInfo={cacheInfo} isFullscreen={isFullscreen} />;
    case 'campaign':    return <CampaignsView     items={items} callTool={callTool} toast={toast} theme={theme} cacheInfo={cacheInfo} isFullscreen={isFullscreen} />;
    default: return null;
  }
}

export function SalesforceApp() {
  const styles = useStyles();
  const data = useToolData<SfData>();
  const { callTool, isFullscreen } = useMcpBridge();
  const toast = useToast();
  const theme = useTheme();
  const t = slds(theme);
  const shellStyle: React.CSSProperties = { padding: '12px', fontSize: '12px' };

  if (!data) return <div className={styles.shell} style={shellStyle} role="status" aria-live="polite"><SkeletonTable /></div>;

  if ((data as any).type === 'form') {
    const fd = data as any;
    return <div className={styles.shell} style={shellStyle}><FormView entity={fd.entity} mode={fd.mode || 'create'} recordId={fd.recordId} prefill={fd.prefill} callTool={callTool} toast={toast} theme={theme} renderListView={renderListView} /></div>;
  }

  if ((data as any).type === 'success') {
    const sd = data as any;
    return <div className={styles.shell} style={shellStyle}><SuccessPivot entity={sd.entity} callTool={callTool} toast={toast} theme={theme} isFullscreen={isFullscreen} renderListView={renderListView} /></div>;
  }

  if ((data as any).type === 'sales_dashboard') {
    return <div className={styles.shell} style={shellStyle}><SalesDashboardView data={data as SalesDashboardData} theme={theme} /></div>;
  }

  if ((data as any).error) {
    const ed = data as any;
    return (
      <div className={styles.shell} style={shellStyle}>
        <div className={styles.card} style={{ border: `1px solid ${t.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: `1px solid ${t.border}` }}>
            <Text size={400} weight="semibold" style={{ color: tokens.colorPaletteRedForeground1 }}>Error</Text>
          </div>
          <div role="alert" aria-live="assertive" style={{ padding: '16px 24px', background: tokens.colorPaletteRedBackground1, color: t.danger, borderLeft: `3px solid ${t.danger}`, fontSize: '13px', fontWeight: 500 }}>
            {ed.message || 'An unknown error occurred.'}
          </div>
          <SldsFooter theme={theme} />
        </div>
      </div>
    );
  }

  const ld = data as SfListData;
  const items = ld.items || [];
  const cache = (ld as any)._cache as { hit: boolean; cached_at: string } | undefined;

  return (
    <div className={styles.shell} style={shellStyle}>
      {ld.type === 'accounts'      && <AccountsView      items={items} callTool={callTool} toast={toast} theme={theme} cacheInfo={cache} isFullscreen={isFullscreen} />}
      {ld.type === 'leads'         && <LeadsView         items={items} callTool={callTool} toast={toast} theme={theme} cacheInfo={cache} isFullscreen={isFullscreen} />}
      {ld.type === 'contacts'      && <ContactsView      items={items} callTool={callTool} toast={toast} theme={theme} cacheInfo={cache} isFullscreen={isFullscreen} />}
      {ld.type === 'opportunities' && <OpportunitiesView items={items} callTool={callTool} toast={toast} theme={theme} cacheInfo={cache} isFullscreen={isFullscreen} />}
      {ld.type === 'cases'         && <CasesView         items={items} callTool={callTool} toast={toast} theme={theme} cacheInfo={cache} isFullscreen={isFullscreen} />}
      {ld.type === 'tasks'         && <TasksView         items={items} callTool={callTool} toast={toast} theme={theme} cacheInfo={cache} isFullscreen={isFullscreen} />}
      {ld.type === 'campaigns'     && <CampaignsView     items={items} callTool={callTool} toast={toast} theme={theme} cacheInfo={cache} isFullscreen={isFullscreen} />}
      {ld.type === 'approvals'     && <ApprovalsView     items={items} callTool={callTool} toast={toast} theme={theme} />}
      {ld.type === 'case_activity' && <CaseActivityView  caseId={(data as any).case_id || ''} comments={(data as any).comments || []} tasks={(data as any).tasks || []} theme={theme} />}
    </div>
  );
}
