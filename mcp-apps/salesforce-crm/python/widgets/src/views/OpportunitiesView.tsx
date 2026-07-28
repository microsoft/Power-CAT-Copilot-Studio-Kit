import React, { useEffect, useState } from 'react';
import { Badge, Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Spinner, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text, tokens } from '@fluentui/react-components';
import { DismissRegular, EditRegular, EyeRegular, MoneyRegular } from '@fluentui/react-icons';
import { fmt$, fmtDate, OPP_STAGES } from '../constants';
import { useStyles, H_CELL, D_CELL } from '../styles';
import { StatusPill } from '../components/StatusPill';
import { ViewHeader } from '../components/ViewHeader';
import { RecordDialog } from '../components/RecordDialog';
import { SldsFooter } from '../components/SldsFooter';
import { slds } from '../theme';

// ── OpportunitiesView ──────────────────────────────────────────────────────
// ────────────────────────────────────────────────────────────────────────────
export function OpportunitiesView({ items: initItems, callTool, toast, theme, cacheInfo: initCacheInfo, isFullscreen }: { items: any[]; callTool: (n: string, a?: any) => Promise<any>; toast: (m: string, t?: any) => void; theme: 'light' | 'dark'; cacheInfo?: { hit: boolean; cached_at: string }; isFullscreen?: boolean }) {
  const styles = useStyles();
  const t = slds(theme);
  const [localItems, setLocalItems] = useState(initItems);
  const [cacheInfo, setCacheInfo] = useState(initCacheInfo);
  const [refreshing, setRefreshing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);
  const [viewingOpp, setViewingOpp] = useState<any | null>(null);
  const [childProducts, setChildProducts] = useState<Record<string, any[]>>({});
  const [childRoles, setChildRoles] = useState<Record<string, any[]>>({});
  const [loadingChildren, setLoadingChildren] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({ name: '', account_name: '', stage: '', amount: '', close_date: '', probability: '' });

  useEffect(() => { setLocalItems(initItems); setCacheInfo(initCacheInfo); }, [initItems]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await callTool('sf__get_opportunities', { refresh: true });
      setLocalItems(res?.items || []);
      setCacheInfo(res?._cache);
    } catch (e: any) { toast(e.message || 'Refresh failed', 'error'); }
    finally { setRefreshing(false); }
  };

  const openEdit = (o: any) => { setCreating(false); setEditingId(o.id); setForm({ name: o.name || '', account_name: o.account_name || '', stage: o.stage || '', amount: o.amount != null ? String(o.amount) : '', close_date: o.close_date || '', probability: o.probability != null ? String(o.probability) : '' }); };
  const cancel = () => { setEditingId(null); setCreating(false); };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Strip null for empty numeric fields — server signature has float/int
      // defaults; explicit null fails MCP client schema validation
      // (surfaced to the user as a "method not found"-shaped error).
      const args: Record<string, any> = { ...form };
      if (form.amount)      args.amount = parseFloat(form.amount);
      else                  delete args.amount;
      if (form.probability) args.probability = parseInt(form.probability);
      else                  delete args.probability;

      const res: any = creating
        ? await callTool('sf__create_opportunity', args)
        : await callTool('sf__update_opportunity', { opportunity_id: editingId, ...args });

      // Alert path — server returned a non-fatal FK lookup miss with
      // suggestions. Surface persistently and keep the form open so the
      // user can correct the account name and re-submit.
      if (res && res.type === 'alert') {
        toast(res.message || 'Cannot complete — please correct and retry.', 'info', 0);
        return;
      }
      toast(creating ? 'Opportunity created' : 'Opportunity updated');
      if (!creating) setLastSavedId(editingId);
      cancel();
      const refreshed = await callTool('sf__get_opportunities', { refresh: true });
      if (refreshed?.items) { setLocalItems(refreshed.items); setCacheInfo(refreshed._cache); }
    } catch (e: any) { toast(e.message || 'Failed', 'error'); }
    finally { setSaving(false); }
  };

  useEffect(() => { if (lastSavedId) { const x = setTimeout(() => setLastSavedId(null), 4800); return () => clearTimeout(x); } }, [lastSavedId]);

  const setF = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));
  const fFields = (f: typeof form, isEdit: boolean = false) => [
    { label: 'Opportunity Name *', key: 'name', value: f.name, onChange: (v: string) => setF('name', v) },
    { label: 'Account (type full name)', key: 'account_name', value: f.account_name, onChange: (v: string) => setF('account_name', v), readonly: isEdit },
    { label: 'Stage', key: 'stage', value: f.stage, onChange: (v: string) => setF('stage', v), type: 'select' as const, options: OPP_STAGES },
    { label: 'Amount ($)', key: 'amount', value: f.amount, onChange: (v: string) => setF('amount', v), inputType: 'number' },
    { label: 'Close Date', key: 'close_date', value: f.close_date, onChange: (v: string) => setF('close_date', v), inputType: 'date' },
    { label: 'Probability (%)', key: 'probability', value: f.probability, onChange: (v: string) => setF('probability', v), inputType: 'number' },
  ];

  const openView = async (opportunity: any) => {
    setViewingOpp(opportunity);
    const id = opportunity.id;
    if (childProducts[id] !== undefined && childRoles[id] !== undefined) return;
    setLoadingChildren(p => new Set([...p, id]));
    try {
      const [pr, cr] = await Promise.all([
        childProducts[id] !== undefined ? null : callTool('sf__get_opportunity_products', { opportunity_id: id }).catch(() => null),
        childRoles[id] !== undefined ? null : callTool('sf__get_opportunity_contact_roles', { opportunity_id: id }).catch(() => null),
      ]);
      setChildProducts(p => ({ ...p, [id]: pr?.items ?? p[id] ?? [] }));
      setChildRoles(p => ({ ...p, [id]: cr?.items ?? p[id] ?? [] }));
    } finally {
      setLoadingChildren(p => { const next = new Set(p); next.delete(id); return next; });
    }
  };

  return (
    <div className={styles.card} style={{ border: `1px solid ${t.border}` }}>
      <ViewHeader icon={<MoneyRegular style={{ fontSize: '18px' }} />} title="Opportunities" count={localItems.length} brand={tokens.colorPaletteCornflowerForeground2} theme={theme} cacheInfo={cacheInfo} onRefresh={isFullscreen ? handleRefresh : undefined} refreshing={refreshing} />
      <Table size="small" aria-label="Opportunities" style={{ borderCollapse: 'collapse' }}>
        <TableHeader>
          <TableRow style={{ background: t.headerBg }}>
            {['Name', 'Account', 'Stage', 'Amount', 'Close Date', 'Prob %'].map(h => <TableHeaderCell key={h} style={{ ...H_CELL, color: t.textWeak }}>{h}</TableHeaderCell>)}
            {isFullscreen && <TableHeaderCell style={{ ...H_CELL, width: 36, color: t.textWeak }} />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {localItems.length === 0 && !creating && <TableRow><TableCell colSpan={isFullscreen ? 7 : 6} className={styles.empty}><Text>No opportunities found.</Text></TableCell></TableRow>}
          {localItems.map((o: any) => (
            <TableRow key={o.id} style={{ borderBottom: `1px solid ${t.border}`, ...(lastSavedId === o.id ? { animation: 'sfRowFlash 4.5s ease-out' } : {}) }} className="slds-row">
              <TableCell style={D_CELL}>{o.name}</TableCell>
              <TableCell style={D_CELL}>{o.account_name || '—'}</TableCell>
              <TableCell style={D_CELL}><StatusPill status={o.stage} theme={theme} /></TableCell>
              <TableCell style={{ ...D_CELL, fontWeight: 500 }}>{fmt$(o.amount)}</TableCell>
              <TableCell style={D_CELL}>{fmtDate(o.close_date)}</TableCell>
              <TableCell style={D_CELL}>{o.probability != null ? o.probability + '%' : '—'}</TableCell>
              {isFullscreen && (
                <TableCell style={D_CELL}>
                  <Button size="small" icon={<EyeRegular />} appearance="subtle" title="View" aria-label={`View ${o.name}`} onClick={() => openView(o)} />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {viewingOpp && (
        <Dialog open={true} onOpenChange={() => setViewingOpp(null)}>
          <DialogSurface style={{ maxWidth: '820px', width: '92vw' }}>
            <DialogBody>
              <DialogTitle action={<Button appearance="subtle" icon={<DismissRegular />} onClick={() => setViewingOpp(null)} aria-label="Close" />}>
                {viewingOpp.name || 'Opportunity'}
              </DialogTitle>
              <DialogContent>
                <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '10px 12px', alignItems: 'start', marginBottom: '16px' }}>
                  {[
                    ['Account', viewingOpp.account_name || '—'],
                    ['Stage', viewingOpp.stage || '—'],
                    ['Amount', fmt$(viewingOpp.amount)],
                    ['Close Date', fmtDate(viewingOpp.close_date)],
                    ['Probability', viewingOpp.probability != null ? `${viewingOpp.probability}%` : '—'],
                  ].map(([label, value]) => (
                    <React.Fragment key={label}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: t.textWeak }}>{label}</div>
                      <div style={{ fontSize: '13px', color: t.text }}>{value}</div>
                    </React.Fragment>
                  ))}
                </div>

                {loadingChildren.has(viewingOpp.id) ? (
                  <div style={{ padding: '20px', textAlign: 'center' }}><Spinner size="small" label="Loading details…" /></div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: t.textWeak, marginBottom: '6px', paddingBottom: '4px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>Products</span>
                        <span style={{ fontWeight: 400, fontSize: '10px' }}>({(childProducts[viewingOpp.id] || []).length})</span>
                      </div>
                      {(childProducts[viewingOpp.id] || []).length === 0 ? (
                        <div style={{ color: t.textWeak, fontSize: '12px', padding: '2px 0' }}>No products on this opportunity.</div>
                      ) : (
                        <Table size="extra-small" aria-label="Products">
                          <TableHeader>
                            <TableRow style={{ background: t.headerBg }}>
                              {['Name', 'Code', 'Qty', 'Unit Price', 'Total'].map(h => <TableHeaderCell key={h} style={{ ...H_CELL, color: t.textWeak }}>{h}</TableHeaderCell>)}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(childProducts[viewingOpp.id] || []).map((p: any) => (
                              <TableRow key={p.id}>
                                <TableCell style={D_CELL}>{p.name || '—'}</TableCell>
                                <TableCell style={D_CELL}>{p.code || '—'}</TableCell>
                                <TableCell style={D_CELL}>{p.quantity != null ? p.quantity : '—'}</TableCell>
                                <TableCell style={D_CELL}>{fmt$(p.unit_price)}</TableCell>
                                <TableCell style={{ ...D_CELL, fontWeight: 500 }}>{fmt$(p.total_price)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </div>

                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: t.textWeak, marginBottom: '6px', paddingBottom: '4px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>Contact Roles</span>
                        <span style={{ fontWeight: 400, fontSize: '10px' }}>({(childRoles[viewingOpp.id] || []).length})</span>
                      </div>
                      {(childRoles[viewingOpp.id] || []).length === 0 ? (
                        <div style={{ color: t.textWeak, fontSize: '12px', padding: '2px 0' }}>No contact roles on this opportunity.</div>
                      ) : (
                        <Table size="extra-small" aria-label="Contact Roles">
                          <TableHeader>
                            <TableRow style={{ background: t.headerBg }}>
                              {['Name', 'Role', 'Title', 'Email', 'Phone'].map(h => <TableHeaderCell key={h} style={{ ...H_CELL, color: t.textWeak }}>{h}</TableHeaderCell>)}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(childRoles[viewingOpp.id] || []).map((cr: any) => (
                              <TableRow key={cr.id}>
                                <TableCell style={D_CELL}>
                                  {(cr.first_name || '') + ' ' + (cr.last_name || '')}
                                  {cr.is_primary ? <Badge appearance="tint" size="small" color="brand" style={{ marginLeft: '6px' }}>primary</Badge> : null}
                                </TableCell>
                                <TableCell style={D_CELL}>{cr.role || '—'}</TableCell>
                                <TableCell style={D_CELL}>{cr.title || '—'}</TableCell>
                                <TableCell style={D_CELL}>{cr.email || '—'}</TableCell>
                                <TableCell style={D_CELL}>{cr.phone || '—'}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </div>
                  </div>
                )}
              </DialogContent>
              <DialogActions>
                <Button appearance="secondary" onClick={() => setViewingOpp(null)}>Close</Button>
                <Button appearance="primary" icon={<EditRegular />} onClick={() => { const opportunity = viewingOpp; setViewingOpp(null); if (opportunity) openEdit(opportunity); }}>Edit</Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      )}
      <RecordDialog
        open={editingId !== null || creating}
        title={creating ? "New Opportunity" : "Edit Opportunity"}
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
