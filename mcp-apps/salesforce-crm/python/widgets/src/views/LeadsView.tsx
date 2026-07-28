import React, { useEffect, useState } from 'react';
import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text, tokens } from '@fluentui/react-components';
import { CheckmarkRegular, DismissRegular, EditRegular, EyeRegular, PeopleRegular } from '@fluentui/react-icons';
import { LEAD_SOURCES, LEAD_STATUSES } from '../constants';
import { useStyles, H_CELL, D_CELL } from '../styles';
import { StatusPill } from '../components/StatusPill';
import { ViewHeader } from '../components/ViewHeader';
import { RecordDialog } from '../components/RecordDialog';
import { SldsFooter } from '../components/SldsFooter';
import { OpportunitiesView } from './OpportunitiesView';
import { slds } from '../theme';

// ── LeadsView ──────────────────────────────────────────────────────────────
// ────────────────────────────────────────────────────────────────────────────
export function LeadsView({ items: initItems, callTool, toast, theme, cacheInfo: initCacheInfo, isFullscreen }: { items: any[]; callTool: (n: string, a?: any) => Promise<any>; toast: (m: string, t?: any) => void; theme: 'light' | 'dark'; cacheInfo?: { hit: boolean; cached_at: string }; isFullscreen?: boolean }) {
  const styles = useStyles();
  const t = slds(theme);
  const [localItems, setLocalItems] = useState(initItems);
  const [cacheInfo, setCacheInfo] = useState(initCacheInfo);
  const [refreshing, setRefreshing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [convertedToOpp, setConvertedToOpp] = useState<any | null>(null);
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);
  const [viewingLead, setViewingLead] = useState<any | null>(null);
  const [form, setForm] = useState({ first_name: '', last_name: '', company: '', email: '', phone: '', status: '', lead_source: '' });

  useEffect(() => { setLocalItems(initItems); setCacheInfo(initCacheInfo); }, [initItems]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await callTool('sf__get_leads', { refresh: true });
      setLocalItems(res?.items || []);
      setCacheInfo(res?._cache);
    } catch (e: any) { toast(e.message || 'Refresh failed', 'error'); }
    finally { setRefreshing(false); }
  };

  const openEdit = (l: any) => { setCreating(false); setEditingId(l.id); setForm({ first_name: l.first_name || '', last_name: l.last_name || '', company: l.company || '', email: l.email || '', phone: l.phone || '', status: l.status || '', lead_source: l.lead_source || '' }); };
  const cancel = () => { setEditingId(null); setCreating(false); };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (creating) { await callTool('sf__create_lead', form); toast('Lead created'); }
      else { await callTool('sf__update_lead', { lead_id: editingId, ...form }); toast('Lead updated'); setLastSavedId(editingId); }
      cancel();
      const refreshed = await callTool('sf__get_leads', { refresh: true });
      if (refreshed?.items) { setLocalItems(refreshed.items); setCacheInfo(refreshed._cache); }
    } catch (e: any) { toast(e.message || 'Failed', 'error'); }
    finally { setSaving(false); }
  };

  const handleConvert = async (leadId: string) => {
    setConvertingId(leadId);
    try {
      const res = await callTool('sf__convert_lead', { lead_id: leadId });
      if (res?.type === 'opportunities' && Array.isArray(res?.items) && res.items.length > 0) {
        toast('Lead converted — showing new opportunity');
        setViewingLead(null);
        setConvertedToOpp(res);
      } else {
        // do_not_create_opportunity path or unexpected shape — refresh leads
        toast('Lead converted (no opportunity created)');
        const refreshed = await callTool('sf__get_leads', { refresh: true });
        setLocalItems(refreshed?.items || []);
        setCacheInfo(refreshed?._cache);
        setViewingLead(refreshed?.items?.find((item: any) => item.id === leadId) || null);
      }
    } catch (e: any) {
      toast(e?.message || 'Convert failed', 'error');
    } finally {
      setConvertingId(null);
    }
  };

  useEffect(() => { if (lastSavedId) { const x = setTimeout(() => setLastSavedId(null), 4800); return () => clearTimeout(x); } }, [lastSavedId]);

  const fFields = (f: typeof form, set: (k: string, v: string) => void) => [
    { label: 'First Name', key: 'first_name', value: f.first_name, onChange: (v: string) => set('first_name', v) },
    { label: 'Last Name *', key: 'last_name', value: f.last_name, onChange: (v: string) => set('last_name', v) },
    { label: 'Company *', key: 'company', value: f.company, onChange: (v: string) => set('company', v) },
    { label: 'Email', key: 'email', value: f.email, onChange: (v: string) => set('email', v), inputType: 'email' },
    { label: 'Phone', key: 'phone', value: f.phone, onChange: (v: string) => set('phone', v) },
    { label: 'Status', key: 'status', value: f.status, onChange: (v: string) => set('status', v), type: 'select' as const, options: LEAD_STATUSES },
    { label: 'Lead Source', key: 'lead_source', value: f.lead_source, onChange: (v: string) => set('lead_source', v), type: 'select' as const, options: LEAD_SOURCES },
  ];
  const setF = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  // After a successful convert, swap to the new Opportunity widget.
  if (convertedToOpp) {
    return (
      <OpportunitiesView
        items={convertedToOpp.items || []}
        callTool={callTool}
        toast={toast}
        theme={theme}
        cacheInfo={convertedToOpp._cache}
        isFullscreen={isFullscreen}
      />
    );
  }

  return (
    <div className={styles.card} style={{ border: `1px solid ${t.border}` }}>
      <ViewHeader icon={<PeopleRegular style={{ fontSize: '18px' }} />} title="Leads" count={localItems.length} brand={tokens.colorPaletteLavenderForeground2} theme={theme} cacheInfo={cacheInfo} onRefresh={isFullscreen ? handleRefresh : undefined} refreshing={refreshing} />
      <Table size="small" aria-label="Leads" style={{ borderCollapse: 'collapse' }}>
        <TableHeader>
          <TableRow style={{ background: t.headerBg }}>
            {['Name', 'Company', 'Status', 'Source', 'Email'].map(h => <TableHeaderCell key={h} style={{ ...H_CELL, color: t.textWeak }}>{h}</TableHeaderCell>)}
            {isFullscreen && <TableHeaderCell style={{ ...H_CELL, width: 180, color: t.textWeak }} />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {localItems.length === 0 && !creating && <TableRow><TableCell colSpan={isFullscreen ? 6 : 5} className={styles.empty}><Text>No leads found.</Text></TableCell></TableRow>}
          {localItems.map((l: any) => (
            <TableRow key={l.id} style={{ borderBottom: `1px solid ${t.border}`, ...(lastSavedId === l.id ? { animation: 'sfRowFlash 4.5s ease-out' } : {}) }} className="slds-row">
              <TableCell style={D_CELL}>{l.first_name} {l.last_name}</TableCell>
              <TableCell style={D_CELL}>{l.company || '—'}</TableCell>
              <TableCell style={{ ...D_CELL, maxWidth: 90 }}><StatusPill status={(l.status || '').split(' - ').pop() || l.status} theme={theme} /></TableCell>
              <TableCell style={D_CELL}>{l.lead_source || '—'}</TableCell>
              <TableCell style={D_CELL}>{l.email || '—'}</TableCell>
              {isFullscreen && (
                <TableCell style={{ ...D_CELL, overflow: 'visible', maxWidth: 'none', whiteSpace: 'nowrap' }}>
                  <Button size="small" icon={<EyeRegular />} appearance="secondary" title="View" aria-label={`View ${l.first_name} ${l.last_name}`.trim()} onClick={() => setViewingLead(l)} />
                  {l.is_converted ? (
                    <Button
                      size="small"
                      appearance="secondary"
                      icon={<CheckmarkRegular />}
                      disabled
                      style={{ marginLeft: '6px' }}
                      aria-label={`${l.first_name} ${l.last_name} already converted`.trim()}
                    >
                      Converted
                    </Button>
                  ) : (
                    <Button
                      size="small"
                      appearance="secondary"
                      title="Convert Lead (creates Account + Contact + Opportunity)"
                      aria-label={`Convert ${l.first_name} ${l.last_name}`.trim()}
                      onClick={() => handleConvert(l.id)}
                      disabled={convertingId === l.id}
                      style={{ marginLeft: '6px' }}
                    >
                      {convertingId === l.id ? 'Converting…' : 'Convert'}
                    </Button>
                  )}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {viewingLead && (
        <Dialog open={true} onOpenChange={() => setViewingLead(null)}>
          <DialogSurface style={{ maxWidth: '640px', width: '90vw' }}>
            <DialogBody>
              <DialogTitle action={<Button appearance="subtle" icon={<DismissRegular />} onClick={() => setViewingLead(null)} aria-label="Close" />}>
                {[viewingLead.first_name, viewingLead.last_name].filter(Boolean).join(' ') || viewingLead.company || 'Lead'}
              </DialogTitle>
              <DialogContent>
                <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '10px 12px', alignItems: 'start', marginBottom: '16px' }}>
                  {[
                    ['Company', viewingLead.company || '—'],
                    ['Status', viewingLead.status || '—'],
                    ['Lead Source', viewingLead.lead_source || '—'],
                    ['Email', viewingLead.email || '—'],
                    ['Phone', viewingLead.phone || '—'],
                  ].map(([label, value]) => (
                    <React.Fragment key={label}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: t.textWeak }}>{label}</div>
                      <div style={{ fontSize: '13px', color: t.text }}>{value}</div>
                    </React.Fragment>
                  ))}
                </div>
              </DialogContent>
              <DialogActions>
                <Button appearance="secondary" onClick={() => setViewingLead(null)}>Close</Button>
                <Button appearance="primary" icon={<EditRegular />} onClick={() => { const lead = viewingLead; setViewingLead(null); if (lead) openEdit(lead); }}>Edit</Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      )}
      <RecordDialog
        open={editingId !== null || creating}
        title={creating ? "New Lead" : "Edit Lead"}
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
