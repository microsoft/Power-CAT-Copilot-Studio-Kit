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
  AlertRegular,
  DismissRegular,
  EditRegular,
  EyeRegular,
  SaveRegular,
} from '@fluentui/react-icons';
import { FkHint, useMcpBridge } from '@gtc/mcp-shared';
import {
  CATEGORIES,
  FORM_IMPACTS,
  FORM_IMPACT_LABELS,
  INCIDENT_STATES,
  PRIORITIES,
  PRIORITY_LABELS,
} from '../constants';
import { FormSelect } from '../components/FormSelect';
import { NowFooter } from '../components/NowFooter';
import { PriorityPill, StatePill } from '../components/Pills';
import { ViewHeader } from '../components/ViewHeader';
import { useStyles } from '../styles';
import { now } from '../theme';
import type { Incident } from '../types';

// ── Incidents View ──────────────────────────────────────────────────────────
export function IncidentsView({ items: initItems, callTool, toast, theme, cacheInfo: initCacheInfo }: {
  items: Incident[];
  callTool: (name: string, args?: Record<string, any>) => Promise<any>;
  toast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  theme: 'light' | 'dark';
  cacheInfo?: { hit: boolean; cached_at: string } | null;
}) {
  const styles = useStyles();
  const t = now(theme);
  const { isFullscreen } = useMcpBridge();
  // localItems lets widget-initiated tool calls update the visible list. Pure
  // props-driven would discard widget callTool results (widgetCallDepth > 0
  // suppresses host-bridge toolData updates by design).
  const [localItems, setLocalItems] = useState<Incident[]>(initItems);
  const [cacheInfo, setCacheInfo] = useState(initCacheInfo);
  useEffect(() => { setLocalItems(initItems); setCacheInfo(initCacheInfo); }, [initItems]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingRecord, setEditingRecord] = useState<Incident | null>(null);
  const [viewingRecord, setViewingRecord] = useState<Incident | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await callTool('sn__get_incidents', { refresh: true });
      setLocalItems(res?.incidents || []);
      setCacheInfo(res?._cache);
    } catch (e: any) { toast(e.message || 'Refresh failed', 'error'); }
    finally { setRefreshing(false); }
  };
  // Form shape mirrors the tool args exactly. FK display names live on
  // `editingRecord`, not on `form`, so spreading `form` into create/update
  // never sends a display name through an FK slot.
  const [form, setForm] = useState({
    short_description: '', description: '', priority: '3', impact: '2', state: 'New', category: 'inquiry',
    assigned_to_name: '', caller_name: '', work_note: '',
  });

  const openEdit = (inc: any) => {
    setCreating(false);
    setEditingId(inc.sys_id);
    setEditingRecord(inc);
    setForm({
      short_description: inc.short_description || '',
      description: inc.description || '',
      priority: String(inc.priority).charAt(0) || '3',
      impact: String((inc as any).impact || '').charAt(0) || '2',
      state: inc.state || 'New',
      category: (inc.category || 'inquiry').toLowerCase(),
      assigned_to_name: '', caller_name: '',
      work_note: '',
    });
  };

  const openCreate = () => {
    setEditingId(null);
    setEditingRecord(null);
    setCreating(true);
    setForm({ short_description: '', description: '', priority: '3', impact: '2', state: 'New', category: 'inquiry', assigned_to_name: '', caller_name: '', work_note: '' });
  };

  const cancel = () => { setEditingId(null); setEditingRecord(null); setCreating(false); };

  const handleSave = async () => {
    setSaving(true);
    try {
      const result: any = creating
        ? await callTool('sn__create_incident', form)
        : await callTool('sn__update_incident', { sys_id: editingId, ...form });
      // Alert path — server returned a non-fatal FK lookup miss with
      // suggestions. Surface the message persistently and keep the form
      // open so the user can correct the assignee/caller and re-submit.
      if (result && result.type === 'alert') {
        toast(result.message || 'Cannot complete — please correct and retry.', 'info', 0);
        return;
      }
      toast(creating ? 'Incident created' : 'Incident updated');
      if (!creating) setLastSavedId(editingId);
      cancel();
      const refreshed = await callTool('sn__get_incidents', { refresh: true });
      if (refreshed?.incidents) { setLocalItems(refreshed.incidents); setCacheInfo(refreshed._cache); }
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
            {creating ? 'New Incident' : `Edit Incident ${editingRecord?.number || ''}`}
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
              <FormSelect label="Impact" value={form.impact} options={FORM_IMPACTS} labels={FORM_IMPACT_LABELS} onChange={v => setForm(f => ({ ...f, impact: v }))} theme={theme} />
              <FormSelect label="State" value={form.state} options={INCIDENT_STATES} onChange={v => setForm(f => ({ ...f, state: v }))} theme={theme} />
              <FormSelect label="Category" value={form.category} options={CATEGORIES} onChange={v => setForm(f => ({ ...f, category: v }))} theme={theme} />
              {creating ? (
                <>
                  <Field label="Assigned To (type full name)" size="small">
                    <Input size="small" value={form.assigned_to_name} onChange={(_, d) => setForm(f => ({ ...f, assigned_to_name: d.value }))} placeholder="e.g. Alice Chen" />
                  </Field>
                  <Field label="Caller (type full name)" size="small">
                    <Input size="small" value={form.caller_name} onChange={(_, d) => setForm(f => ({ ...f, caller_name: d.value }))} placeholder="e.g. Joe Smith" />
                  </Field>
                </>
              ) : (
                <>
                  <Field label="Assigned To" size="small">
                    <Input size="small" value={editingRecord?.assigned_to || '—'} disabled />
                  </Field>
                  <Field label="Caller" size="small">
                    <Input size="small" value={editingRecord?.caller_id || '—'} disabled />
                  </Field>
                </>
              )}
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
                fields={[
                  { label: 'Assigned To (type full name)' },
                  { label: 'Caller (type full name)' },
                ]}
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
      <ViewHeader icon={<AlertRegular style={{ fontSize: '18px' }} />} title="Incidents" count={localItems.length}
        brand={tokens.colorBrandForeground1}
        cacheInfo={cacheInfo} onRefresh={handleRefresh} refreshing={refreshing} />

      <Table aria-label="Incidents" size="small" style={{ borderCollapse: 'collapse' }}>
        <TableHeader>
          <TableRow style={{ background: t.headerBg }}>
            <TableHeaderCell style={headerCellStyle}>Number</TableHeaderCell>
            <TableHeaderCell style={headerCellStyle}>Short Description</TableHeaderCell>
            <TableHeaderCell style={headerCellStyle}>Priority</TableHeaderCell>
            <TableHeaderCell style={headerCellStyle}>State</TableHeaderCell>
            {isFullscreen && <TableHeaderCell style={headerCellStyle}>Category</TableHeaderCell>}
            <TableHeaderCell style={headerCellStyle}>Assigned To</TableHeaderCell>
            {isFullscreen && <TableHeaderCell style={headerCellStyle}>Caller</TableHeaderCell>}
            {isFullscreen && <TableHeaderCell style={{ ...headerCellStyle, width: 50 }} />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {localItems.length === 0 && (
            <TableRow>
              <TableCell colSpan={colSpan} className={styles.empty}>
                <Text>No incidents found.</Text>
              </TableCell>
            </TableRow>
          )}
          {localItems.map((inc, idx) => (
            <React.Fragment key={inc.sys_id}>
              <TableRow
                className="snow-row"
                style={{
                  borderBottom: idx === localItems.length - 1 ? 'none' : `1px solid ${t.border}`,
                  ...(lastSavedId === inc.sys_id ? { animation: 'snowRowFlash 4.5s ease-out' } : {}),
                }}
              >
                <TableCell style={cellStyle}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 500, color: tokens.colorBrandForeground1 }}>
                    {inc.number}
                  </span>
                </TableCell>
                <TableCell style={{ ...cellStyle, maxWidth: '240px', whiteSpace: 'normal', wordBreak: 'break-word', overflow: 'visible', textOverflow: 'clip', lineHeight: 1.35 }}>{inc.short_description || '—'}</TableCell>
                <TableCell style={cellStyle}><PriorityPill priority={inc.priority} theme={theme} /></TableCell>
                <TableCell style={cellStyle}><StatePill state={inc.state} theme={theme} /></TableCell>
                {isFullscreen && <TableCell style={cellStyle}>{(inc as any).category || '—'}</TableCell>}
                <TableCell style={cellStyle}>{inc.assigned_to || '—'}</TableCell>
                {isFullscreen && <TableCell style={cellStyle}>{(inc as any).caller_id || '—'}</TableCell>}
                {isFullscreen && (
                  <TableCell style={cellStyle}>
                    <Button appearance="subtle" size="small" icon={<EyeRegular />} title="View" aria-label={`View ${inc.number || 'details'}`} onClick={(e: React.MouseEvent) => { e.stopPropagation(); setViewingRecord(inc); }} />
                  </TableCell>
                )}
              </TableRow>
            </React.Fragment>
          ))}
        </TableBody>
      </Table>

      {/* View Dialog */}
      <Dialog open={!!viewingRecord} onOpenChange={(_, d) => { if (!d.open) setViewingRecord(null); }}>
        <DialogSurface style={{ maxWidth: '640px', width: '90vw' }}>
          <DialogBody>
            <DialogTitle action={<Button appearance="subtle" icon={<DismissRegular />} aria-label="Close" onClick={() => setViewingRecord(null)} />}>
              Incident {viewingRecord?.number}
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
                      <Text size={200} weight="semibold" style={{ color: tokens.colorNeutralForeground3, textTransform: 'uppercase' }}>Priority</Text>
                      <div style={{ marginTop: '4px' }}><PriorityPill priority={viewingRecord.priority} theme={theme} /></div>
                    </div>
                    <div>
                      <Text size={200} weight="semibold" style={{ color: tokens.colorNeutralForeground3, textTransform: 'uppercase' }}>State</Text>
                      <div style={{ marginTop: '4px' }}><StatePill state={viewingRecord.state} theme={theme} /></div>
                    </div>
                    <div>
                      <Text size={200} weight="semibold" style={{ color: tokens.colorNeutralForeground3, textTransform: 'uppercase' }}>Category</Text>
                      <Text block style={{ marginTop: '4px' }}>{(viewingRecord as any).category || '—'}</Text>
                    </div>
                    <div>
                      <Text size={200} weight="semibold" style={{ color: tokens.colorNeutralForeground3, textTransform: 'uppercase' }}>Assigned To</Text>
                      <Text block style={{ marginTop: '4px' }}>{viewingRecord.assigned_to || '—'}</Text>
                    </div>
                    <div>
                      <Text size={200} weight="semibold" style={{ color: tokens.colorNeutralForeground3, textTransform: 'uppercase' }}>Caller</Text>
                      <Text block style={{ marginTop: '4px' }}>{(viewingRecord as any).caller_id || '—'}</Text>
                    </div>
                  </div>
                  {viewingRecord.description && (
                    <div>
                      <Text size={200} weight="semibold" style={{ color: tokens.colorNeutralForeground3, textTransform: 'uppercase' }}>Description</Text>
                      <Text block style={{ marginTop: '4px', fontSize: '12px', lineHeight: '1.5' }}>{viewingRecord.description}</Text>
                    </div>
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
