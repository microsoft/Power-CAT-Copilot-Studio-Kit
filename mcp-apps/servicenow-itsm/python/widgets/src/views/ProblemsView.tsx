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
  BugRegular,
  DismissRegular,
  EditRegular,
  EyeRegular,
  SaveRegular,
} from '@fluentui/react-icons';
import { FkHint, useMcpBridge } from '@gtc/mcp-shared';
import { PRIORITIES, PRIORITY_LABELS, PROBLEM_STATES } from '../constants';
import { FormSelect } from '../components/FormSelect';
import { NowFooter } from '../components/NowFooter';
import { PriorityPill, StatePill } from '../components/Pills';
import { ViewHeader } from '../components/ViewHeader';
import { useStyles } from '../styles';
import { now } from '../theme';
import type { Problem } from '../types';

export function ProblemsView({ items: initItems, callTool, toast, theme, cacheInfo: initCacheInfo }: {
  items: Problem[];
  callTool: (n: string, a?: any) => Promise<any>;
  toast: (m: string, t?: any) => void;
  theme: 'light' | 'dark';
  cacheInfo?: { hit: boolean; cached_at: string } | null;
}) {
  const styles = useStyles();
  const t = now(theme);
  const { isFullscreen } = useMcpBridge();
  const [localItems, setLocalItems] = useState<Problem[]>(initItems);
  const [cacheInfo, setCacheInfo] = useState(initCacheInfo);
  useEffect(() => { setLocalItems(initItems); setCacheInfo(initCacheInfo); }, [initItems]);
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await callTool('sn__get_problems', { refresh: true });
      setLocalItems(res?.items || []);
      setCacheInfo(res?._cache);
    } catch (e: any) { toast(e.message || 'Refresh failed', 'error'); }
    finally { setRefreshing(false); }
  };
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);
  const [editingRecord, setEditingRecord] = useState<Problem | null>(null);
  const [viewingRecord, setViewingRecord] = useState<Problem | null>(null);
  const [form, setForm] = useState({ short_description: '', description: '', priority: '3', state: '', assigned_to_name: '', workaround: '', work_note: '' });
  const colSpan = isFullscreen ? 6 : 4;

  const openCreate = () => { setEditingId(null); setEditingRecord(null); setCreating(true); setForm({ short_description: '', description: '', priority: '3', state: '', assigned_to_name: '', workaround: '', work_note: '' }); };
  const openEdit = (p: any) => { setCreating(false); setEditingId(p.sys_id); setEditingRecord(p); setForm({ short_description: p.short_description || '', description: p.description || '', priority: String(p.priority).charAt(0) || '3', state: p.state || '', assigned_to_name: '', workaround: p.workaround || '', work_note: '' }); };
  const cancel = () => { setEditingId(null); setEditingRecord(null); setCreating(false); };

  useEffect(() => {
    if (lastSavedId) { const x = setTimeout(() => setLastSavedId(null), 4800); return () => clearTimeout(x); }
  }, [lastSavedId]);

  const handleSave = async () => {
    if (!form.short_description.trim() && creating) { toast('Short Description is required', 'error'); return; }
    setSaving(true);
    try {
      let result: any;
      if (creating) {
        result = await callTool('sn__create_problem', form);
        if (result && result.type === 'alert') {
          toast(result.message || 'Cannot complete — please correct and retry.', 'info', 0);
          return;
        }
        toast('Problem created');
      } else {
        const { priority: _p, ...updateFields } = form;
        result = await callTool('sn__update_problem', { sys_id: editingId, ...updateFields });
        toast('Problem updated');
        setLastSavedId(editingId);
      }
      cancel();
      let refreshed = result;
      if (!refreshed?.items) { refreshed = await callTool('sn__get_problems', { refresh: true }); }
      if (refreshed?.items) { setLocalItems(refreshed.items); setCacheInfo(refreshed._cache); }
    } catch (e: any) { toast(e.message || 'Failed', 'error'); }
    finally { setSaving(false); }
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
            {creating ? 'New Problem' : `Edit Problem ${editingRecord?.number || ''}`}
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
              {creating ? (
                <Field label="Assigned to (type full name)" size="small">
                  <Input size="small" value={form.assigned_to_name} onChange={(_, d) => setForm(f => ({ ...f, assigned_to_name: d.value }))} placeholder="e.g. Alice Chen" />
                </Field>
              ) : (
                <>
                  <FormSelect label="State" value={form.state} options={PROBLEM_STATES} onChange={v => setForm(f => ({ ...f, state: v }))} theme={theme} />
                  <Field label="Assigned To" size="small">
                    <Input size="small" value={editingRecord?.assigned_to || '—'} disabled />
                  </Field>
                </>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px', marginTop: '12px' }}>
              <Field label="Workaround" size="small">
                <Input size="small" value={form.workaround} onChange={(_, d) => setForm(f => ({ ...f, workaround: d.value }))} placeholder="Optional workaround…" />
              </Field>
              {!creating && (
                <Field label="Work Note (appended to journal)" size="small">
                  <Input size="small" value={form.work_note} onChange={(_, d) => setForm(f => ({ ...f, work_note: d.value }))} placeholder="Optional internal note…" />
                </Field>
              )}
            </div>
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
      <ViewHeader icon={<BugRegular style={{ fontSize: '18px' }} />} title="Problems" count={localItems.length}
        brand={tokens.colorPaletteMagentaForeground2}
        cacheInfo={cacheInfo} onRefresh={handleRefresh} refreshing={refreshing} />

      <Table aria-label="Problems" size="small" style={{ borderCollapse: 'collapse' }}>
        <TableHeader>
          <TableRow style={{ background: t.headerBg }}>
            <TableHeaderCell style={headerCellStyle}>Number</TableHeaderCell>
            <TableHeaderCell style={headerCellStyle}>Short Description</TableHeaderCell>
            <TableHeaderCell style={headerCellStyle}>Priority</TableHeaderCell>
            <TableHeaderCell style={headerCellStyle}>State</TableHeaderCell>
            {isFullscreen && <TableHeaderCell style={headerCellStyle}>Assigned To</TableHeaderCell>}
            {isFullscreen && <TableHeaderCell style={{ ...headerCellStyle, width: 32 }} />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {localItems.length === 0 && (
            <TableRow><TableCell colSpan={colSpan} className={styles.empty}><Text>No problems found.</Text></TableCell></TableRow>
          )}
          {localItems.map((p, idx) => (
            <React.Fragment key={p.sys_id}>
              <TableRow className="snow-row"
                style={{
                  borderBottom: idx === localItems.length - 1 ? 'none' : `1px solid ${t.border}`,
                  ...(lastSavedId === p.sys_id ? { animation: 'snowRowFlash 4.5s ease-out' } : {}),
                }}>
                <TableCell style={cellStyle}><span style={{ fontFamily: 'monospace', fontWeight: 500, color: tokens.colorBrandForeground1 }}>{p.number}</span></TableCell>
                <TableCell style={{ ...cellStyle, maxWidth: '240px', whiteSpace: 'normal', wordBreak: 'break-word', overflow: 'visible', textOverflow: 'clip', lineHeight: 1.35 }}>{p.short_description || '—'}</TableCell>
                <TableCell style={cellStyle}><PriorityPill priority={p.priority} theme={theme} /></TableCell>
                <TableCell style={cellStyle}><StatePill state={p.state} theme={theme} /></TableCell>
                {isFullscreen && <TableCell style={cellStyle}>{p.assigned_to || '—'}</TableCell>}
                {isFullscreen && (
                  <TableCell style={cellStyle}>
                    <Button appearance="subtle" size="small" icon={<EyeRegular />} title="View" aria-label={`View ${p.number || 'details'}`} onClick={(e: React.MouseEvent) => { e.stopPropagation(); setViewingRecord(p); }} />
                  </TableCell>
                )}
              </TableRow>
            </React.Fragment>
          ))}
        </TableBody>
      </Table>

      <Dialog open={!!viewingRecord} onOpenChange={(_, d) => { if (!d.open) setViewingRecord(null); }}>
        <DialogSurface style={{ maxWidth: '640px', width: '90vw' }}>
          <DialogBody>
            <DialogTitle action={<Button appearance="subtle" icon={<DismissRegular />} aria-label="Close" onClick={() => setViewingRecord(null)} />}>
              Problem {viewingRecord?.number}
            </DialogTitle>
            <DialogContent>
              {viewingRecord && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <Text size={200} weight="semibold" style={{ color: tokens.colorNeutralForeground3, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Problem Statement</Text>
                    <Text block style={{ marginTop: '4px' }}>{viewingRecord.short_description || '—'}</Text>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <Text size={200} weight="semibold" style={{ color: tokens.colorNeutralForeground3, textTransform: 'uppercase' }}>Number</Text>
                      <Text block style={{ marginTop: '4px', fontFamily: 'monospace' }}>{viewingRecord.number || '—'}</Text>
                    </div>
                    <div>
                      <Text size={200} weight="semibold" style={{ color: tokens.colorNeutralForeground3, textTransform: 'uppercase' }}>Priority</Text>
                      <div style={{ marginTop: '4px' }}><PriorityPill priority={viewingRecord.priority} theme={theme} /></div>
                    </div>
                    <div>
                      <Text size={200} weight="semibold" style={{ color: tokens.colorNeutralForeground3, textTransform: 'uppercase' }}>State</Text>
                      <div style={{ marginTop: '4px' }}><StatePill state={viewingRecord.state} theme={theme} /></div>
                    </div>
                    <div>
                      <Text size={200} weight="semibold" style={{ color: tokens.colorNeutralForeground3, textTransform: 'uppercase' }}>Assigned To</Text>
                      <Text block style={{ marginTop: '4px' }}>{viewingRecord.assigned_to || '—'}</Text>
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
