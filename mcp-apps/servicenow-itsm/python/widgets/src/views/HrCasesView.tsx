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
  DismissRegular,
  EditRegular,
  EyeRegular,
  PersonRegular,
  SaveRegular,
} from '@fluentui/react-icons';
import { FkHint, useMcpBridge } from '@gtc/mcp-shared';
import { HR_PRIORITY_LABELS, HR_STATES } from '../constants';
import { FormSelect } from '../components/FormSelect';
import { NowFooter } from '../components/NowFooter';
import { PriorityPill, StatePill } from '../components/Pills';
import { ViewHeader } from '../components/ViewHeader';
import { useStyles } from '../styles';
import { now } from '../theme';

export function HrCasesView({ items: initItems, callTool, toast, theme, cacheInfo: initCacheInfo }: {
  items: any[]; callTool: (n: string, a?: any) => Promise<any>;
  toast: (m: string, t?: any) => void; theme: 'light' | 'dark';
  cacheInfo?: { hit: boolean; cached_at: string } | null;
}) {
  const styles = useStyles(); const t = now(theme);
  const { isFullscreen } = useMcpBridge();
  const [localItems, setLocalItems] = useState<any[]>(initItems);
  const [cacheInfo, setCacheInfo] = useState(initCacheInfo);
  useEffect(() => { setLocalItems(initItems); setCacheInfo(initCacheInfo); }, [initItems]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await callTool('sn__get_hr_cases', { refresh: true });
      setLocalItems(res?.items || []);
      setCacheInfo(res?._cache);
    } catch (e: any) { toast(e.message || 'Refresh failed', 'error'); }
    finally { setRefreshing(false); }
  };
  const [editingRecord, setEditingRecord] = useState<any | null>(null);
  const [viewingRecord, setViewingRecord] = useState<any | null>(null);
  const [form, setForm] = useState({ subject: '', description: '', priority: '3', state: 'Draft', work_note: '', opened_for_name: '', assigned_to_name: '', hr_service_name: '' });
  const colSpan = isFullscreen ? 6 : 4;

  const openEdit = (c: any) => { setCreating(false); setEditingId(c.sys_id); setEditingRecord(c); setForm({ subject: c.subject || '', description: c.description || '', priority: String(c.priority).charAt(0) || '3', state: c.state || 'Draft', work_note: '', opened_for_name: '', assigned_to_name: '', hr_service_name: '' }); };
  const openCreate = () => { setEditingId(null); setEditingRecord(null); setCreating(true); setForm({ subject: '', description: '', priority: '3', state: 'Draft', work_note: '', opened_for_name: '', assigned_to_name: '', hr_service_name: '' }); };
  const cancel = () => { setEditingId(null); setEditingRecord(null); setCreating(false); };

  const handleSave = async () => {
    setSaving(true);
    try {
      let result: any;
      if (creating) {
        result = await callTool('sn__create_hr_case', form);
        if (result && result.type === 'alert') {
          toast(result.message || 'Cannot complete — please correct and retry.', 'info', 0);
          return;
        }
        toast('HR Case created');
      } else {
        await callTool('sn__update_hr_case', { sys_id: editingId, ...form });
        toast('HR Case updated');
      }
      cancel();
      const refreshed = await callTool('sn__get_hr_cases', { refresh: true });
      if (refreshed?.items) { setLocalItems(refreshed.items); setCacheInfo(refreshed._cache); }
    } catch (e: any) { toast(e.message || 'Failed', 'error'); }
    finally { setSaving(false); }
  };

  const cellS: React.CSSProperties = { padding: '8px 12px', fontSize: '13px', whiteSpace: 'nowrap', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' };
  const hdS: React.CSSProperties = { fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', padding: '8px 12px', color: t.textWeak };

  const renderEditDialog = () => (
    <Dialog open={editingId !== null || creating} onOpenChange={(_, data) => { if (!data.open) cancel(); }}>
      <DialogSurface style={{ maxWidth: '560px', width: '90vw', padding: '24px' }}>
        <DialogBody>
          <DialogTitle style={{ fontSize: '16px', fontWeight: 600 }}>
            {creating ? 'New HR Case' : `Edit HR Case ${editingRecord?.number || ''}`}
          </DialogTitle>
          <DialogContent style={{ paddingTop: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
              <Field label="Subject" size="small">
                <Input size="small" value={form.subject} onChange={(_, d) => setForm(f => ({ ...f, subject: d.value }))} />
              </Field>
              <Field label="Description" size="small">
                <Input size="small" value={form.description} onChange={(_, d) => setForm(f => ({ ...f, description: d.value }))} />
              </Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px 16px', marginTop: '12px' }}>
              <FormSelect label="Priority" value={form.priority} options={['1', '2', '3', '4']} labels={HR_PRIORITY_LABELS} onChange={v => setForm(f => ({ ...f, priority: v }))} theme={theme} disabled />
              {!creating && (
                <FormSelect label="State" value={form.state} options={HR_STATES} onChange={v => setForm(f => ({ ...f, state: v }))} theme={theme} />
              )}
              {creating ? (
                <>
                  <Field label="Opened for (type full name)" size="small">
                    <Input size="small" value={form.opened_for_name} onChange={(_, d) => setForm(f => ({ ...f, opened_for_name: d.value }))} placeholder="e.g. Joe Smith" />
                  </Field>
                  <Field label="Assigned to (type full name)" size="small">
                    <Input size="small" value={form.assigned_to_name} onChange={(_, d) => setForm(f => ({ ...f, assigned_to_name: d.value }))} placeholder="e.g. Alice Chen" />
                  </Field>
                  <Field label="HR Service (type full name)" size="small">
                    <Input size="small" value={form.hr_service_name} onChange={(_, d) => setForm(f => ({ ...f, hr_service_name: d.value }))} placeholder="e.g. VPN Access" />
                  </Field>
                </>
              ) : (
                <>
                  <Field label="Opened for" size="small">
                    <Input size="small" value={editingRecord?.opened_for || '—'} disabled />
                  </Field>
                  <Field label="Assigned to" size="small">
                    <Input size="small" value={editingRecord?.assigned_to || '—'} disabled />
                  </Field>
                  <Field label="HR Service" size="small">
                    <Input size="small" value={editingRecord?.hr_service || '—'} disabled />
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
                  { label: 'Opened for (type full name)' },
                  { label: 'Assigned to (type full name)' },
                  { label: 'HR Service (type full name)' },
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
      <ViewHeader icon={<PersonRegular style={{ fontSize: '18px' }} />} title="HR Cases" count={localItems.length}
        brand={tokens.colorPaletteLavenderForeground2}
        cacheInfo={cacheInfo} onRefresh={handleRefresh} refreshing={refreshing} />
      <Table aria-label="HR cases" size="small" style={{ borderCollapse: 'collapse' }}>
        <TableHeader>
          <TableRow style={{ background: t.headerBg }}>
            <TableHeaderCell style={hdS}>Number</TableHeaderCell>
            <TableHeaderCell style={hdS}>Subject</TableHeaderCell>
            {isFullscreen && <TableHeaderCell style={hdS}>Opened For</TableHeaderCell>}
            <TableHeaderCell style={hdS}>Priority</TableHeaderCell>
            <TableHeaderCell style={hdS}>State</TableHeaderCell>
            {isFullscreen && <TableHeaderCell style={{ ...hdS, width: 40 }} />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {localItems.length === 0 && <TableRow><TableCell colSpan={colSpan} style={{ padding: 24, textAlign: 'center', color: t.textWeak, fontSize: '13px' }}>No HR cases found.</TableCell></TableRow>}
          {localItems.map((c: any) => {
            const pk = String(c.priority).charAt(0);
            return (
              <React.Fragment key={c.sys_id}>
                <TableRow className="snow-row" style={{ borderBottom: `1px solid ${t.border}` }}>
                  <TableCell style={{ ...cellS, fontFamily: 'monospace', color: '#1B7A6E', fontWeight: 600 }}>{c.number}</TableCell>
                  <TableCell style={{ ...cellS, maxWidth: 300, whiteSpace: 'normal', wordBreak: 'break-word', overflow: 'visible', textOverflow: 'clip', lineHeight: 1.35 }}>{c.subject || '—'}</TableCell>
                  {isFullscreen && <TableCell style={cellS}>{c.opened_for || '—'}</TableCell>}
                  <TableCell style={cellS}><PriorityPill priority={pk} theme={theme} /></TableCell>
                  <TableCell style={cellS}><StatePill state={c.state} theme={theme} /></TableCell>
                  {isFullscreen && (
                    <TableCell style={cellS}>
                      <Button appearance="subtle" size="small" icon={<EyeRegular />} title="View" aria-label={`View ${c.number || 'details'}`} onClick={(e: React.MouseEvent) => { e.stopPropagation(); setViewingRecord(c); }} />
                    </TableCell>
                  )}
                </TableRow>
              </React.Fragment>
            );
          })}
        </TableBody>
      </Table>
      <Dialog open={!!viewingRecord} onOpenChange={(_, d) => { if (!d.open) setViewingRecord(null); }}>
        <DialogSurface style={{ maxWidth: '640px', width: '90vw' }}>
          <DialogBody>
            <DialogTitle action={<Button appearance="subtle" icon={<DismissRegular />} aria-label="Close" onClick={() => setViewingRecord(null)} />}>
              HR Case {viewingRecord?.number}
            </DialogTitle>
            <DialogContent>
              {viewingRecord && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <Text size={200} weight="semibold" style={{ color: tokens.colorNeutralForeground3, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Subject</Text>
                    <Text block style={{ marginTop: '4px' }}>{viewingRecord.subject || '—'}</Text>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <Text size={200} weight="semibold" style={{ color: tokens.colorNeutralForeground3, textTransform: 'uppercase' }}>Number</Text>
                      <Text block style={{ marginTop: '4px', fontFamily: 'monospace' }}>{viewingRecord.number || '—'}</Text>
                    </div>
                    <div>
                      <Text size={200} weight="semibold" style={{ color: tokens.colorNeutralForeground3, textTransform: 'uppercase' }}>Opened For</Text>
                      <Text block style={{ marginTop: '4px' }}>{viewingRecord.opened_for || '—'}</Text>
                    </div>
                    <div>
                      <Text size={200} weight="semibold" style={{ color: tokens.colorNeutralForeground3, textTransform: 'uppercase' }}>Priority</Text>
                      <div style={{ marginTop: '4px' }}><PriorityPill priority={String(viewingRecord.priority).charAt(0)} theme={theme} /></div>
                    </div>
                    <div>
                      <Text size={200} weight="semibold" style={{ color: tokens.colorNeutralForeground3, textTransform: 'uppercase' }}>State</Text>
                      <div style={{ marginTop: '4px' }}><StatePill state={viewingRecord.state} theme={theme} /></div>
                    </div>
                    <div>
                      <Text size={200} weight="semibold" style={{ color: tokens.colorNeutralForeground3, textTransform: 'uppercase' }}>Assigned To</Text>
                      <Text block style={{ marginTop: '4px' }}>{viewingRecord.assigned_to || '—'}</Text>
                    </div>
                    <div>
                      <Text size={200} weight="semibold" style={{ color: tokens.colorNeutralForeground3, textTransform: 'uppercase' }}>HR Service</Text>
                      <Text block style={{ marginTop: '4px' }}>{viewingRecord.hr_service || '—'}</Text>
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
