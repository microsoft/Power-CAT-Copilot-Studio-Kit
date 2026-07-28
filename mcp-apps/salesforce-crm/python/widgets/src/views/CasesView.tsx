import React, { useEffect, useState } from 'react';
import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Spinner, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text, tokens } from '@fluentui/react-components';
import { DismissRegular, DocumentRegular, EditRegular, EyeRegular } from '@fluentui/react-icons';
import { CASE_PRIOS, CASE_STATUSES, fmtDate } from '../constants';
import { useStyles, H_CELL, D_CELL } from '../styles';
import { StatusPill } from '../components/StatusPill';
import { ViewHeader } from '../components/ViewHeader';
import { RecordDialog } from '../components/RecordDialog';
import { SldsFooter } from '../components/SldsFooter';
import { slds } from '../theme';

// ── CasesView ──────────────────────────────────────────────────────────────
// ────────────────────────────────────────────────────────────────────────────
export function CasesView({ items: initItems, callTool, toast, theme, cacheInfo: initCacheInfo, isFullscreen }: { items: any[]; callTool: (n: string, a?: any) => Promise<any>; toast: (m: string, t?: any) => void; theme: 'light' | 'dark'; cacheInfo?: { hit: boolean; cached_at: string }; isFullscreen?: boolean }) {
  const styles = useStyles();
  const t = slds(theme);
  const [localItems, setLocalItems] = useState(initItems);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);
  const [viewingCase, setViewingCase] = useState<any | null>(null);
  const [childComments, setChildComments] = useState<Record<string, any[]>>({});
  const [loadingChildren, setLoadingChildren] = useState<Set<string>>(new Set());
  const [cacheInfo, setCacheInfo] = useState(initCacheInfo);
  const [refreshing, setRefreshing] = useState(false);
  const [form, setForm] = useState({ subject: '', status: '', priority: '', account_name: '', description: '' });

  useEffect(() => { setLocalItems(initItems); setCacheInfo(initCacheInfo); }, [initItems]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await callTool('sf__get_cases', { refresh: true });
      setLocalItems(res?.items || []);
      setCacheInfo(res?._cache);
    } catch (e: any) { toast(e.message || 'Refresh failed', 'error'); }
    finally { setRefreshing(false); }
  };

  const openEdit = (c: any) => { setCreating(false); setEditingId(c.id); setForm({ subject: c.subject || '', status: c.status || '', priority: c.priority || '', account_name: c.account_name || '', description: c.description || '' }); };
  const cancel = () => { setEditingId(null); setCreating(false); };

  const handleSave = async () => {
    setSaving(true);
    try {
      const result: any = creating
        ? await callTool('sf__create_case', form)
        : await callTool('sf__update_case', { case_id: editingId, ...form });
      // Alert path — server returned a non-fatal warning (e.g. account-not-found
      // with suggestions). Surface the message persistently (user dismisses via
      // ✕) and keep the form open so the user can correct and re-submit.
      if (result && result.type === 'alert') {
        toast(result.message || 'Cannot complete — please correct and retry.', 'info', 0);
        return;
      }
      toast(creating ? 'Case created' : 'Case updated');
      if (!creating) setLastSavedId(editingId);
      cancel();
      const refreshed = await callTool('sf__get_cases', { refresh: true });
      if (refreshed?.items) { setLocalItems(refreshed.items); setCacheInfo(refreshed._cache); }
    } catch (e: any) { toast(e.message || 'Failed', 'error'); }
    finally { setSaving(false); }
  };

  useEffect(() => { if (lastSavedId) { const x = setTimeout(() => setLastSavedId(null), 4800); return () => clearTimeout(x); } }, [lastSavedId]);

  const openView = async (caseItem: any) => {
    setViewingCase(caseItem);
    const id = caseItem.id;
    if (childComments[id] !== undefined) return;
    setLoadingChildren(p => new Set([...p, id]));
    try {
      const res = await callTool('sf__get_case_activity', { case_id: id }).catch(() => null);
      setChildComments(p => ({ ...p, [id]: res?.comments ?? p[id] ?? [] }));
    } finally {
      setLoadingChildren(p => { const next = new Set(p); next.delete(id); return next; });
    }
  };

  const setF = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));
  const fFields = (f: typeof form, isEdit: boolean = false) => [
    { label: 'Subject *', key: 'subject', value: f.subject, onChange: (v: string) => setF('subject', v) },
    { label: 'Status', key: 'status', value: f.status, onChange: (v: string) => setF('status', v), type: 'select' as const, options: CASE_STATUSES },
    { label: 'Priority', key: 'priority', value: f.priority, onChange: (v: string) => setF('priority', v), type: 'select' as const, options: CASE_PRIOS },
    { label: 'Account (type full name)', key: 'account_name', value: f.account_name, onChange: (v: string) => setF('account_name', v), readonly: isEdit },
    { label: 'Description', key: 'description', value: f.description, onChange: (v: string) => setF('description', v), fullWidth: true },
  ];

  return (
    <div className={styles.card} style={{ border: `1px solid ${t.border}` }}>
      <ViewHeader icon={<DocumentRegular style={{ fontSize: '18px' }} />} title="Cases" count={localItems.length} brand={tokens.colorPaletteDarkOrangeForeground1} theme={theme} cacheInfo={cacheInfo} onRefresh={isFullscreen ? handleRefresh : undefined} refreshing={refreshing} />
      <Table size="small" aria-label="Cases" style={{ borderCollapse: 'collapse' }}>
        <TableHeader>
          <TableRow style={{ background: t.headerBg }}>
            {['Case #', 'Subject', 'Status', 'Priority', 'Account', 'Created'].map(h => <TableHeaderCell key={h} style={{ ...H_CELL, color: t.textWeak }}>{h}</TableHeaderCell>)}
            {isFullscreen && <TableHeaderCell style={{ ...H_CELL, width: 36, color: t.textWeak }} />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {localItems.length === 0 && !creating && <TableRow><TableCell colSpan={isFullscreen ? 7 : 6} className={styles.empty}><Text>No cases found.</Text></TableCell></TableRow>}
          {localItems.map((c: any) => (
            <TableRow key={c.id} style={{ borderBottom: `1px solid ${t.border}`, ...(lastSavedId === c.id ? { animation: 'sfRowFlash 4.5s ease-out' } : {}) }} className="slds-row">
              <TableCell style={D_CELL}>{c.case_number || '—'}</TableCell>
              <TableCell style={{ ...D_CELL, whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip', maxWidth: 'none' }}><span style={{ display: 'inline-block', maxWidth: 260, wordBreak: 'break-word' }}>{c.subject}</span></TableCell>
              <TableCell style={D_CELL}><StatusPill status={c.status} theme={theme} /></TableCell>
              <TableCell style={D_CELL}><StatusPill status={c.priority} theme={theme} /></TableCell>
              <TableCell style={D_CELL}>{c.account_name || '—'}</TableCell>
              <TableCell style={D_CELL}>{fmtDate(c.created_date)}</TableCell>
              {isFullscreen && (
                <TableCell style={D_CELL}>
                  <Button size="small" icon={<EyeRegular />} appearance="subtle" title="View" aria-label={`View case ${c.case_number || c.subject}`} onClick={() => openView(c)} />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {viewingCase && (
        <Dialog open={true} onOpenChange={() => setViewingCase(null)}>
          <DialogSurface style={{ maxWidth: '820px', width: '92vw' }}>
            <DialogBody>
              <DialogTitle action={<Button appearance="subtle" icon={<DismissRegular />} onClick={() => setViewingCase(null)} aria-label="Close" />}>
                {viewingCase.subject || 'Case'}
              </DialogTitle>
              <DialogContent>
                <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '10px 12px', alignItems: 'start', marginBottom: '16px' }}>
                  {[
                    ['Case #', viewingCase.case_number || '—'],
                    ['Status', viewingCase.status || '—'],
                    ['Priority', viewingCase.priority || '—'],
                    ['Account', viewingCase.account_name || '—'],
                    ['Created', fmtDate(viewingCase.created_date)],
                    ['Description', viewingCase.description || '—'],
                  ].map(([label, value]) => (
                    <React.Fragment key={label}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: t.textWeak }}>{label}</div>
                      <div style={{ fontSize: '13px', color: t.text, whiteSpace: label === 'Description' ? 'pre-wrap' : 'normal' }}>{value}</div>
                    </React.Fragment>
                  ))}
                </div>

                {loadingChildren.has(viewingCase.id) ? (
                  <div style={{ padding: '20px', textAlign: 'center' }}><Spinner size="small" label="Loading details…" /></div>
                ) : (
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: t.textWeak, marginBottom: '6px', paddingBottom: '4px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>Comments</span>
                      <span style={{ fontWeight: 400, fontSize: '10px' }}>({(childComments[viewingCase.id] || []).length})</span>
                    </div>
                    {(childComments[viewingCase.id] || []).length === 0 ? (
                      <div style={{ color: t.textWeak, fontSize: '12px', padding: '2px 0' }}>No comments</div>
                    ) : (
                      <Table size="extra-small" aria-label="Comments">
                        <TableHeader>
                          <TableRow style={{ background: t.headerBg }}>
                            {['Comment body', 'Author', 'Date'].map(h => <TableHeaderCell key={h} style={{ ...H_CELL, color: t.textWeak }}>{h}</TableHeaderCell>)}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(childComments[viewingCase.id] || []).map((cm: any, i: number) => (
                            <TableRow key={cm.id || i}>
                              <TableCell style={{ ...D_CELL, whiteSpace: 'normal' }}>{cm.body || '—'}</TableCell>
                              <TableCell style={D_CELL}>{cm.created_by_name || 'System'}</TableCell>
                              <TableCell style={D_CELL}>{fmtDate(cm.created_date)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                )}
              </DialogContent>
              <DialogActions>
                <Button appearance="secondary" onClick={() => setViewingCase(null)}>Close</Button>
                <Button appearance="primary" icon={<EditRegular />} onClick={() => { const caseItem = viewingCase; setViewingCase(null); if (caseItem) openEdit(caseItem); }}>Edit</Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      )}
      <RecordDialog
        open={editingId !== null || creating}
        title={creating ? "New Case" : "Edit Case"}
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

// ────────────────────────────────────────────────────────────────────────────
// ── CaseActivityView ───────────────────────────────────────────────────────
// ────────────────────────────────────────────────────────────────────────────
export function CaseActivityView({ caseId, comments, tasks, theme }: { caseId: string; comments: any[]; tasks: any[]; theme: 'light' | 'dark' }) {
  const styles = useStyles();
  const t = slds(theme);
  return (
    <div className={styles.card} style={{ border: `1px solid ${t.border}` }}>
      <ViewHeader icon={<DocumentRegular style={{ fontSize: '18px' }} />} title={`Activity on case ${caseId}`} count={comments.length + tasks.length} brand={tokens.colorPaletteDarkOrangeForeground1} theme={theme} />

      {/* Section 1 — Comments */}
      <div style={{ padding: '8px 12px', fontSize: 13, fontWeight: 600, color: t.textWeak, borderBottom: `1px solid ${t.border}` }}>
        Comments ({comments.length})
      </div>
      <Table size="small" aria-label="Case comments" style={{ borderCollapse: 'collapse' }}>
        <TableHeader>
          <TableRow style={{ background: t.headerBg }}>
            {['Comment', 'Author', 'Created'].map(h => <TableHeaderCell key={h} style={{ ...H_CELL, color: t.textWeak }}>{h}</TableHeaderCell>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {comments.length === 0 && <TableRow><TableCell colSpan={3} className={styles.empty}><Text>No comments yet.</Text></TableCell></TableRow>}
          {comments.map((c: any) => (
            <TableRow key={c.id} style={{ borderBottom: `1px solid ${t.border}` }}>
              <TableCell style={D_CELL}><Text size={200} style={{ whiteSpace: 'pre-wrap' }}>{c.body}</Text></TableCell>
              <TableCell style={D_CELL}><Text size={200}>{c.author}</Text></TableCell>
              <TableCell style={D_CELL}><Text size={200}>{c.created_date}</Text></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Section 2 — Tasks */}
      <div style={{ padding: '12px 12px 8px', fontSize: 13, fontWeight: 600, color: t.textWeak, borderTop: `1px solid ${t.border}`, borderBottom: `1px solid ${t.border}` }}>
        Tasks ({tasks.length})
      </div>
      <Table size="small" aria-label="Case tasks" style={{ borderCollapse: 'collapse' }}>
        <TableHeader>
          <TableRow style={{ background: t.headerBg }}>
            {['Subject', 'Status', 'Priority', 'Due', 'Owner'].map(h => <TableHeaderCell key={h} style={{ ...H_CELL, color: t.textWeak }}>{h}</TableHeaderCell>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.length === 0 && <TableRow><TableCell colSpan={5} className={styles.empty}><Text>No tasks logged.</Text></TableCell></TableRow>}
          {tasks.map((tk: any) => (
            <TableRow key={tk.id} style={{ borderBottom: `1px solid ${t.border}` }}>
              <TableCell style={D_CELL}><Text size={200}>{tk.subject}</Text></TableCell>
              <TableCell style={D_CELL}><Text size={200}>{tk.status}</Text></TableCell>
              <TableCell style={D_CELL}><Text size={200}>{tk.priority}</Text></TableCell>
              <TableCell style={D_CELL}><Text size={200}>{tk.activity_date}</Text></TableCell>
              <TableCell style={D_CELL}><Text size={200}>{tk.owner}</Text></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
