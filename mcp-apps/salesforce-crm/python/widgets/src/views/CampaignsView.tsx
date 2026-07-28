import React, { useEffect, useState } from 'react';
import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Spinner, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, Text, tokens } from '@fluentui/react-components';
import { DismissRegular, DocumentRegular, EyeRegular } from '@fluentui/react-icons';
import { fmtDate } from '../constants';
import { useStyles, H_CELL, D_CELL } from '../styles';
import { StatusPill } from '../components/StatusPill';
import { ViewHeader } from '../components/ViewHeader';
import { SldsFooter } from '../components/SldsFooter';
import { slds } from '../theme';

// ── CampaignsView ──────────────────────────────────────────────────────────
// ────────────────────────────────────────────────────────────────────────────
export function CampaignsView({ items: initItems, callTool, toast, theme, cacheInfo: initCacheInfo, isFullscreen }: { items: any[]; callTool: (n: string, a?: any) => Promise<any>; toast: (m: string, t?: any) => void; theme: 'light' | 'dark'; cacheInfo?: { hit: boolean; cached_at: string }; isFullscreen?: boolean }) {
  const styles = useStyles();
  const t = slds(theme);
  const [items, setItems] = useState(initItems);
  const [cacheInfo, setCacheInfo] = useState(initCacheInfo);
  const [refreshing, setRefreshing] = useState(false);
  const [viewingCampaign, setViewingCampaign] = useState<any | null>(null);
  const [childLeads, setChildLeads] = useState<Record<string, any[]>>({});
  const [loadingChildren, setLoadingChildren] = useState<Set<string>>(new Set());

  useEffect(() => { setItems(initItems); setCacheInfo(initCacheInfo); }, [initItems]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await callTool('sf__get_campaigns', { refresh: true });
      setItems(res?.items || []);
      setCacheInfo(res?._cache);
    } catch { /* silent */ }
    finally { setRefreshing(false); }
  };

  const openView = async (campaign: any) => {
    setViewingCampaign(campaign);
    const id = campaign.id;
    if (childLeads[id] !== undefined) return;
    setLoadingChildren(p => new Set([...p, id]));
    try {
      const res = await callTool('sf__get_leads', { campaign_id: id }).catch(() => null);
      setChildLeads(p => ({ ...p, [id]: res?.items ?? p[id] ?? [] }));
    } finally {
      setLoadingChildren(p => { const next = new Set(p); next.delete(id); return next; });
    }
  };

  return (
    <div className={styles.card} style={{ border: `1px solid ${t.border}` }}>
      <ViewHeader icon={<DocumentRegular style={{ fontSize: '18px' }} />} title="Campaigns" count={items.length} brand={tokens.colorPaletteMarigoldForeground2} theme={theme} cacheInfo={cacheInfo} onRefresh={isFullscreen ? handleRefresh : undefined} refreshing={refreshing} />
      <Table size="small" aria-label="Campaigns" style={{ borderCollapse: 'collapse' }}>
        <TableHeader>
          <TableRow style={{ background: t.headerBg }}>
            {['Name', 'Status', 'Type', 'Start', 'End', '# Leads'].map(h => <TableHeaderCell key={h} style={{ ...H_CELL, color: t.textWeak }}>{h}</TableHeaderCell>)}
            {isFullscreen && <TableHeaderCell style={{ ...H_CELL, width: 36, color: t.textWeak }} />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 && <TableRow><TableCell colSpan={isFullscreen ? 7 : 6} className={styles.empty}><Text>No campaigns found.</Text></TableCell></TableRow>}
          {items.map((c: any) => (
            <TableRow key={c.id} style={{ borderBottom: `1px solid ${t.border}` }} className="slds-row">
              <TableCell style={{ ...D_CELL, whiteSpace: 'normal', overflow: 'visible', textOverflow: 'clip', maxWidth: 'none' }}><span style={{ fontWeight: 500, display: 'inline-block', maxWidth: 260, wordBreak: 'break-word' }}>{c.name}</span></TableCell>
              <TableCell style={D_CELL}><StatusPill status={c.status} theme={theme} /></TableCell>
              <TableCell style={D_CELL}>{c.type || '—'}</TableCell>
              <TableCell style={D_CELL}>{fmtDate(c.start_date)}</TableCell>
              <TableCell style={D_CELL}>{fmtDate(c.end_date)}</TableCell>
              <TableCell style={D_CELL}>{c.number_of_leads ?? '—'}</TableCell>
              {isFullscreen && (
                <TableCell style={D_CELL}>
                  <Button size="small" icon={<EyeRegular />} appearance="subtle" title="View" aria-label={`View ${c.name}`} onClick={() => openView(c)} />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {viewingCampaign && (
        <Dialog open={true} onOpenChange={() => setViewingCampaign(null)}>
          <DialogSurface style={{ maxWidth: '820px', width: '92vw' }}>
            <DialogBody>
              <DialogTitle action={<Button appearance="subtle" icon={<DismissRegular />} onClick={() => setViewingCampaign(null)} aria-label="Close" />}>
                {viewingCampaign.name || 'Campaign'}
              </DialogTitle>
              <DialogContent>
                <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '10px 12px', alignItems: 'start', marginBottom: '16px' }}>
                  {[
                    ['Status', viewingCampaign.status || '—'],
                    ['Type', viewingCampaign.type || '—'],
                    ['Start Date', fmtDate(viewingCampaign.start_date)],
                    ['End Date', fmtDate(viewingCampaign.end_date)],
                    ['# Leads', String(viewingCampaign.number_of_leads ?? '—')],
                  ].map(([label, value]) => (
                    <React.Fragment key={label}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: t.textWeak }}>{label}</div>
                      <div style={{ fontSize: '13px', color: t.text }}>{value}</div>
                    </React.Fragment>
                  ))}
                </div>

                {loadingChildren.has(viewingCampaign.id) ? (
                  <div style={{ padding: '20px', textAlign: 'center' }}><Spinner size="small" label="Loading details…" /></div>
                ) : (
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: t.textWeak, marginBottom: '6px', paddingBottom: '4px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>Campaign Leads</span>
                      <span style={{ fontWeight: 400, fontSize: '10px' }}>({(childLeads[viewingCampaign.id] || []).length})</span>
                    </div>
                    {(childLeads[viewingCampaign.id] || []).length === 0 ? (
                      <div style={{ color: t.textWeak, fontSize: '12px', padding: '2px 0' }}>No leads in this campaign.</div>
                    ) : (
                      <Table size="extra-small" aria-label="Campaign Leads">
                        <TableHeader>
                          <TableRow style={{ background: t.headerBg }}>
                            {['Name', 'Company', 'Status', 'Email'].map(h => <TableHeaderCell key={h} style={{ ...H_CELL, color: t.textWeak }}>{h}</TableHeaderCell>)}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(childLeads[viewingCampaign.id] || []).map((l: any) => (
                            <TableRow key={l.id}>
                              <TableCell style={D_CELL}>{l.first_name} {l.last_name}</TableCell>
                              <TableCell style={D_CELL}>{l.company || '—'}</TableCell>
                              <TableCell style={D_CELL}><StatusPill status={(l.status || '').split(' - ').pop() || l.status} theme={theme} /></TableCell>
                              <TableCell style={D_CELL}>{l.email || '—'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                )}
              </DialogContent>
              <DialogActions>
                <Button appearance="secondary" onClick={() => setViewingCampaign(null)}>Close</Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      )}
      <SldsFooter theme={theme} />
    </div>
  );
}
