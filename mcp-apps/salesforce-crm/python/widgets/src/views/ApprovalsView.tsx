import React, { useEffect, useState } from 'react';
import { Button, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text, tokens } from '@fluentui/react-components';
import { CheckmarkRegular, DismissRegular } from '@fluentui/react-icons';
import { fmtDate } from '../constants';
import { useStyles, H_CELL, D_CELL } from '../styles';
import { StatusPill } from '../components/StatusPill';
import { ViewHeader } from '../components/ViewHeader';
import { SldsFooter } from '../components/SldsFooter';
import { slds } from '../theme';

export function ApprovalsView({ items: initItems, callTool, toast, theme }: { items: any[]; callTool: (n: string, a?: any) => Promise<any>; toast: (m: string, t?: any) => void; theme: 'light' | 'dark' }) {
  const styles = useStyles();
  const t = slds(theme);
  const [localItems, setLocalItems] = useState(initItems);
  const [actingId, setActingId] = useState<string | null>(null);

  useEffect(() => { setLocalItems(initItems); }, [initItems]);

  const act = async (approvalId: string, action: 'approve' | 'reject') => {
    setActingId(approvalId);
    try {
      const tool = action === 'approve' ? 'sf__approve_record' : 'sf__reject_record';
      const res = await callTool(tool, { approval_id: approvalId });
      if (res?.items !== undefined) setLocalItems(res.items);
      toast(`${action === 'approve' ? 'Approved' : 'Rejected'}`);
    } catch (e: any) {
      toast(e?.message || `Failed to ${action}`, 'error');
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className={styles.card} style={{ border: `1px solid ${t.border}` }}>
      <ViewHeader icon={<CheckmarkRegular style={{ fontSize: '18px' }} />} title="Pending Approvals" count={localItems.length} brand={tokens.colorPalettePlumForeground2} theme={theme} />
      <Table size="small" aria-label="Approvals" style={{ borderCollapse: 'collapse' }}>
        <TableHeader>
          <TableRow style={{ background: t.headerBg }}>
            {['Record', 'Type', 'Submitted By', 'Status', 'Created', ''].map(h => <TableHeaderCell key={h} style={{ ...H_CELL, color: t.textWeak }}>{h}</TableHeaderCell>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {localItems.length === 0 && <TableRow><TableCell colSpan={6} className={styles.empty}><Text>No pending approvals.</Text></TableCell></TableRow>}
          {localItems.map((a: any) => (
            <TableRow key={a.id} style={{ borderBottom: `1px solid ${t.border}` }}>
              <TableCell style={{ ...D_CELL, fontWeight: 500 }}>{a.target_name || a.id}</TableCell>
              <TableCell style={D_CELL}>{a.target_type || '—'}</TableCell>
              <TableCell style={D_CELL}>{a.submitted_by || '—'}</TableCell>
              <TableCell style={D_CELL}><StatusPill status={a.status || 'Pending'} theme={theme} /></TableCell>
              <TableCell style={D_CELL}>{fmtDate(a.created_date)}</TableCell>
              <TableCell style={D_CELL}>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <Button
                    size="small"
                    appearance="subtle"
                    icon={<CheckmarkRegular />}
                    title="Approve"
                    aria-label="Approve"
                    onClick={() => act(a.id, 'approve')}
                    disabled={actingId === a.id}
                    style={{ color: tokens.colorPaletteGreenForeground1 }}
                  />
                  <Button
                    size="small"
                    appearance="subtle"
                    icon={<DismissRegular />}
                    title="Reject"
                    aria-label="Reject"
                    onClick={() => act(a.id, 'reject')}
                    disabled={actingId === a.id}
                    style={{ color: tokens.colorPaletteRedForeground1 }}
                  />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <SldsFooter theme={theme} />
    </div>
  );
}
