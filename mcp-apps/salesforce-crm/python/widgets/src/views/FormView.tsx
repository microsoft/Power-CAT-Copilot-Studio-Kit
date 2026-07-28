import React, { useEffect, useState } from 'react';
import { Button, Field, Input, Spinner, Text, tokens } from '@fluentui/react-components';
import { CheckmarkRegular } from '@fluentui/react-icons';
import { DatePicker } from '@fluentui/react-datepicker-compat';
import { ExpandButton, FkHint } from '@gtc/mcp-shared';
import { FORM_BRAND, FORM_CREATE_TOOL, FORM_DEFS, FORM_ID_PARAM, FORM_LIST_TOOL, FORM_UPDATE_TOOL } from '../constants';
import { FormSelect } from '../components/FormSelect';
import { SkeletonTable } from '../components/SkeletonTable';
import { SldsFooter } from '../components/SldsFooter';
import { useStyles } from '../styles';
import { slds } from '../theme';

type RenderListView = (
  entity: string,
  data: any,
  callTool: (n: string, a?: any) => Promise<any>,
  toast: (...args: any[]) => void,
  theme: 'light' | 'dark',
  isFullscreen?: boolean,
) => React.ReactNode;

// SuccessPivot: handles the `type: 'success'` response shape returned by
// every update/create tool. When Copilot calls an update tool directly
// (without going through the inline form), the response lands at the
// top-level dispatcher with no matching view -- the result was a grey
// empty container. This component fetches the entity's list and renders
// it so the user sees their data instead of blank space.
export function SuccessPivot({ entity, callTool, toast, theme, isFullscreen, renderListView }: {
  entity: string;
  callTool: (n: string, a?: any) => Promise<any>;
  toast: (m: string, t?: any) => void;
  theme: 'light' | 'dark';
  isFullscreen?: boolean;
  renderListView: RenderListView;
}) {
  const [listData, setListData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const listTool = FORM_LIST_TOOL[entity];
    if (!listTool) { setLoading(false); return; }
    callTool(listTool, { refresh: true })
      .then(res => setListData(res))
      .catch(() => { /* leave listData null -> render nothing */ })
      .finally(() => setLoading(false));
  }, [entity, callTool]);

  if (loading) return <SkeletonTable />;
  if (!listData) return null;
  const node = renderListView(entity, listData, callTool, toast, theme, isFullscreen);
  return <>{node}</>;
}

export function FormView({ entity, prefill, mode = 'create', recordId, callTool, toast, theme, renderListView }: {
  entity: string;
  prefill?: Record<string, string>;
  mode?: 'create' | 'edit';
  recordId?: string;
  callTool: (n: string, a?: any) => Promise<any>;
  toast: (m: string, t?: any, ...args: any[]) => void;
  theme: 'light' | 'dark';
  renderListView: RenderListView;
}) {
  const styles = useStyles();
  const t = slds(theme);
  const fields = FORM_DEFS[entity] || [];
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    fields.forEach(f => { init[f.key] = prefill?.[f.key] || ''; });
    return init;
  });
  const [submitting, setSubmitting] = useState(false);
  const [listAfterAction, setListAfterAction] = useState<any | null>(null);
  const set = (k: string, v: string) => setValues(p => ({ ...p, [k]: v }));

  const entityLabel = entity.charAt(0).toUpperCase() + entity.slice(1);
  const isEdit = mode === 'edit';

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const args: Record<string, any> = {};
      fields.forEach(f => { if (values[f.key]) args[f.key] = values[f.key]; });
      let result: any;
      if (isEdit) {
        const idParam = FORM_ID_PARAM[entity] || `${entity}_id`;
        result = await callTool(FORM_UPDATE_TOOL[entity] || `update_${entity}`, { [idParam]: recordId, ...args });
      } else {
        result = await callTool(FORM_CREATE_TOOL[entity] || `create_${entity}`, args);
      }
      // Alert path — server returned a non-fatal warning (e.g. account-not-found
      // with suggestions). Surface the message persistently (user dismisses via
      // ✕) and keep the form open so the user can correct and re-submit.
      // Do NOT pivot to the list.
      if (result && result.type === 'alert') {
        toast(result.message || 'Cannot complete — please correct and retry.', 'info', 0);
        return;
      }
      toast(`${entityLabel} ${isEdit ? 'updated' : 'created'}!`, 'success');
      // Pivot to the list view so the user immediately sees the new/updated row
      const listTool = FORM_LIST_TOOL[entity];
      if (listTool) {
        try {
          const listRes = await callTool(listTool, { refresh: true });
          if (listRes) setListAfterAction(listRes);
        } catch { /* fall through — leave form open */ }
      }
    } catch (e: any) { toast(e?.message || `Failed to ${isEdit ? 'update' : 'create'}.`, 'error'); }
    finally { setSubmitting(false); }
  };

  const handleReset = () => {
    const init: Record<string, string> = {};
    fields.forEach(f => { init[f.key] = prefill?.[f.key] || ''; });
    setValues(init);
  };

  // After successful create/update, pivot to the matching list view.
  if (listAfterAction) {
    const node = renderListView(entity, listAfterAction, callTool, toast, theme);
    if (node) return <>{node}</>;
  }

  return (
    <div className={styles.card} style={{ border: `1px solid ${t.border}`, background: t.surface }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: `1px solid ${t.border}` }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: FORM_BRAND[entity] || tokens.colorNeutralForeground1 }}>
          <Text as="h2" size={400} weight="semibold" style={{ margin: 0, fontSize: 'inherit', fontWeight: 'inherit', color: 'inherit' }}>{isEdit ? 'Edit' : 'New'} {entityLabel}</Text>
        </div>
        <ExpandButton />
      </div>
      {(
        <div style={{ padding: '16px 20px 20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px 20px', marginBottom: '20px' }}>
            {fields.map(f =>
              f.type === 'select' ? (
                <FormSelect key={f.key} label={f.label} value={values[f.key]} options={f.options || []} onChange={v => set(f.key, v)} theme={theme} />
              ) : f.inputType === 'date' ? (
                <Field key={f.key} label={f.label} size="small">
                  <DatePicker size="small" placeholder="Select date" value={values[f.key] ? new Date(values[f.key] + 'T00:00:00') : null} onSelectDate={(d) => set(f.key, d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` : '')} />
                </Field>
              ) : (
                <Field key={f.key} label={f.label} size="small">
                  <Input size="small" type={f.inputType || 'text'} value={values[f.key]} onChange={(_, d) => set(f.key, d.value)} style={{ background: t.surface, color: t.text }} />
                </Field>
              )
            )}
          </div>
          <div className={styles.formActions}>
            <Button appearance="secondary" onClick={handleReset}>Cancel</Button>
            <Button appearance="primary" onClick={handleSubmit} disabled={submitting}
              icon={submitting ? undefined : <CheckmarkRegular />}
              style={{ minWidth: '90px' }}>
              {submitting ? <Spinner size="tiny" /> : 'Submit'}
            </Button>
          </div>
          <FkHint fields={fields} systemName="Salesforce" />
        </div>
      )}
      <SldsFooter theme={theme} />
    </div>
  );
}
