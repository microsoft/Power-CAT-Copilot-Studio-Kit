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
  ArrowSwapRegular,
  ChevronDownRegular,
  ChevronRightRegular,
  ChevronUpRegular,
  DismissRegular,
  EditRegular,
  EyeRegular,
  SaveRegular,
  WrenchRegular,
} from '@fluentui/react-icons';
import { FkHint, useMcpBridge } from '@gtc/mcp-shared';
import {
  CHANGE_CATEGORIES,
  CHANGE_STATES,
  CHANGE_TYPES,
  CHANGE_TYPE_LABELS,
  PRIORITIES,
  PRIORITY_LABELS,
  RISK_LABELS,
  RISK_OPTIONS,
} from '../constants';
import { FormSelect } from '../components/FormSelect';
import { NowFooter } from '../components/NowFooter';
import { PriorityPill, RiskPill, StatePill } from '../components/Pills';
import { ViewHeader } from '../components/ViewHeader';
import { useStyles } from '../styles';
import { now } from '../theme';
import type { ChangeRequest, ChangeTask } from '../types';

// ── Change Tasks sub-table ──────────────────────────────────────────────────
function ChangeTasksTable({ items, theme }: { items: ChangeTask[]; theme: 'light' | 'dark' }) {
  const t = now(theme);
  const subHeaderStyle: React.CSSProperties = {
    fontWeight: 700, fontSize: '9px', textTransform: 'uppercase',
    letterSpacing: '0.5px', padding: '4px 8px', color: t.textWeak, background: 'transparent',
  };
  const subCellStyle: React.CSSProperties = {
    padding: '4px 8px', fontSize: '12px', verticalAlign: 'middle', borderBottom: `1px solid ${t.border}`,
  };
  if (items.length === 0) {
    return <div style={{ padding: '8px', color: t.textWeak, fontSize: '12px', fontStyle: 'italic' }}>No change tasks.</div>;
  }
  return (
    <div>
      <div style={{ fontSize: '12px', fontWeight: 600, color: t.text, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}><WrenchRegular style={{ fontSize: '14px' }} /> Change Tasks ({items.length})</div>
      <Table aria-label="Change tasks" size="small" style={{ borderCollapse: 'collapse' }}>
        <TableHeader>
          <TableRow>
            <TableHeaderCell style={subHeaderStyle}>Number</TableHeaderCell>
            <TableHeaderCell style={subHeaderStyle}>Short Description</TableHeaderCell>
            <TableHeaderCell style={subHeaderStyle}>State</TableHeaderCell>
            <TableHeaderCell style={subHeaderStyle}>Assigned To</TableHeaderCell>
            <TableHeaderCell style={subHeaderStyle}>Planned Start</TableHeaderCell>
            <TableHeaderCell style={subHeaderStyle}>Planned End</TableHeaderCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map(task => (
            <TableRow key={task.sys_id}>
              <TableCell style={subCellStyle}><span style={{ fontFamily: 'monospace', color: tokens.colorBrandForeground1, fontWeight: 500 }}>{task.number}</span></TableCell>
              <TableCell style={subCellStyle}>{task.short_description || '—'}</TableCell>
              <TableCell style={subCellStyle}><StatePill state={task.state} theme={theme} /></TableCell>
              <TableCell style={subCellStyle}>{task.assigned_to || '—'}</TableCell>
              <TableCell style={subCellStyle}>{task.planned_start || '—'}</TableCell>
              <TableCell style={subCellStyle}>{task.planned_end || '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Changes View ────────────────────────────────────────────────────────────
export function ChangesView({ items: initItems, callTool, toast, theme, cacheInfo: initCacheInfo }: {
  items: ChangeRequest[];
  callTool: (name: string, args?: Record<string, any>) => Promise<any>;
  toast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  theme: 'light' | 'dark';
  cacheInfo?: { hit: boolean; cached_at: string } | null;
}) {
  const styles = useStyles();
  const t = now(theme);
  const { isFullscreen } = useMcpBridge();
  const [localItems, setLocalItems] = useState<ChangeRequest[]>(initItems);
  const [cacheInfo, setCacheInfo] = useState(initCacheInfo);
  useEffect(() => { setLocalItems(initItems); setCacheInfo(initCacheInfo); }, [initItems]);
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await callTool('sn__get_change_requests', { refresh: true });
      setLocalItems(res?.items || []);
      setCacheInfo(res?._cache);
    } catch (e: any) { toast(e.message || 'Refresh failed', 'error'); }
    finally { setRefreshing(false); }
  };
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [changeTasks, setChangeTasks] = useState<Record<string, ChangeTask[]>>({});
  const [loadingTasks, setLoadingTasks] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);
  const [editingRecord, setEditingRecord] = useState<ChangeRequest | null>(null);
  const [viewingRecord, setViewingRecord] = useState<ChangeRequest | null>(null);
  // Form mirrors tool args. FK display name lives on editingRecord, not form.
  const [form, setForm] = useState({ short_description: '', description: '', category: 'Other', type: 'normal', risk: '4', priority: '3', state: '', assigned_to_name: '', planned_start_date: '', planned_end_date: '', work_note: '' });
  const colSpan = isFullscreen ? 11 : 5;

  const openCreate = () => { setEditingId(null); setEditingRecord(null); setCreating(true); setForm({ short_description: '', description: '', category: 'Other', type: 'normal', risk: '4', priority: '3', state: '', assigned_to_name: '', planned_start_date: '', planned_end_date: '', work_note: '' }); };
  const openEdit = (cr: any) => { setCreating(false); setEditingId(cr.sys_id); setEditingRecord(cr); setForm({ short_description: cr.short_description || '', description: cr.description || '', category: cr.category || 'Other', type: cr.type || 'normal', risk: cr.risk || '4', priority: String(cr.priority).charAt(0) || '3', state: cr.state || '', assigned_to_name: '', planned_start_date: cr.planned_start || '', planned_end_date: cr.planned_end || '', work_note: '' }); };
  const cancel = () => { setCreating(false); setEditingId(null); setEditingRecord(null); };

  const toggleExpand = async (id: string) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!changeTasks[id]) {
      setLoadingTasks(id);
      try {
        const result = await callTool('sn__get_change_tasks', { change_sys_id: id });
        setChangeTasks(prev => ({ ...prev, [id]: result?.items || [] }));
      } catch {
        setChangeTasks(prev => ({ ...prev, [id]: [] }));
      } finally {
        setLoadingTasks(null);
      }
    }
  };

  useEffect(() => {
    if (lastSavedId) { const x = setTimeout(() => setLastSavedId(null), 4800); return () => clearTimeout(x); }
  }, [lastSavedId]);

  const handleSave = async () => {
    if (!form.short_description.trim() && !editingId) { toast('Short Description is required', 'error'); return; }
    setSaving(true);
    try {
      let result: any;
      if (creating) {
        result = await callTool('sn__create_change_request', form);
        if (result && result.type === 'alert') {
          toast(result.message || 'Cannot complete — please correct and retry.', 'info', 0);
          return;
        }
        toast('Change Request created');
      } else {
        result = await callTool('sn__update_change_request', { sys_id: editingId, ...form });
        toast('Change Request updated');
        setLastSavedId(editingId);
      }
      cancel();
      // Use items from create/update response first; fall back to explicit refresh
      let refreshed = result;
      if (!refreshed?.items) { refreshed = await callTool('sn__get_change_requests', { refresh: true }); }
      if (refreshed?.items) { setLocalItems(refreshed.items); setCacheInfo(refreshed._cache); }
    } catch (e: any) {
      toast(e.message || 'Failed', 'error');
    } finally {
      setSaving(false);
    }
  };

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
            {creating ? 'New Change Request' : `Edit Change Request ${editingRecord?.number || ''}`}
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
              <FormSelect label="Category" value={form.category} options={CHANGE_CATEGORIES} onChange={v => setForm(f => ({ ...f, category: v }))} theme={theme} />
              <FormSelect label="Type" value={form.type} options={CHANGE_TYPES} labels={CHANGE_TYPE_LABELS} onChange={v => setForm(f => ({ ...f, type: v }))} theme={theme} />
              <FormSelect label="Risk" value={form.risk} options={RISK_OPTIONS} labels={RISK_LABELS} onChange={v => setForm(f => ({ ...f, risk: v }))} theme={theme} />
              <FormSelect label="Priority" value={form.priority} options={PRIORITIES} labels={PRIORITY_LABELS} onChange={v => setForm(f => ({ ...f, priority: v }))} theme={theme} disabled />
              <FormSelect label="State" value={form.state} options={CHANGE_STATES} onChange={v => setForm(f => ({ ...f, state: v }))} theme={theme} />
              {creating ? (
                <Field label="Assigned to (type full name)" size="small">
                  <Input size="small" value={form.assigned_to_name} onChange={(_, d) => setForm(f => ({ ...f, assigned_to_name: d.value }))} placeholder="e.g. Alice Chen" />
                </Field>
              ) : (
                <Field label="Assigned To" size="small">
                  <Input size="small" value={editingRecord?.assigned_to || '—'} disabled />
                </Field>
              )}
              <Field label="Planned Start (YYYY-MM-DD)" size="small">
                <Input size="small" value={form.planned_start_date} onChange={(_, d) => setForm(f => ({ ...f, planned_start_date: d.value }))} />
              </Field>
              <Field label="Planned End (YYYY-MM-DD)" size="small">
                <Input size="small" value={form.planned_end_date} onChange={(_, d) => setForm(f => ({ ...f, planned_end_date: d.value }))} />
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
                fields={[{ label: 'Assigned to (type full name)' }]}
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
      <ViewHeader icon={<ArrowSwapRegular style={{ fontSize: '18px' }} />} title="Change Requests" count={localItems.length}
        brand={tokens.colorPaletteMarigoldForeground2}
        cacheInfo={cacheInfo} onRefresh={handleRefresh} refreshing={refreshing} />

      <Table aria-label="Change requests" size="small" style={{ borderCollapse: 'collapse' }}>
        <TableHeader>
          <TableRow style={{ background: t.headerBg }}>
            {isFullscreen && <TableHeaderCell style={{ ...headerCellStyle, width: 28 }} />}
            <TableHeaderCell style={headerCellStyle}>Number</TableHeaderCell>
            <TableHeaderCell style={headerCellStyle}>Short Description</TableHeaderCell>
            <TableHeaderCell style={headerCellStyle}>State</TableHeaderCell>
            <TableHeaderCell style={headerCellStyle}>Priority</TableHeaderCell>
            <TableHeaderCell style={headerCellStyle}>Risk</TableHeaderCell>
            {isFullscreen && <TableHeaderCell style={headerCellStyle}>Category</TableHeaderCell>}
            {isFullscreen && <TableHeaderCell style={headerCellStyle}>Assigned To</TableHeaderCell>}
            {isFullscreen && <TableHeaderCell style={headerCellStyle}>Planned Start</TableHeaderCell>}
            {isFullscreen && <TableHeaderCell style={headerCellStyle}>Planned End</TableHeaderCell>}
            {isFullscreen && <TableHeaderCell style={{ ...headerCellStyle, width: 32 }} />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {localItems.length === 0 && (
            <TableRow><TableCell colSpan={colSpan} className={styles.empty}><Text>No change requests found.</Text></TableCell></TableRow>
          )}
          {localItems.map((cr, idx) => (
            <React.Fragment key={cr.sys_id}>
              <TableRow className="snow-row"
                onClick={() => { if (isFullscreen) toggleExpand(cr.sys_id); }}
                onKeyDown={(e) => {
                  if (isFullscreen && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    toggleExpand(cr.sys_id);
                  }
                }}
                tabIndex={0}
                role="row"
                aria-expanded={isFullscreen ? expandedId === cr.sys_id : undefined}
                style={{
                  cursor: isFullscreen ? 'pointer' : 'default',
                  borderBottom: idx === localItems.length - 1 && (!isFullscreen || expandedId !== cr.sys_id) ? 'none' : `1px solid ${t.border}`,
                  background: isFullscreen && expandedId === cr.sys_id ? (t.expandedBg) : 'transparent',
                  ...(lastSavedId === cr.sys_id ? { animation: 'snowRowFlash 4.5s ease-out' } : {}),
                }}>
                {isFullscreen && (
                  <TableCell style={{ ...cellStyle, width: 28 }}>
                    <span style={{ fontSize: '10px', color: t.textWeak, display: 'flex', alignItems: 'center' }}>{expandedId === cr.sys_id ? <ChevronDownRegular /> : <ChevronRightRegular />}</span>
                  </TableCell>
                )}
                <TableCell style={cellStyle}><span style={{ fontFamily: 'monospace', fontWeight: 500, color: tokens.colorBrandForeground1 }}>{cr.number}</span></TableCell>
                <TableCell style={{ ...cellStyle, maxWidth: '240px', whiteSpace: 'normal', wordBreak: 'break-word', overflow: 'visible', textOverflow: 'clip', lineHeight: 1.35 }}>{cr.short_description || '—'}</TableCell>
                <TableCell style={cellStyle}><StatePill state={cr.state} theme={theme} /></TableCell>
                <TableCell style={cellStyle}><PriorityPill priority={cr.priority} theme={theme} /></TableCell>
                <TableCell style={cellStyle}><RiskPill risk={cr.risk} theme={theme} /></TableCell>
                {isFullscreen && <TableCell style={cellStyle}>{cr.category || '—'}</TableCell>}
                {isFullscreen && <TableCell style={cellStyle}>{(cr as any).assigned_to || '—'}</TableCell>}
                {isFullscreen && <TableCell style={cellStyle}>{(cr as any).planned_start || '—'}</TableCell>}
                {isFullscreen && <TableCell style={cellStyle}>{(cr as any).planned_end || '—'}</TableCell>}
                {isFullscreen && (
                  <TableCell style={cellStyle}>
                    <Button appearance="subtle" size="small" icon={<EyeRegular />} title="View" aria-label={`View ${cr.number || 'details'}`} onClick={(e: React.MouseEvent) => { e.stopPropagation(); setViewingRecord(cr); }} />
                  </TableCell>
                )}
              </TableRow>
              {isFullscreen && expandedId === cr.sys_id && (
                <TableRow>
                  <TableCell colSpan={colSpan} style={{ padding: 0 }}>
                    <div className={styles.subTableWrap} style={{ background: t.expandedBg, borderBottom: `1px solid ${t.border}` }}>
                      {loadingTasks === cr.sys_id ? (
                        <div style={{ padding: '8px', color: t.textWeak, fontSize: '12px', fontStyle: 'italic' }}>Fetching change tasks…</div>
                      ) : (
                        <ChangeTasksTable items={changeTasks[cr.sys_id] || []} theme={theme} />
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
              Change Request {viewingRecord?.number}
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
                      <div style={{ marginTop: '4px' }}><StatePill state={viewingRecord.state} theme={theme} /></div>
                    </div>
                    <div>
                      <Text size={200} weight="semibold" style={{ color: tokens.colorNeutralForeground3, textTransform: 'uppercase' }}>Priority</Text>
                      <div style={{ marginTop: '4px' }}><PriorityPill priority={viewingRecord.priority} theme={theme} /></div>
                    </div>
                    <div>
                      <Text size={200} weight="semibold" style={{ color: tokens.colorNeutralForeground3, textTransform: 'uppercase' }}>Risk</Text>
                      <div style={{ marginTop: '4px' }}><RiskPill risk={viewingRecord.risk} theme={theme} /></div>
                    </div>
                    <div>
                      <Text size={200} weight="semibold" style={{ color: tokens.colorNeutralForeground3, textTransform: 'uppercase' }}>Category</Text>
                      <Text block style={{ marginTop: '4px' }}>{viewingRecord.category || '—'}</Text>
                    </div>
                    <div>
                      <Text size={200} weight="semibold" style={{ color: tokens.colorNeutralForeground3, textTransform: 'uppercase' }}>Assigned To</Text>
                      <Text block style={{ marginTop: '4px' }}>{(viewingRecord as any).assigned_to || '—'}</Text>
                    </div>
                    <div>
                      <Text size={200} weight="semibold" style={{ color: tokens.colorNeutralForeground3, textTransform: 'uppercase' }}>Planned Start</Text>
                      <Text block style={{ marginTop: '4px' }}>{(viewingRecord as any).planned_start || '—'}</Text>
                    </div>
                    <div>
                      <Text size={200} weight="semibold" style={{ color: tokens.colorNeutralForeground3, textTransform: 'uppercase' }}>Planned End</Text>
                      <Text block style={{ marginTop: '4px' }}>{(viewingRecord as any).planned_end || '—'}</Text>
                    </div>
                  </div>
                  {viewingRecord.description && (
                    <div>
                      <Text size={200} weight="semibold" style={{ color: tokens.colorNeutralForeground3, textTransform: 'uppercase' }}>Description</Text>
                      <Text block style={{ marginTop: '4px', fontSize: '12px', lineHeight: '1.5' }}>{viewingRecord.description}</Text>
                    </div>
                  )}
                  {Object.prototype.hasOwnProperty.call(changeTasks, viewingRecord.sys_id) && (
                    <ChangeTasksTable items={changeTasks[viewingRecord.sys_id] || []} theme={theme} />
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
