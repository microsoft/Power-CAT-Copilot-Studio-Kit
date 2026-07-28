import React, { useEffect, useState } from 'react';
import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Spinner, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text, tokens } from '@fluentui/react-components';
import { DismissRegular, EditRegular, EyeRegular, PersonRegular } from '@fluentui/react-icons';
import { fmt$, fmtDate } from '../constants';
import { useStyles, H_CELL, D_CELL } from '../styles';
import { StatusPill } from '../components/StatusPill';
import { ViewHeader } from '../components/ViewHeader';
import { RecordDialog } from '../components/RecordDialog';
import { SldsFooter } from '../components/SldsFooter';
import { slds } from '../theme';

// ── ContactsView ───────────────────────────────────────────────────────────
// ────────────────────────────────────────────────────────────────────────────
export function ContactsView({ items: initItems, callTool, toast, theme, cacheInfo: initCacheInfo, isFullscreen }: { items: any[]; callTool: (n: string, a?: any) => Promise<any>; toast: (m: string, t?: any) => void; theme: 'light' | 'dark'; cacheInfo?: { hit: boolean; cached_at: string }; isFullscreen?: boolean }) {
  const styles = useStyles();
  const t = slds(theme);
  const [localItems, setLocalItems] = useState(initItems);
  const [cacheInfo, setCacheInfo] = useState(initCacheInfo);
  const [refreshing, setRefreshing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);
  const [viewingContact, setViewingContact] = useState<any | null>(null);
  const [childOpps, setChildOpps] = useState<Record<string, any[]>>({});
  const [loadingChildren, setLoadingChildren] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', phone: '', title: '', account_name: '' });

  useEffect(() => { setLocalItems(initItems); setCacheInfo(initCacheInfo); }, [initItems]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await callTool('sf__get_contacts', { refresh: true });
      setLocalItems(res?.items || []);
      setCacheInfo(res?._cache);
    } catch (e: any) { toast(e.message || 'Refresh failed', 'error'); }
    finally { setRefreshing(false); }
  };

  const openEdit = (c: any) => { setCreating(false); setEditingId(c.id); setForm({ first_name: c.first_name || '', last_name: c.last_name || '', email: c.email || '', phone: c.phone || '', title: c.title || '', account_name: c.account_name || '' }); };
  const cancel = () => { setEditingId(null); setCreating(false); };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res: any = creating
        ? await callTool('sf__create_contact', form)
        : await callTool('sf__update_contact', { contact_id: editingId, ...form });

      if (res && res.type === 'alert') {
        toast(res.message || 'Cannot complete — please correct and retry.', 'info', 0);
        return;
      }
      toast(creating ? 'Contact created' : 'Contact updated');
      if (!creating) setLastSavedId(editingId);
      cancel();
      const refreshed = await callTool('sf__get_contacts', { refresh: true });
      if (refreshed?.items) { setLocalItems(refreshed.items); setCacheInfo(refreshed._cache); }
    } catch (e: any) { toast(e.message || 'Failed', 'error'); }
    finally { setSaving(false); }
  };

  useEffect(() => { if (lastSavedId) { const x = setTimeout(() => setLastSavedId(null), 4800); return () => clearTimeout(x); } }, [lastSavedId]);

  const openView = async (contact: any) => {
    setViewingContact(contact);
    const id = contact.id;
    if (childOpps[id] !== undefined || !contact.account_id) return;
    setLoadingChildren(p => new Set([...p, id]));
    try {
      const res = await callTool('sf__get_opportunities', { account_id: contact.account_id }).catch(() => null);
      setChildOpps(p => ({ ...p, [id]: res?.items ?? p[id] ?? [] }));
    } finally {
      setLoadingChildren(p => { const next = new Set(p); next.delete(id); return next; });
    }
  };

  const setF = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));
  const fFields = (f: typeof form, isEdit: boolean = false) => [
    { label: 'First Name', key: 'first_name', value: f.first_name, onChange: (v: string) => setF('first_name', v) },
    { label: 'Last Name *', key: 'last_name', value: f.last_name, onChange: (v: string) => setF('last_name', v) },
    { label: 'Email', key: 'email', value: f.email, onChange: (v: string) => setF('email', v), inputType: 'email' },
    { label: 'Phone', key: 'phone', value: f.phone, onChange: (v: string) => setF('phone', v) },
    { label: 'Title', key: 'title', value: f.title, onChange: (v: string) => setF('title', v) },
    { label: 'Account (type full name)', key: 'account_name', value: f.account_name, onChange: (v: string) => setF('account_name', v), readonly: isEdit },
  ];

  return (
    <div className={styles.card} style={{ border: `1px solid ${t.border}` }}>
      <ViewHeader icon={<PersonRegular style={{ fontSize: '18px' }} />} title="Contacts" count={localItems.length} brand={tokens.colorPaletteMagentaForeground2} theme={theme} cacheInfo={cacheInfo} onRefresh={isFullscreen ? handleRefresh : undefined} refreshing={refreshing} />
      <Table size="small" aria-label="Contacts" style={{ borderCollapse: 'collapse' }}>
        <TableHeader>
          <TableRow style={{ background: t.headerBg }}>
            {['Name', 'Account', 'Title', 'Email', 'Phone'].map(h => <TableHeaderCell key={h} style={{ ...H_CELL, color: t.textWeak }}>{h}</TableHeaderCell>)}
            {isFullscreen && <TableHeaderCell style={{ ...H_CELL, width: 36, color: t.textWeak }} />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {localItems.length === 0 && !creating && <TableRow><TableCell colSpan={isFullscreen ? 6 : 5} className={styles.empty}><Text>No contacts found.</Text></TableCell></TableRow>}
          {localItems.map((c: any) => (
            <TableRow key={c.id} style={{ borderBottom: `1px solid ${t.border}`, ...(lastSavedId === c.id ? { animation: 'sfRowFlash 4.5s ease-out' } : {}) }} className="slds-row">
              <TableCell style={D_CELL}>{c.first_name} {c.last_name}</TableCell>
              <TableCell style={D_CELL}>{c.account_name || '—'}</TableCell>
              <TableCell style={D_CELL}>{c.title || '—'}</TableCell>
              <TableCell style={D_CELL}>{c.email || '—'}</TableCell>
              <TableCell style={D_CELL}>{c.phone || '—'}</TableCell>
              {isFullscreen && (
                <TableCell style={D_CELL}>
                  <Button size="small" icon={<EyeRegular />} appearance="subtle" title="View" aria-label={`View ${c.first_name} ${c.last_name}`.trim()} onClick={() => openView(c)} />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {viewingContact && (
        <Dialog open={true} onOpenChange={() => setViewingContact(null)}>
          <DialogSurface style={{ maxWidth: '820px', width: '92vw' }}>
            <DialogBody>
              <DialogTitle action={<Button appearance="subtle" icon={<DismissRegular />} onClick={() => setViewingContact(null)} aria-label="Close" />}>
                {[viewingContact.first_name, viewingContact.last_name].filter(Boolean).join(' ') || 'Contact'}
              </DialogTitle>
              <DialogContent>
                <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '10px 12px', alignItems: 'start', marginBottom: '16px' }}>
                  {[
                    ['Account', viewingContact.account_name || '—'],
                    ['Title', viewingContact.title || '—'],
                    ['Email', viewingContact.email || '—'],
                    ['Phone', viewingContact.phone || '—'],
                  ].map(([label, value]) => (
                    <React.Fragment key={label}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: t.textWeak }}>{label}</div>
                      <div style={{ fontSize: '13px', color: t.text }}>{value}</div>
                    </React.Fragment>
                  ))}
                </div>

                {loadingChildren.has(viewingContact.id) ? (
                  <div style={{ padding: '20px', textAlign: 'center' }}><Spinner size="small" label="Loading details…" /></div>
                ) : (
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: t.textWeak, marginBottom: '6px', paddingBottom: '4px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>Opportunities</span>
                      <span style={{ fontWeight: 400, fontSize: '10px' }}>({(childOpps[viewingContact.id] || []).length})</span>
                    </div>
                    {!viewingContact.account_id ? (
                      <div style={{ color: t.textWeak, fontSize: '12px', padding: '2px 0' }}>No account linked.</div>
                    ) : (childOpps[viewingContact.id] || []).length === 0 ? (
                      <div style={{ color: t.textWeak, fontSize: '12px', padding: '2px 0' }}>No opportunities</div>
                    ) : (
                      <Table size="extra-small" aria-label="Opportunities">
                        <TableHeader>
                          <TableRow style={{ background: t.headerBg }}>
                            {['Name', 'Stage', 'Amount', 'Close Date'].map(h => <TableHeaderCell key={h} style={{ ...H_CELL, color: t.textWeak }}>{h}</TableHeaderCell>)}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(childOpps[viewingContact.id] || []).map((o: any) => (
                            <TableRow key={o.id}>
                              <TableCell style={D_CELL}><span style={{ fontWeight: 500 }}>{o.name}</span></TableCell>
                              <TableCell style={D_CELL}><StatusPill status={o.stage || '—'} theme={theme} /></TableCell>
                              <TableCell style={D_CELL}><span style={{ fontWeight: 600, color: t.brand }}>{fmt$(o.amount)}</span></TableCell>
                              <TableCell style={D_CELL}>{fmtDate(o.close_date)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                )}
              </DialogContent>
              <DialogActions>
                <Button appearance="secondary" onClick={() => setViewingContact(null)}>Close</Button>
                <Button appearance="primary" icon={<EditRegular />} onClick={() => { const contact = viewingContact; setViewingContact(null); if (contact) openEdit(contact); }}>Edit</Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      )}
      <RecordDialog
        open={editingId !== null || creating}
        title={creating ? "New Contact" : "Edit Contact"}
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
