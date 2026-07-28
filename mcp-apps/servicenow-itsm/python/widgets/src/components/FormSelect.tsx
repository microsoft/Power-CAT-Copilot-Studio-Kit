import { Dropdown, Field, Option } from '@fluentui/react-components';

// ── Inline select ─────────────────────────────────────────────────────────
export function FormSelect({ label, value, options, labels, onChange, theme: _theme, disabled }: {
  label: string;
  value: string;
  options: string[];
  labels?: Record<string, string>;
  onChange: (v: string) => void;
  theme: 'light' | 'dark';
  disabled?: boolean;
}) {
  return (
    <Field label={label} size="small">
      <Dropdown size="small" value={labels?.[value] || value || '— Select —'}
        selectedOptions={value ? [value] : []}
        onOptionSelect={(_, d) => onChange(d.optionValue || '')}
        aria-label={label}
        disabled={disabled}
        style={{ minWidth: 0 }}
      >
        {options.map((o) => <Option key={o} value={o}>{labels?.[o] || o}</Option>)}
      </Dropdown>
    </Field>
  );
}
