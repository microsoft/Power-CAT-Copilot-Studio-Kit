import React, { useEffect, useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  tokens,
} from '@fluentui/react-components';
import {
  AddRegular,
  ChevronDownRegular,
  ChevronRightRegular,
  ChevronUpRegular,
  DismissRegular,
  DocumentBulletListRegular,
  EditRegular,
  EyeRegular,
  SaveRegular,
} from '@fluentui/react-icons';
import { FkHint, useMcpBridge } from '@gtc/mcp-shared';
import { APPROVAL_OPTIONS, PRIORITIES, PRIORITY_LABELS } from '../constants';
import { FormSelect } from '../components/FormSelect';
import { NowFooter } from '../components/NowFooter';
import { ApprovalPill, PriorityPill, StatePill } from '../components/Pills';
import { ViewHeader } from '../components/ViewHeader';
import { useStyles } from '../styles';
import { now } from '../theme';
import type { RequestItem, ServiceRequest } from '../types';

// ── Request Items sub-table ─────────────────────────────────────────────────
function RequestItemsTable({ items, callTool, toast, theme, editable = false }: {
  items: RequestItem[];
  callTool: (name: string, args?: Record<string, any>) => Promise<any>;
  toast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  theme: 'light' | 'dark';
  editable?: boolean;
}) {
  const t = now(theme);
  const [editingQty, setEditingQty] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const saveQty = async (item: RequestItem) => {
    const qty = editingQty[item.sys_id] ?? String(item.quantity);
    setSavingId(item.sys_id);
    try {
      await callTool('sn__update_request_item', { sys_id: item.sys_id, quantity: qty });
      toast('Quantity updated');
    } catch (e: any) {
      toast(e.message || 'Failed to update quantity', 'error');
    } finally {
      setSavingId(null);
    }
  };

  const subHeaderStyle: React.CSSProperties = {
    fontWeight: 700, fontSize: '9px', textTransform: 'uppercase',
    letterSpacing: '0.5px', padding: '4px 8px', color: t.textWeak,
    background: 'transparent',
  };
  const subCellStyle: React.CSSProperties = {
    padding: '4px 8px', fontSize: '12px', verticalAlign: 'middle',
    borderBottom: `1px solid ${t.border}`,
  };

  if (items.length === 0) {
    return <div style={{ padding: '8px', color: t.textWeak, fontSize: '12px', fontStyle: 'italic' }}>No request items.</div>;
  }

  return (
    <div>
      <div style={{ fontSize: '12px', fontWeight: 600, color: t.text, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <DocumentBulletListRegular style={{ fontSize: '14px' }} /> Request Items ({items.length})
      </div>
      <Table aria-label="Request items" size="small" style={{ borderCollapse: 'collapse' }}>
        <TableHeader>
          <TableRow>
            <TableHeaderCell style={subHeaderStyle}>Short Description</TableHeaderCell>
            <TableHeaderCell style={subHeaderStyle}>Item</TableHeaderCell>
            <TableHeaderCell style={subHeaderStyle}>Qty</TableHeaderCell>
            <TableHeaderCell style={subHeaderStyle}>Stage</TableHeaderCell>
            <TableHeaderCell style={subHeaderStyle}>Price</TableHeaderCell>
            {editable && <TableHeaderCell style={{ ...subHeaderStyle, width: 60 }} />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.sys_id}>
              <TableCell style={subCellStyle}>{item.short_description || '—'}</TableCell>
              <TableCell style={subCellStyle}>{item.cat_item || '—'}</TableCell>
              <TableCell style={subCellStyle}>
                {editable ? (
                  <input
                    type="number"
                    min="1"
                    aria-label={`Quantity for ${item.short_description || item.name || 'item'}`}
                    value={editingQty[item.sys_id] ?? String(item.quantity || 1)}
                    onChange={(e) => setEditingQty(prev => ({ ...prev, [item.sys_id]: e.target.value }))}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      width: '56px', padding: '3px 6px', borderRadius: '4px',
                      border: `1px solid ${t.border}`, background: t.surface,
                      color: t.text, fontSize: '12px', textAlign: 'center',
                      fontFamily: 'inherit',
                    }}
                  />
                ) : (
                  String(item.quantity || 1)
                )}
              </TableCell>
              <TableCell style={subCellStyle}>{item.stage || '—'}</TableCell>
              <TableCell style={subCellStyle}>{item.price || '—'}</TableCell>
              {editable && (
                <TableCell style={subCellStyle}>
                  <Button appearance="primary" size="small" icon={<SaveRegular />}
                    onClick={(e: React.MouseEvent) => { e.stopPropagation(); saveQty(item); }}
                    disabled={savingId === item.sys_id}
                    style={{ minWidth: 0, padding: '0 8px', height: '26px' }}>
                    {savingId === item.sys_id ? '…' : 'Save'}
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Requests View ───────────────────────────────────────────────────────────
export function RequestsView({ items: initItems, callTool, toast, theme, cacheInfo: initCacheInfo }: {
  items: ServiceRequest[];
  callTool: (name: string, args?: Record<string, any>) => Promise<any>;
  toast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  theme: 'light' | 'dark';
  cacheInfo?: { hit: boolean; cached_at: string } | null;
}) {
  const styles = useStyles();
  const t = now(theme);
  const { isFullscreen } = useMcpBridge();
  const [localItems, setLocalItems] = useState<ServiceRequest[]>(initItems);
  const [cacheInfo, setCacheInfo] = useState(initCacheInfo);
  useEffect(() => { setLocalItems(initItems); setCacheInfo(initCacheInfo); }, [initItems]);
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await callTool('sn__get_requests', { refresh: true });
      setLocalItems(res?.requests || []);
      setCacheInfo(res?._cache);
    } catch (e: any) { toast(e.message || 'Refresh failed', 'error'); }
    finally { setRefreshing(false); }
  };
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reqItems, setReqItems] = useState<Record<string, RequestItem[]>>({});
  const [loadingItems, setLoadingItems] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingRecord, setEditingRecord] = useState<ServiceRequest | null>(null);
  const [viewingRecord, setViewingRecord] = useState<ServiceRequest | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);
  // Form mirrors tool args. FK display name lives on editingRecord, not form.
  const [form, setForm] = useState({
    short_description: '', description: '', priority: '3', approval: 'not requested',
    request_state: '', requested_for_name: '', due_date: '', work_note: '',
  });

  const toggleExpand = async (req: ServiceRequest) => {
    if (expandedId === req.sys_id) { setExpandedId(null); return; }
    setExpandedId(req.sys_id);
    if (!reqItems[req.sys_id]) {
      setLoadingItems(req.sys_id);
      try {
        const result = await callTool('sn__get_request_items', { request_sys_id: req.sys_id });
        setReqItems(prev => ({ ...prev, [req.sys_id]: result?.items || [] }));
      } catch {
        setReqItems(prev => ({ ...prev, [req.sys_id]: [] }));
      } finally {
        setLoadingItems(null);
      }
    }
  };

  const openEdit = (req: any) => {
    setCreating(false);
    setEditingId(req.sys_id);
    setEditingRecord(req);
    setForm({
      short_description: req.short_description || '',
      description: req.description || '',
      priority: String(req.priority).charAt(0) || '3',
      approval: (req.approval || 'not requested').toLowerCase(),
      request_state: req.request_state || '',
      requested_for_name: '',
      due_date: req.due_date || '',
      work_note: '',
    });
  };

  const openCreate = () => {
    setEditingId(null);
    setEditingRecord(null);
    setCreating(true);
    setForm({ short_description: '', description: '', priority: '3', approval: 'not requested', request_state: '', requested_for_name: '', due_date: '', work_note: '' });
  };

  const cancel = () => { setEditingId(null); setEditingRecord(null); setCreating(false); };

  const handleSave = async () => {
    setSaving(true);
    try {
      let result: any;
      if (creating) {
        result = await callTool('sn__create_request', form);
        if (result && result.type === 'alert') {
          toast(result.message || 'Cannot complete — please correct and retry.', 'info', 0);
          return;
        }
        toast('Request created');
      } else {
        await callTool('sn__update_request', { sys_id: editingId, ...form });
        toast('Request updated');
        setLastSavedId(editingId);
      }
      cancel();
      const refreshed = await callTool('sn__get_requests', { refresh: true });
      if (refreshed?.requests) { setLocalItems(refreshed.requests); setCacheInfo(refreshed._cache); }
    } catch (e: any) { toast(e.message || 'Failed', 'error'); }
    finally { setSaving(false); }
  };

  useEffect(() => {
    if (lastSavedId) {
      const t2 = setTimeout(() => setLastSavedId(null), 4800);
      return () => clearTimeout(t2);
    }
  }, [lastSavedId]);

  const colSpan = isFullscreen ? 8 : 5;

  const cellStyle: React.CSSProperties = {
    padding: '8px 12px', fontSize: '13px', whiteSpace: 'nowrap',
    maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis',
  };
  const headerCellStyle: React.CSSProperties = {
    fontWeight: 700, fontSize: '11px', textTransform: 'uppercase',
    letterSpacing: '0.5px', padding: '8px 12px', color: t.textWeak,
  };

  const renderEditDialog = () => (
    <Dialog open={editingId !== null || creating} onOpenChange={(_, data) => { if (!data.open) cancel(); }}>
      <DialogSurface style={{ maxWidth: '560px', width: '90vw', padding: '24px' }}>
        <DialogBody>
          <DialogTitle style={{ fontSize: '16px', fontWeight: 600 }}>
            {creating ? 'New Request' : `Edit Request ${editingRecord?.number || ''}`}
          </DialogTitle>
          <DialogContent style={{ paddingTop: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
              <Field label="Short Description" size="small">
                <Input size="small" value={form.short_description} onChange={(_, d) => setForm(f => ({ ...f, short_description: d.value }))} />
              </Field>
              <Field label="Description" size="small">
                <Input size="small" value={form.description} onChange={(_, d) => setForm(f => ({ ...f, description: d.value }))} />
              </Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px 16px', marginTop: '12px' }}>
              <FormSelect label="Priority" value={form.priority} options={PRIORITIES} labels={PRIORITY_LABELS} onChange={v => setForm(f => ({ ...f, priority: v }))} theme={theme} disabled />
              {!creating && (
                <>
                  <FormSelect label="Approval" value={form.approval} options={APPROVAL_OPTIONS} onChange={v => setForm(f => ({ ...f, approval: v }))} theme={theme} />
                  <Field label="Request State" size="small">
                    <Input size="small" value={form.request_state} onChange={(_, d) => setForm(f => ({ ...f, request_state: d.value }))} />
                  </Field>
                </>
              )}
              {creating ? (
                <Field label="Requested for (type full name)" size="small">
                  <Input size="small" value={form.requested_for_name} onChange={(_, d) => setForm(f => ({ ...f, requested_for_name: d.value }))} placeholder="e.g. Joe Smith" />
                </Field>
              ) : (
                <Field label="Requested For" size="small">
                  <Input size="small" value={editingRecord?.requested_for || '—'} disabled />
                </Field>
              )}
              <Field label="Due Date (YYYY-MM-DD)" size="small">
                <Input size="small" value={form.due_date} onChange={(_, d) => setForm(f => ({ ...f, due_date: d.value }))} />
              </Field>
            </div>
            {!creating && (
              <div style={{ marginTop: '12px' }}>
                <Field label="Work Note (appended to journal)" size="small">
                  <Input size="small" value={form.work_note} onChange={(_, d) => setForm(f => ({ ...f, work_note: d.value }))} placeholder="Optional internal note…" />
                </Field>
              </div>
            )}
            {creating && (
              <FkHint
                fields={[{ label: 'Requested for (type full name)' }]}
                systemName="ServiceNow"
              />
            )}
          </DialogContent>
          <DialogActions style={{ paddingTop: '16px' }}>
            <Button appearance="secondary" onClick={cancel} disabled={saving}>Cancel</Button>
            <Button appearance="primary" onClick={handleSave} disabled={saving}
              icon={creating ? <AddRegular /> : <SaveRegular />}>
              {saving ? 'Saving…' : creating ? 'Create' : 'Save'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );

  return (
    <div className={styles.card} style={{ border: `1px solid ${t.border}`, background: t.surface }}>
      <ViewHeader icon={<DocumentBulletListRegular style={{ fontSize: '18px' }} />} title="Service Requests" count={localItems.length}
        brand={tokens.colorPaletteCornflowerForeground2}
        cacheInfo={cacheInfo} onRefresh={handleRefresh} refreshing={refreshing} />

      <Table aria-label="Service requests" size="small" style={{ borderCollapse: 'collapse' }}>
        <TableHeader>
          <TableRow style={{ background: t.headerBg }}>
            <TableHeaderCell style={headerCellStyle}>Number</TableHeaderCell>
            <TableHeaderCell style={headerCellStyle}>Short Description</TableHeaderCell>
            <TableHeaderCell style={headerCellStyle}>State</TableHeaderCell>
            <TableHeaderCell style={headerCellStyle}>Priority</TableHeaderCell>
            {isFullscreen && <TableHeaderCell style={headerCellStyle}>Approval</TableHeaderCell>}
            {isFullscreen && <TableHeaderCell style={headerCellStyle}>Requested For</TableHeaderCell>}
            <TableHeaderCell style={headerCellStyle}>Due Date</TableHeaderCell>
            {isFullscreen && <TableHeaderCell style={{ ...headerCellStyle, width: 50 }} />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {localItems.length === 0 && (
            <TableRow>
              <TableCell colSpan={colSpan} className={styles.empty}>
                <Text>No requests found.</Text>
              </TableCell>
            </TableRow>
          )}
          {localItems.map((req, idx) => (
            <React.Fragment key={req.sys_id}>
              <TableRow
                className="snow-row"
                onClick={() => { if (isFullscreen) toggleExpand(req); }}
                onKeyDown={(e) => {
                  if (isFullscreen && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    toggleExpand(req);
                  }
                }}
                tabIndex={0}
                role="row"
                aria-expanded={isFullscreen ? expandedId === req.sys_id : undefined}
                style={{
                  cursor: isFullscreen ? 'pointer' : 'default',
                  borderBottom: idx === localItems.length - 1 && (!isFullscreen || expandedId !== req.sys_id) ? 'none' : `1px solid ${t.border}`,
                  background: isFullscreen && expandedId === req.sys_id ? (t.expandedBg) : 'transparent',
                  ...(lastSavedId === req.sys_id ? { animation: 'snowRowFlash 4.5s ease-out' } : {}),
                }}
              >
                <TableCell style={cellStyle}>
                  <span style={{ fontWeight: 500, color: tokens.colorBrandForeground1, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {isFullscreen && <span style={{ fontSize: '12px', color: t.textWeak, display: 'flex' }}>{expandedId === req.sys_id ? <ChevronDownRegular /> : <ChevronRightRegular />}</span>}{req.number}
                  </span>
                </TableCell>
                <TableCell style={{ ...cellStyle, maxWidth: '240px', whiteSpace: 'normal', wordBreak: 'break-word', overflow: 'visible', textOverflow: 'clip', lineHeight: 1.35 }}>{req.short_description || '—'}</TableCell>
                <TableCell style={cellStyle}><StatePill state={req.request_state} theme={theme} /></TableCell>
                <TableCell style={cellStyle}><PriorityPill priority={req.priority} theme={theme} /></TableCell>
                {isFullscreen && <TableCell style={cellStyle}><ApprovalPill approval={req.approval} theme={theme} /></TableCell>}
                {isFullscreen && <TableCell style={cellStyle}>{(req as any).requested_for || '—'}</TableCell>}
                <TableCell style={cellStyle}>{(req as any).due_date || '—'}</TableCell>
                {isFullscreen && (
                  <TableCell style={cellStyle}>
                    <Button appearance="subtle" size="small" icon={<EyeRegular />} title="View" aria-label={`View ${req.number || 'details'}`} onClick={(e: React.MouseEvent) => { e.stopPropagation(); setViewingRecord(req); }} />
                  </TableCell>
                )}
              </TableRow>
              {isFullscreen && expandedId === req.sys_id && (
                <TableRow>
                  <TableCell colSpan={colSpan} style={{ padding: 0 }}>
                    <div className={styles.subTableWrap} style={{
                      background: t.expandedBg,
                      borderBottom: `1px solid ${t.border}`,
                    }}>
                      {loadingItems === req.sys_id ? (
                        <div style={{ padding: '8px', color: t.textWeak, fontSize: '12px', fontStyle: 'italic' }}>
                          Fetching request items…
                        </div>
                      ) : (
                        <RequestItemsTable items={reqItems[req.sys_id] || []} callTool={callTool} toast={toast} theme={theme} />
                      )}
                      <Button appearance="subtle" size="small" icon={<ChevronUpRegular style={{ fontSize: '12px' }} />} onClick={() => setExpandedId(null)} style={{ marginTop: '8px' }}>
                        Collapse
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </React.Fragment>
          ))}
        </TableBody>
      </Table>

      <Dialog open={!!viewingRecord} onOpenChange={(_, d) => { if (!d.open) setViewingRecord(null); }}>
        <DialogSurface style={{ maxWidth: '640px', width: '90vw' }}>
          <DialogBody>
            <DialogTitle action={<Button appearance="subtle" icon={<DismissRegular />} aria-label="Close" onClick={() => setViewingRecord(null)} />}>
              Request {viewingRecord?.number}
            </DialogTitle>
            <DialogContent>
              {viewingRecord && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <Text size={200} weight="semibold" style={{ color: tokens.colorNeutralForeground3, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Short Description</Text>
                    <Text block style={{ marginTop: '4px' }}>{viewingRecord.short_description || '—'}</Text>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <Text size={200} weight="semibold" style={{ color: tokens.colorNeutralForeground3, textTransform: 'uppercase' }}>Number</Text>
                      <Text block style={{ marginTop: '4px', fontFamily: 'monospace' }}>{viewingRecord.number || '—'}</Text>
                    </div>
                    <div>
                      <Text size={200} weight="semibold" style={{ color: tokens.colorNeutralForeground3, textTransform: 'uppercase' }}>State</Text>
                      <div style={{ marginTop: '4px' }}><StatePill state={viewingRecord.request_state} theme={theme} /></div>
                    </div>
                    <div>
                      <Text size={200} weight="semibold" style={{ color: tokens.colorNeutralForeground3, textTransform: 'uppercase' }}>Priority</Text>
                      <div style={{ marginTop: '4px' }}><PriorityPill priority={viewingRecord.priority} theme={theme} /></div>
                    </div>
                    <div>
                      <Text size={200} weight="semibold" style={{ color: tokens.colorNeutralForeground3, textTransform: 'uppercase' }}>Approval</Text>
                      <div style={{ marginTop: '4px' }}><ApprovalPill approval={viewingRecord.approval} theme={theme} /></div>
                    </div>
                    <div>
                      <Text size={200} weight="semibold" style={{ color: tokens.colorNeutralForeground3, textTransform: 'uppercase' }}>Requested For</Text>
                      <Text block style={{ marginTop: '4px' }}>{(viewingRecord as any).requested_for || '—'}</Text>
                    </div>
                    <div>
                      <Text size={200} weight="semibold" style={{ color: tokens.colorNeutralForeground3, textTransform: 'uppercase' }}>Due Date</Text>
                      <Text block style={{ marginTop: '4px' }}>{viewingRecord.due_date || '—'}</Text>
                    </div>
                  </div>
                  {viewingRecord.description && (
                    <div>
                      <Text size={200} weight="semibold" style={{ color: tokens.colorNeutralForeground3, textTransform: 'uppercase' }}>Description</Text>
                      <Text block style={{ marginTop: '4px', fontSize: '12px', lineHeight: '1.5' }}>{viewingRecord.description}</Text>
                    </div>
                  )}
                  {Object.prototype.hasOwnProperty.call(reqItems, viewingRecord.sys_id) && (
                    <RequestItemsTable items={reqItems[viewingRecord.sys_id] || []} callTool={callTool} toast={toast} theme={theme} editable />
                  )}
                </div>
              )}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setViewingRecord(null)}>Close</Button>
              <Button appearance="primary" icon={<EditRegular />} onClick={() => { if (viewingRecord) { openEdit(viewingRecord); setViewingRecord(null); } }}>Edit</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {renderEditDialog()}

      <NowFooter theme={theme} />
    </div>
  );
}
