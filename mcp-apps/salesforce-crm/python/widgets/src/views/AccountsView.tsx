import React, { useEffect, useState } from 'react';
import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Spinner, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text, tokens } from '@fluentui/react-components';
import { BuildingRegular, DismissRegular, EditRegular, EyeRegular } from '@fluentui/react-icons';
import { ACCT_INDUSTRIES, ACCT_TYPES, fmt$ } from '../constants';
import { useStyles, H_CELL, D_CELL } from '../styles';
import { StatusPill } from '../components/StatusPill';
import { ViewHeader } from '../components/ViewHeader';
import { RecordDialog } from '../components/RecordDialog';
import { SldsFooter } from '../components/SldsFooter';
import { slds } from '../theme';

// ── AccountsView ───────────────────────────────────────────────────────────
// ────────────────────────────────────────────────────────────────────────────
export function AccountsView({ items: initItems, callTool, toast, theme, cacheInfo: initCacheInfo, isFullscreen }: { items: any[]; callTool: (n: string, a?: any) => Promise<any>; toast: (m: string, t?: any) => void; theme: 'light' | 'dark'; cacheInfo?: { hit: boolean; cached_at: string }; isFullscreen?: boolean }) {
  const styles = useStyles();
  const t = slds(theme);
  const [localItems, setLocalItems] = useState(initItems);
  const [cacheInfo, setCacheInfo] = useState(initCacheInfo);
  const [refreshing, setRefreshing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);
  const [viewingAccount, setViewingAccount] = useState<any | null>(null);
  const [childContacts, setChildContacts] = useState<Record<string, any[]>>({});
  const [childOpps, setChildOpps] = useState<Record<string, any[]>>({});
  const [childCases, setChildCases] = useState<Record<string, any[]>>({});
  const [loadingChildren, setLoadingChildren] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({ name: '', industry: '', phone: '', website: '', type: '', billing_city: '' });

  useEffect(() => { setLocalItems(initItems); setCacheInfo(initCacheInfo); }, [initItems]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await callTool('sf__get_accounts', { refresh: true });
      setLocalItems(res?.items || []);
      setCacheInfo(res?._cache);
    } catch (e: any) { toast(e.message || 'Refresh failed', 'error'); }
    finally { setRefreshing(false); }
  };

  const openEdit = (a: any) => { setCreating(false); setEditingId(a.id); setForm({ name: a.name || '', industry: a.industry || '', phone: a.phone || '', website: a.website || '', type: a.type || '', billing_city: a.billing_city || '' }); };
  const cancel = () => { setEditingId(null); setCreating(false); };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (creating) { await callTool('sf__create_account', form); toast('Account created'); }
      else { await callTool('sf__update_account', { account_id: editingId, ...form }); toast('Account updated'); setLastSavedId(editingId); }
      cancel();
      const refreshed = await callTool('sf__get_accounts', { refresh: true });
      if (refreshed?.items) { setLocalItems(refreshed.items); setCacheInfo(refreshed._cache); }
    } catch (e: any) { toast(e.message || 'Failed', 'error'); }
    finally { setSaving(false); }
  };

  useEffect(() => { if (lastSavedId) { const x = setTimeout(() => setLastSavedId(null), 4800); return () => clearTimeout(x); } }, [lastSavedId]);

  const openView = async (account: any) => {
    setViewingAccount(account);
    const id = account.id;
    if (childContacts[id] !== undefined && childOpps[id] !== undefined && childCases[id] !== undefined) return;
    setLoadingChildren(p => new Set([...p, id]));
    try {
      const [rc, ro, rca] = await Promise.all([
        childContacts[id] !== undefined ? null : callTool('sf__get_contacts', { account_id: id }).catch(() => null),
        childOpps[id]     !== undefined ? null : callTool('sf__get_opportunities', { account_id: id }).catch(() => null),
        childCases[id]    !== undefined ? null : callTool('sf__get_cases', { account_id: id }).catch(() => null),
      ]);
      setChildContacts(p => ({ ...p, [id]: rc?.items  ?? p[id] ?? [] }));
      setChildOpps(p =>     ({ ...p, [id]: ro?.items  ?? p[id] ?? [] }));
      setChildCases(p =>    ({ ...p, [id]: rca?.items ?? p[id] ?? [] }));
    } finally { setLoadingChildren(p => { const n = new Set(p); n.delete(id); return n; }); }
  };

  const fFields = (f: typeof form, set: (k: string, v: string) => void) => [
    { label: 'Account Name *', key: 'name', value: f.name, onChange: (v: string) => set('name', v) },
    { label: 'Industry', key: 'industry', value: f.industry, onChange: (v: string) => set('industry', v), type: 'select' as const, options: ACCT_INDUSTRIES },
    { label: 'Phone', key: 'phone', value: f.phone, onChange: (v: string) => set('phone', v) },
    { label: 'Website', key: 'website', value: f.website, onChange: (v: string) => set('website', v) },
    { label: 'Type', key: 'type', value: f.type, onChange: (v: string) => set('type', v), type: 'select' as const, options: ACCT_TYPES },
    { label: 'City', key: 'billing_city', value: f.billing_city, onChange: (v: string) => set('billing_city', v) },
  ];
  const setF = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div className={styles.card} style={{ border: `1px solid ${t.border}` }}>
      <ViewHeader icon={<BuildingRegular style={{ fontSize: '18px' }} />} title="Accounts" count={localItems.length} brand={tokens.colorPalettePinkForeground2} theme={theme} cacheInfo={cacheInfo} onRefresh={isFullscreen ? handleRefresh : undefined} refreshing={refreshing} />
      <Table size="small" aria-label="Accounts" style={{ borderCollapse: 'collapse' }}>
        <TableHeader>
          <TableRow style={{ background: t.headerBg }}>
            <TableHeaderCell style={{ ...H_CELL, color: t.textWeak }}>Account Name</TableHeaderCell>
            <TableHeaderCell style={{ ...H_CELL, color: t.textWeak }}>Industry</TableHeaderCell>
            <TableHeaderCell style={{ ...H_CELL, color: t.textWeak }}>City</TableHeaderCell>
            <TableHeaderCell style={{ ...H_CELL, color: t.textWeak }}>Phone</TableHeaderCell>
            <TableHeaderCell style={{ ...H_CELL, color: t.textWeak }}>Type</TableHeaderCell>
            {isFullscreen && <TableHeaderCell style={{ ...H_CELL, width: 36, color: t.textWeak }} />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {localItems.length === 0 && !creating && <TableRow><TableCell colSpan={isFullscreen ? 6 : 5} className={styles.empty}><Text>No accounts found.</Text></TableCell></TableRow>}
          {localItems.map((a, idx) => (
            <TableRow key={a.id} style={{ borderBottom: `1px solid ${t.border}`, ...(lastSavedId === a.id ? { animation: 'sfRowFlash 4.5s ease-out' } : {}) }} className="slds-row">
              <TableCell style={D_CELL}><span style={{ fontWeight: 500, color: t.brand }}>{a.name}</span></TableCell>
              <TableCell style={D_CELL}>{a.industry || '—'}</TableCell>
              <TableCell style={D_CELL}>{a.billing_city || '—'}</TableCell>
              <TableCell style={D_CELL}>{a.phone || '—'}</TableCell>
              <TableCell style={D_CELL}>{a.type || '—'}</TableCell>
              {isFullscreen && (
                <TableCell style={D_CELL}>
                  <Button size="small" icon={<EyeRegular />} appearance="subtle" title="View" aria-label={`View ${a.name}`} onClick={() => openView(a)} />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Account 360 View Dialog — expanded mode only */}
      {viewingAccount && (
        <Dialog open={true} onOpenChange={() => setViewingAccount(null)}>
          <DialogSurface style={{ maxWidth: '820px', width: '92vw' }}>
            <DialogBody>
              <DialogTitle action={<Button appearance="subtle" icon={<DismissRegular />} onClick={() => setViewingAccount(null)} aria-label="Close" />}>
                {viewingAccount.name}
              </DialogTitle>
              <DialogContent>
                <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '10px 12px', alignItems: 'start', marginBottom: '16px' }}>
                  {[
                    ['Industry', viewingAccount.industry || '—'],
                    ['City', viewingAccount.billing_city || '—'],
                    ['Type', viewingAccount.type || '—'],
                    ['Phone', viewingAccount.phone || '—'],
                    ['Website', viewingAccount.website || '—'],
                  ].map(([label, value]) => (
                    <React.Fragment key={label}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: t.textWeak }}>{label}</div>
                      <div style={{ fontSize: '13px', color: t.text }}>{value}</div>
                    </React.Fragment>
                  ))}
                </div>

                {loadingChildren.has(viewingAccount.id) ? (
                  <div style={{ padding: '20px', textAlign: 'center' }}><Spinner size="small" label="Loading details…" /></div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Contacts */}
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: t.textWeak, marginBottom: '6px', paddingBottom: '4px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>Contacts</span>
                        <span style={{ fontWeight: 400, fontSize: '10px' }}>({(childContacts[viewingAccount.id] || []).length})</span>
                      </div>
                      {(childContacts[viewingAccount.id] || []).length === 0
                        ? <div style={{ color: t.textWeak, fontSize: '12px', padding: '2px 0' }}>No contacts</div>
                        : <Table size="extra-small" aria-label="Contacts">
                            <TableHeader>
                              <TableRow style={{ background: t.headerBg }}>
                                <TableHeaderCell style={{ ...H_CELL, color: t.textWeak }}>Name</TableHeaderCell>
                                <TableHeaderCell style={{ ...H_CELL, color: t.textWeak }}>Title</TableHeaderCell>
                                <TableHeaderCell style={{ ...H_CELL, color: t.textWeak }}>Email</TableHeaderCell>
                                <TableHeaderCell style={{ ...H_CELL, color: t.textWeak }}>Phone</TableHeaderCell>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {(childContacts[viewingAccount.id] || []).map((c: any) => (
                                <TableRow key={c.id}>
                                  <TableCell style={D_CELL}><span style={{ fontWeight: 500 }}>{c.first_name} {c.last_name}</span></TableCell>
                                  <TableCell style={D_CELL}>{c.title || '—'}</TableCell>
                                  <TableCell style={D_CELL}><span style={{ color: t.brand }}>{c.email || '—'}</span></TableCell>
                                  <TableCell style={D_CELL}>{c.phone || '—'}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>}
                    </div>
                    {/* Opportunities */}
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: t.textWeak, marginBottom: '6px', paddingBottom: '4px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>Opportunities</span>
                        <span style={{ fontWeight: 400, fontSize: '10px' }}>({(childOpps[viewingAccount.id] || []).length})</span>
                      </div>
                      {(childOpps[viewingAccount.id] || []).length === 0
                        ? <div style={{ color: t.textWeak, fontSize: '12px', padding: '2px 0' }}>No opportunities</div>
                        : <Table size="extra-small" aria-label="Opportunities">
                            <TableHeader>
                              <TableRow style={{ background: t.headerBg }}>
                                <TableHeaderCell style={{ ...H_CELL, color: t.textWeak }}>Name</TableHeaderCell>
                                <TableHeaderCell style={{ ...H_CELL, color: t.textWeak }}>Stage</TableHeaderCell>
                                <TableHeaderCell style={{ ...H_CELL, color: t.textWeak }}>Amount</TableHeaderCell>
                                <TableHeaderCell style={{ ...H_CELL, color: t.textWeak }}>Close Date</TableHeaderCell>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {(childOpps[viewingAccount.id] || []).map((o: any) => (
                                <TableRow key={o.id}>
                                  <TableCell style={D_CELL}><span style={{ fontWeight: 500 }}>{o.name}</span></TableCell>
                                  <TableCell style={D_CELL}><StatusPill status={o.stage || '—'} theme={theme} /></TableCell>
                                  <TableCell style={D_CELL}><span style={{ fontWeight: 600, color: t.brand }}>{fmt$(o.amount)}</span></TableCell>
                                  <TableCell style={D_CELL}>{o.close_date || '—'}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>}
                    </div>
                    {/* Cases */}
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: t.textWeak, marginBottom: '6px', paddingBottom: '4px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>Cases</span>
                        <span style={{ fontWeight: 400, fontSize: '10px' }}>({(childCases[viewingAccount.id] || []).length})</span>
                      </div>
                      {(childCases[viewingAccount.id] || []).length === 0
                        ? <div style={{ color: t.textWeak, fontSize: '12px', padding: '2px 0' }}>No cases</div>
                        : <Table size="extra-small" aria-label="Cases">
                            <TableHeader>
                              <TableRow style={{ background: t.headerBg }}>
                                <TableHeaderCell style={{ ...H_CELL, color: t.textWeak }}>Subject</TableHeaderCell>
                                <TableHeaderCell style={{ ...H_CELL, color: t.textWeak }}>Status</TableHeaderCell>
                                <TableHeaderCell style={{ ...H_CELL, color: t.textWeak }}>Priority</TableHeaderCell>
                                <TableHeaderCell style={{ ...H_CELL, color: t.textWeak }}>Case #</TableHeaderCell>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {(childCases[viewingAccount.id] || []).map((c: any) => (
                                <TableRow key={c.id}>
                                  <TableCell style={D_CELL}><span style={{ fontWeight: 500 }}>{c.subject}</span></TableCell>
                                  <TableCell style={D_CELL}><StatusPill status={c.status} theme={theme} /></TableCell>
                                  <TableCell style={D_CELL}><StatusPill status={c.priority} theme={theme} /></TableCell>
                                  <TableCell style={D_CELL}>{c.case_number || c.id?.slice(-6) || '—'}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>}
                    </div>
                  </div>
                )}
              </DialogContent>
              <DialogActions>
                <Button appearance="secondary" onClick={() => setViewingAccount(null)}>Close</Button>
                <Button appearance="primary" icon={<EditRegular />} onClick={() => { setViewingAccount(null); openEdit(viewingAccount); }}>Edit</Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      )}

      <RecordDialog
        open={editingId !== null || creating}
        title={creating ? "New Account" : "Edit Account"}
        fields={fFields(form, setF)}
        onSave={handleSave}
        onCancel={cancel}
        saving={saving}
        theme={theme}
      />
      <SldsFooter theme={theme} />
    </div>
  );
}
