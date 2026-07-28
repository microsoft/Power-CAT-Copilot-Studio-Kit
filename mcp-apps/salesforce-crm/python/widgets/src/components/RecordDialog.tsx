import React from 'react';
import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Field, Input } from '@fluentui/react-components';
import { AddRegular, SaveRegular } from '@fluentui/react-icons';
import { FkHint } from '@gtc/mcp-shared';
import { FormSelect } from './FormSelect';
import { slds } from '../theme';

// ── Inline form row ────────────────────────────────────────────────────────
// FkHint imported from @gtc/mcp-shared (commit promoting it from per-LOB to
// shared, 2026-05-29). Pass systemName="Salesforce" so the wording reflects
// this LOB. See Project-Theory/lob-mcp-apps/fk-alert-pattern-playbook.md §7a.

export function RecordDialog({ open, title, fields, onSave, onCancel, saving, theme }: {
  open: boolean; title: string;
  fields: { label: string; key: string; value: string; onChange: (v: string) => void; type?: 'select'; options?: string[]; inputType?: string; readonly?: boolean; fullWidth?: boolean }[];
  onSave: () => void; onCancel: () => void; saving: boolean; theme: 'light' | 'dark';
}) {
  const t = slds(theme);
  const normalFields = fields.filter(f => !f.fullWidth);
  const wideFields = fields.filter(f => f.fullWidth);
  return (
    <Dialog open={open} onOpenChange={(_, data) => { if (!data.open) onCancel(); }}>
      <DialogSurface style={{ maxWidth: '480px', padding: '24px' }}>
        <DialogBody>
          <DialogTitle style={{ fontSize: '16px', fontWeight: 600 }}>{title}</DialogTitle>
          <DialogContent style={{ paddingTop: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px 16px' }}>
              {normalFields.map(f =>
                f.readonly ? (
                  <Field key={f.key} label={f.label} size="small">
                    <Input size="small" value={f.value || '—'} disabled style={{ color: t.textWeak }} />
                  </Field>
                ) : f.type === 'select' ? (
                  <FormSelect key={f.key} label={f.label} value={f.value} options={f.options || []} onChange={f.onChange} theme={theme} />
                ) : (
                  <Field key={f.key} label={f.label} size="small">
                    <Input size="small" type={f.inputType || 'text'} value={f.value} onChange={(_, d) => f.onChange(d.value)} />
                  </Field>
                )
              )}
            </div>
            {wideFields.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px', marginTop: '12px' }}>
                {wideFields.map(f => (
                  <Field key={f.key} label={f.label} size="small">
                    <Input size="small" type={f.inputType || 'text'} value={f.value} onChange={(_, d) => f.onChange(d.value)} />
                  </Field>
                ))}
              </div>
            )}
            <FkHint fields={fields} systemName="Salesforce" />
          </DialogContent>
          <DialogActions style={{ paddingTop: '16px' }}>
            <Button appearance="secondary" onClick={onCancel} disabled={saving}>Cancel</Button>
            <Button appearance="primary" onClick={onSave} disabled={saving}
              icon={title.includes('Edit') ? <SaveRegular /> : <AddRegular />}>
              {saving ? 'Saving…' : title.includes('Edit') ? 'Save' : 'Create'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
