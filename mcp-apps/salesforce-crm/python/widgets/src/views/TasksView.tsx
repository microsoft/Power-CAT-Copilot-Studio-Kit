import React, { useEffect, useState } from 'react';
import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text, tokens } from '@fluentui/react-components';
import { CheckmarkRegular, DismissRegular, EditRegular, EyeRegular } from '@fluentui/react-icons';
import { fmtDate, TASK_PRIOS, TASK_STATUSES } from '../constants';
import { useStyles, H_CELL, D_CELL } from '../styles';
import { StatusPill } from '../components/StatusPill';
import { ViewHeader } from '../components/ViewHeader';
import { RecordDialog } from '../components/RecordDialog';
import { SldsFooter } from '../components/SldsFooter';
import { slds } from '../theme';

// ── TasksView ──────────────────────────────────────────────────────────────
// ────────────────────────────────────────────────────────────────────────────
export function TasksView({ items: initItems, callTool, toast, theme, cacheInfo: initCacheInfo, isFullscreen }: { items: any[]; callTool: (n: string, a?: any) => Promise<any>; toast: (m: string, t?: any) => void; theme: 'light' | 'dark'; cacheInfo?: { hit: boolean; cached_at: string }; isFullscreen?: boolean }) {
  const styles = useStyles();
  const t = slds(theme);
  const [localItems, setLocalItems] = useState(initItems);
  const [cacheInfo, setCacheInfo] = useState(initCacheInfo);
  const [refreshing, setRefreshing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);
  const [viewingTask, setViewingTask] = useState<any | null>(null);
  const [form, setForm] = useState({ subject: '', status: '', priority: '', activity_date: '', description: '', who_name: '', what_name: '' });

  useEffect(() => { setLocalItems(initItems); setCacheInfo(initCacheInfo); }, [initItems]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await callTool('sf__get_tasks', { refresh: true });
      setLocalItems(res?.items || []);
      setCacheInfo(res?._cache);
    } catch (e: any) { toast(e.message || 'Refresh failed', 'error'); }
    finally { setRefreshing(false); }
  };

  const openEdit = (t2: any) => { setCreating(false); setEditingId(t2.id); setForm({ subject: t2.subject || '', status: t2.status || '', priority: t2.priority || '', activity_date: t2.activity_date || '', description: t2.description || '', who_name: t2.who_name || '', what_name: t2.what_name || '' }); };
  const cancel = () => { setEditingId(null); setCreating(false); };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (creating) { await callTool('sf__create_task', form); toast('Task created'); }
      else { await callTool('sf__update_task', { task_id: editingId, ...form }); toast('Task updated'); setLastSavedId(editingId); }
      cancel();
      const refreshed = await callTool('sf__get_tasks', { refresh: true });
      if (refreshed?.items) { setLocalItems(refreshed.items); setCacheInfo(refreshed._cache); }
    } catch (e: any) { toast(e.message || 'Failed', 'error'); }
    finally { setSaving(false); }
  };

  useEffect(() => { if (lastSavedId) { const x = setTimeout(() => setLastSavedId(null), 4800); return () => clearTimeout(x); } }, [lastSavedId]);

  const setF = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));
  const fFields = (f: typeof form, isEdit: boolean = false) => [
    { label: 'Subject *', key: 'subject', value: f.subject, onChange: (v: string) => setF('subject', v) },
    { label: 'Status', key: 'status', value: f.status, onChange: (v: string) => setF('status', v), type: 'select' as const, options: TASK_STATUSES },
    { label: 'Priority', key: 'priority', value: f.priority, onChange: (v: string) => setF('priority', v), type: 'select' as const, options: TASK_PRIOS },
    { label: 'Due Date', key: 'activity_date', value: f.activity_date, onChange: (v: string) => setF('activity_date', v), inputType: 'date' },
    { label: 'Name — Contact / Lead (type full name)', key: 'who_name', value: f.who_name, onChange: (v: string) => setF('who_name', v), readonly: isEdit },
    { label: 'Related To — Account / Opportunity / Campaign (type full name)', key: 'what_name', value: f.what_name, onChange: (v: string) => setF('what_name', v), readonly: isEdit },
    { label: 'Description', key: 'description', value: f.description, onChange: (v: string) => setF('description', v), fullWidth: true },
  ];

  return (
    <div className={styles.card} style={{ border: `1px solid ${t.border}` }}>
      <ViewHeader icon={<CheckmarkRegular style={{ fontSize: '18px' }} />} title="Tasks" count={localItems.length} brand={tokens.colorPaletteDarkGreenForeground2} theme={theme} cacheInfo={cacheInfo} onRefresh={isFullscreen ? handleRefresh : undefined} refreshing={refreshing} />
      <Table size="small" aria-label="Tasks" style={{ borderCollapse: 'collapse' }}>
        <TableHeader>
          <TableRow style={{ background: t.headerBg }}>
            {['Subject', 'Status', 'Priority', 'Due Date', 'Related To'].map(h => <TableHeaderCell key={h} style={{ ...H_CELL, color: t.textWeak }}>{h}</TableHeaderCell>)}
            {isFullscreen && <TableHeaderCell style={{ ...H_CELL, width: 32, color: t.textWeak }} />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {localItems.length === 0 && !creating && <TableRow><TableCell colSpan={isFullscreen ? 6 : 5} className={styles.empty}><Text>No tasks found.</Text></TableCell></TableRow>}
          {localItems.map((t2: any) => (
            <TableRow key={t2.id} style={{ borderBottom: `1px solid ${t.border}`, ...(lastSavedId === t2.id ? { animation: 'sfRowFlash 4.5s ease-out' } : {}) }} className="slds-row">
              <TableCell style={{ ...D_CELL, whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip', maxWidth: 'none' }}><span style={{ display: 'inline-block', maxWidth: 260, wordBreak: 'break-word' }}>{t2.subject}</span></TableCell>
              <TableCell style={D_CELL}><StatusPill status={t2.status} theme={theme} /></TableCell>
              <TableCell style={D_CELL}><StatusPill status={t2.priority} theme={theme} /></TableCell>
              <TableCell style={D_CELL}>{fmtDate(t2.activity_date)}</TableCell>
              <TableCell style={D_CELL}>{t2.what_name || t2.who_name || '—'}</TableCell>
              {isFullscreen && (
                <TableCell style={D_CELL}>
                  <Button size="small" icon={<EyeRegular />} appearance="subtle" title="View" aria-label={`View ${t2.subject}`} onClick={() => setViewingTask(t2)} />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {viewingTask && (
        <Dialog open={true} onOpenChange={() => setViewingTask(null)}>
          <DialogSurface style={{ maxWidth: '640px', width: '90vw' }}>
            <DialogBody>
              <DialogTitle action={<Button appearance="subtle" icon={<DismissRegular />} onClick={() => setViewingTask(null)} aria-label="Close" />}>
                {viewingTask.subject || 'Task'}
              </DialogTitle>
              <DialogContent>
                <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '10px 12px', alignItems: 'start' }}>
                  {[
                    ['Subject', viewingTask.subject || '—'],
                    ['Status', viewingTask.status || '—'],
                    ['Priority', viewingTask.priority || '—'],
                    ['Due Date', fmtDate(viewingTask.activity_date)],
                    ['Related To', viewingTask.what_name || '—'],
                    ['Who', viewingTask.who_name || '—'],
                    ['Description', viewingTask.description || '—'],
                  ].map(([label, value]) => (
                    <React.Fragment key={label}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: t.textWeak }}>{label}</div>
                      <div style={{ fontSize: '13px', color: t.text, whiteSpace: label === 'Description' ? 'pre-wrap' : 'normal' }}>{value}</div>
                    </React.Fragment>
                  ))}
                </div>
              </DialogContent>
              <DialogActions>
                <Button appearance="secondary" onClick={() => setViewingTask(null)}>Close</Button>
                <Button appearance="primary" icon={<EditRegular />} onClick={() => { const task = viewingTask; setViewingTask(null); if (task) openEdit(task); }}>Edit</Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      )}
      <RecordDialog
        open={editingId !== null || creating}
        title={creating ? "New Task" : "Edit Task"}
        fields={fFields(form, creating ? undefined : true)}
        onSave={handleSave}
        onCancel={cancel}
        saving={saving}
        theme={theme}
      />
      <SldsFooter theme={theme} />
    </div>
  );
}
