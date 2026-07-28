import React from 'react';
import { useToolData, useMcpBridge, useTheme, ExpandButton, useToast } from '@gtc/mcp-shared';
import { useStyles } from './styles';
import { now } from './theme';
import { NowFooter } from './components/NowFooter';
import { SkeletonTable } from './components/SkeletonTable';
import { ApprovalsView } from './views/ApprovalsView';
import { CatalogView } from './views/CatalogView';
import { ChangesView } from './views/ChangesView';
import { FormView } from './views/FormView';
import { HrCasesView } from './views/HrCasesView';
import { IncidentsView } from './views/IncidentsView';
import { KnowledgeView } from './views/KnowledgeView';
import { ProblemsView } from './views/ProblemsView';
import { RequestsView } from './views/RequestsView';
import { ResolveIncidentView } from './views/ResolveIncidentView';
import type {
  CatalogItem,
  ChangeRequest,
  Incident,
  KnowledgeArticle,
  Problem,
  ServiceRequest,
  SnowApproval,
  SnowData,
} from './types';

type ServiceNowFormEntity = 'incident' | 'request' | 'change_request' | 'problem' | 'hr_case';
type SnowPayload = SnowData & Record<string, any>;

function renderListAfterAction(
  data: any,
  callTool: (n: string, a?: any) => Promise<any>,
  toast: (m: string, t?: any, timeout?: number) => void,
  theme: 'light' | 'dark'
): React.ReactNode {
  if (!data) return null;
  const cacheInfo = data._cache;
  switch (data.type) {
    case 'incidents':
      return <IncidentsView items={(data.incidents || []) as Incident[]} callTool={callTool} toast={toast} theme={theme} cacheInfo={cacheInfo} />;
    case 'requests':
      return <RequestsView items={(data.requests || []) as ServiceRequest[]} callTool={callTool} toast={toast} theme={theme} cacheInfo={cacheInfo} />;
    case 'change_requests':
      return <ChangesView items={(data.items || []) as ChangeRequest[]} callTool={callTool} toast={toast} theme={theme} cacheInfo={cacheInfo} />;
    case 'problems':
      return <ProblemsView items={(data.items || []) as Problem[]} callTool={callTool} toast={toast} theme={theme} cacheInfo={cacheInfo} />;
    case 'hr_cases':
      return <HrCasesView items={(data.items || []) as any[]} callTool={callTool} toast={toast} theme={theme} cacheInfo={cacheInfo} />;
    default:
      return null;
  }
}

export function ServiceNowApp() {
  const styles = useStyles();
  const data = useToolData<SnowData>();
  const { callTool } = useMcpBridge();
  const toast = useToast();
  const theme = useTheme();
  const t = now(theme);
  const shellStyle: React.CSSProperties = { padding: '12px', fontSize: '12px' };

  if (!data) {
    return (
      <div className={styles.shell} style={shellStyle}>
        <div role="status" aria-live="polite">
          <SkeletonTable />
        </div>
      </div>
    );
  }

  if (data.error) {
    return (
      <div className={styles.shell} style={shellStyle}>
        <div role="alert" aria-live="assertive">
          <div className={styles.card} style={{ border: `1px solid ${t.border}` }}>
            <div className={styles.headerBar} style={{ background: '#293E40' }}>
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>Error</span>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <ExpandButton />
              </div>
            </div>
            <div style={{
              padding: '12px 16px', fontSize: '13px', fontWeight: 500,
              background: theme === 'dark' ? '#3D1111' : '#FDE7E7',
              color: theme === 'dark' ? '#F87171' : t.error,
              borderLeft: `3px solid ${t.error}`,
            }}>
              {data.message || 'An unknown error occurred.'}
            </div>
            <NowFooter theme={theme} />
          </div>
        </div>
      </div>
    );
  }

  const payload = data as SnowPayload;

  return (
    <div className={styles.shell} style={shellStyle}>
      {payload.type === 'incidents' && <IncidentsView items={(payload.incidents || []) as Incident[]} callTool={callTool} toast={toast} theme={theme} cacheInfo={payload._cache} />}
      {payload.type === 'requests' && <RequestsView items={(payload.requests || []) as ServiceRequest[]} callTool={callTool} toast={toast} theme={theme} cacheInfo={payload._cache} />}
      {payload.type === 'change_requests' && <ChangesView items={(payload.items || []) as ChangeRequest[]} callTool={callTool} toast={toast} theme={theme} cacheInfo={payload._cache} />}
      {payload.type === 'problems' && <ProblemsView items={(payload.items || []) as Problem[]} callTool={callTool} toast={toast} theme={theme} cacheInfo={payload._cache} />}
      {payload.type === 'knowledge_articles' && <KnowledgeView items={(payload.items || []) as KnowledgeArticle[]} theme={theme} cacheInfo={payload._cache} />}
      {payload.type === 'service_catalog' && <CatalogView items={(payload.items || []) as CatalogItem[]} theme={theme} cacheInfo={payload._cache} />}
      {payload.type === 'approvals' && <ApprovalsView items={(payload.items || []) as SnowApproval[]} callTool={callTool} toast={toast} theme={theme} />}
      {payload.type === 'hr_cases' && <HrCasesView items={payload.items || []} callTool={callTool} toast={toast} theme={theme} cacheInfo={payload._cache} />}
      {payload.type === 'form' && payload.mode === 'resolve' && (
        <ResolveIncidentView
          sys_id={payload.recordId || ''}
          number={payload.number || ''}
          short_description={payload.short_description || ''}
          description={payload.description || ''}
          priority={payload.priority || ''}
          state={payload.state || ''}
          assigned_to={payload.assigned_to || ''}
          category={payload.category || ''}
          callTool={callTool}
          toast={toast}
          theme={theme}
          renderList={renderListAfterAction}
        />
      )}
      {payload.type === 'form' && payload.mode !== 'resolve' && (
        <FormView
          entity={(payload.entity || 'incident') as ServiceNowFormEntity}
          mode={(payload.mode || 'create') as 'create' | 'edit'}
          recordId={payload.recordId}
          prefill={payload.prefill}
          callTool={callTool}
          toast={toast}
          theme={theme}
          renderList={renderListAfterAction}
        />
      )}
    </div>
  );
}
