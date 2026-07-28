import React, { useState } from 'react';
import { Button, Field, Textarea, tokens } from '@fluentui/react-components';
import { CheckmarkCircleRegular } from '@fluentui/react-icons';
import { ExpandButton } from '@gtc/mcp-shared';
import { PRIORITY_LABELS } from '../constants';
import { FormSelect } from '../components/FormSelect';
import { NowFooter } from '../components/NowFooter';
import { useStyles } from '../styles';
import { now } from '../theme';

// ── Resolve Incident View ────────────────────────────────────────────────────
const CLOSE_CODES = [
  'Duplicate',
  'Known error',
  'No resolution provided',
  'Resolved by caller',
  'Resolved by change',
  'Resolved by problem',
  'Resolved by request',
  'Solution provided',
  'Workaround provided',
  'User error',
];

export function ResolveIncidentView({ sys_id, number, short_description, description, priority, state, assigned_to, category, callTool, toast, theme, renderList }: {
  sys_id: string;
  number: string;
  short_description?: string;
  description?: string;
  priority?: string;
  state?: string;
  assigned_to?: string;
  category?: string;
  callTool: (name: string, args?: Record<string, any>) => Promise<any>;
  toast: (msg: string, type?: 'success' | 'error' | 'info', timeout?: number) => void;
  theme: 'light' | 'dark';
  renderList: (data: any, callTool: (n: string, a?: any) => Promise<any>, toast: (m: string, t?: any, timeout?: number) => void, theme: 'light' | 'dark') => React.ReactNode;
}) {
  const styles = useStyles();
  const t = now(theme);
  const [closeCode, setCloseCode] = useState('Solution provided');
  const [closeNotes, setCloseNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [listAfterAction, setListAfterAction] = useState<any | null>(null);

  const handleResolve = async () => {
    setSubmitting(true);
    try {
      const result = await callTool('sn__resolve_incident', {
        sys_id,
        close_code: closeCode,
        close_notes: closeNotes.trim() || 'Resolved',
      });
      toast('Incident resolved');
      if (result) setListAfterAction(result);
    } catch (e: any) {
      toast(e.message || 'Failed to resolve incident', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (listAfterAction) {
    const node = renderList(listAfterAction, callTool, toast, theme);
    if (node) return <>{node}</>;
  }

  return (
    <div className={styles.card} style={{ border: `1px solid ${t.border}`, background: t.surface }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: `1px solid ${t.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <CheckmarkCircleRegular style={{ fontSize: '18px', color: tokens.colorBrandForeground1 }} />
          <h2 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: t.text }}>Resolve Incident — {number}</h2>
        </div>
        <ExpandButton />
      </div>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* ── Incident summary panel ── */}
        {(short_description || priority || state) && (
          <div style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: '6px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {short_description && (
              <div>
                <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: t.textWeak, letterSpacing: '0.4px' }}>Short Description</span>
                <div style={{ fontSize: '13px', color: t.text, marginTop: '3px', fontWeight: 600 }}>{short_description}</div>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {priority && (
                <div>
                  <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: t.textWeak }}>Priority</span>
                  <div style={{ fontSize: '13px', color: t.text, marginTop: '2px' }}>{PRIORITY_LABELS[priority] || priority}</div>
                </div>
              )}
              {state && (
                <div>
                  <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: t.textWeak }}>State</span>
                  <div style={{ fontSize: '13px', color: t.text, marginTop: '2px' }}>{state}</div>
                </div>
              )}
              {assigned_to && (
                <div>
                  <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: t.textWeak }}>Assigned To</span>
                  <div style={{ fontSize: '13px', color: t.text, marginTop: '2px' }}>{assigned_to}</div>
                </div>
              )}
              {category && (
                <div>
                  <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: t.textWeak }}>Category</span>
                  <div style={{ fontSize: '13px', color: t.text, marginTop: '2px', textTransform: 'capitalize' }}>{category}</div>
                </div>
              )}
            </div>
            {description && (
              <div>
                <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: t.textWeak }}>Description</span>
                <div style={{ fontSize: '12px', color: t.textWeak, marginTop: '3px', lineHeight: '1.5', maxHeight: '60px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{description}</div>
              </div>
            )}
          </div>
        )}

        {/* ── Resolution form fields ── */}
        <FormSelect
          label="Resolution Code *"
          value={closeCode}
          options={CLOSE_CODES}
          onChange={setCloseCode}
          theme={theme}
        />

        <Field label="Resolution Notes" size="small">
          <Textarea
            size="small"
            value={closeNotes}
            onChange={(_, d) => setCloseNotes(d.value)}
            placeholder="Describe how the incident was resolved…"
            rows={3}
            resize="vertical"
          />
        </Field>

        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '4px' }}>
          <Button
            appearance="primary"
            size="medium"
            icon={<CheckmarkCircleRegular />}
            onClick={handleResolve}
            disabled={submitting}
          >
            {submitting ? 'Resolving…' : 'Resolve Incident'}
          </Button>
        </div>
      </div>
      <NowFooter theme={theme} />
    </div>
  );
}
