import React, { useEffect, useState } from 'react';
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  tokens,
} from '@fluentui/react-components';
import { CheckmarkRegular, DismissRegular } from '@fluentui/react-icons';
import { useMcpBridge } from '@gtc/mcp-shared';
import { NowFooter } from '../components/NowFooter';
import { ApprovalPill } from '../components/Pills';
import { ViewHeader } from '../components/ViewHeader';
import { useStyles } from '../styles';
import { now } from '../theme';
import type { SnowApproval } from '../types';

// ── Approvals View ──────────────────────────────────────────────────────────
export function ApprovalsView({ items, callTool, toast, theme, cacheInfo: _cacheInfo }: {
  items: SnowApproval[];
  callTool: (name: string, args?: Record<string, any>) => Promise<any>;
  toast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  theme: 'light' | 'dark';
  cacheInfo?: { hit: boolean; cached_at: string } | null;
}) {
  const styles = useStyles();
  const t = now(theme);
  const { isFullscreen } = useMcpBridge();
  const [localItems, setLocalItems] = useState(items);
  const [actingId, setActingId] = useState<string | null>(null);

  useEffect(() => { setLocalItems(items); }, [items]);

  const act = async (sys_id: string, action: 'approve' | 'reject') => {
    setActingId(sys_id);
    try {
      const res = await callTool(action === 'approve' ? 'sn__approve_record' : 'sn__reject_record', { sys_id });
      if (res?.items !== undefined) setLocalItems(res.items);
      toast(action === 'approve' ? 'Approved' : 'Rejected', 'success');
    } catch (e: any) {
      toast(e.message || `Failed to ${action}`, 'error');
    } finally {
      setActingId(null);
    }
  };

  const colSpan = isFullscreen ? 8 : 5;
  const cellStyle: React.CSSProperties = {
    padding: '8px 12px', fontSize: '13px', whiteSpace: 'nowrap',
    maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis',
  };
  const headerCellStyle: React.CSSProperties = {
    fontWeight: 700, fontSize: '11px', textTransform: 'uppercase',
    letterSpacing: '0.5px', padding: '8px 12px', color: t.textWeak,
  };

  return (
    <div className={styles.card} style={{ border: `1px solid ${t.border}`, background: t.surface }}>
      <ViewHeader icon={<CheckmarkRegular style={{ fontSize: '18px' }} />} title="Pending Approvals" count={localItems.length}
        brand={tokens.colorPalettePlumForeground2} />

      <Table aria-label="Approvals" size="small" style={{ borderCollapse: 'collapse' }}>
        <TableHeader>
          <TableRow style={{ background: t.headerBg }}>
            {isFullscreen && <TableHeaderCell style={headerCellStyle}>Approver</TableHeaderCell>}
            {isFullscreen && <TableHeaderCell style={headerCellStyle}>Type</TableHeaderCell>}
            <TableHeaderCell style={headerCellStyle}>Document</TableHeaderCell>
            <TableHeaderCell style={headerCellStyle}>Description</TableHeaderCell>
            <TableHeaderCell style={headerCellStyle}>State</TableHeaderCell>
            <TableHeaderCell style={headerCellStyle}>Due Date</TableHeaderCell>
            {isFullscreen && <TableHeaderCell style={headerCellStyle}>Created On</TableHeaderCell>}
            <TableHeaderCell style={{ ...headerCellStyle, width: 140 }} />
          </TableRow>
        </TableHeader>
        <TableBody>
          {localItems.length === 0 && (
            <TableRow><TableCell colSpan={colSpan} className={styles.empty}><Text>No pending approvals.</Text></TableCell></TableRow>
          )}
          {localItems.map((a, idx) => (
            <TableRow key={a.sys_id} className="snow-row"
              style={{ borderBottom: idx === items.length - 1 ? 'none' : `1px solid ${t.border}` }}>
              {isFullscreen && <TableCell style={cellStyle}>{a.approver || '—'}</TableCell>}
              {isFullscreen && <TableCell style={cellStyle}>{(a as any).document_type || '—'}</TableCell>}
              <TableCell style={cellStyle}><span style={{ fontFamily: 'monospace', color: tokens.colorBrandForeground1 }}>{(a as any).document_number || a.document || '—'}</span></TableCell>
              <TableCell style={{ ...cellStyle, maxWidth: '240px', whiteSpace: 'normal', wordBreak: 'break-word', overflow: 'visible', textOverflow: 'clip', lineHeight: 1.35 }}>{(a as any).short_description || '—'}</TableCell>
              <TableCell style={cellStyle}><ApprovalPill approval={a.state} theme={theme} /></TableCell>
              <TableCell style={cellStyle}>{a.due_date || '—'}</TableCell>
              {isFullscreen && <TableCell style={cellStyle}>{a.created_on || '—'}</TableCell>}
              <TableCell style={{ ...cellStyle, maxWidth: 'none' }}>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <Button appearance="primary" size="small" icon={<CheckmarkRegular />}
                    onClick={() => act(a.sys_id, 'approve')} disabled={actingId === a.sys_id}
                    style={{ minWidth: 0, padding: '0 8px' }}>
                    Approve
                  </Button>
                  <Button appearance="secondary" size="small" icon={<DismissRegular />}
                    onClick={() => act(a.sys_id, 'reject')} disabled={actingId === a.sys_id}
                    style={{ minWidth: 0, padding: '0 8px' }}>
                    Reject
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <NowFooter theme={theme} />
    </div>
  );
}
