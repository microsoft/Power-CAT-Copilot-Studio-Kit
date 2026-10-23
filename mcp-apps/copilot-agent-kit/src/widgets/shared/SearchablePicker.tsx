import { useEffect, useState, type ReactNode } from "react";
import {
  Button,
  Combobox,
  Field,
  Option,
  Spinner,
  Text,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import { Dismiss16Regular } from "@fluentui/react-icons";

export interface PickerOption {
  id: string;
  label: string;
  detail?: string;
  icon?: ReactNode;
}

interface SearchablePickerProps {
  label: string;
  options: readonly PickerOption[];
  selected?: PickerOption;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  error?: string;
  hint?: string;
  hideHint?: boolean;
  hideLabel?: boolean;
  emptyText?: string;
  onSelect: (id: string) => void;
  onSearch?: (query: string) => void;
  onClear?: () => void;
}

const useStyles = makeStyles({
  field: { minWidth: 0 },
  control: { display: "flex", alignItems: "center", gap: tokens.spacingHorizontalXS },
  combo: { minWidth: 0, width: "100%", flex: 1 },
  list: { maxHeight: "280px" },
  clear: { minWidth: "28px", flexShrink: 0 },
  option: {
    display: "flex",
    alignItems: "center",
    gap: tokens.spacingHorizontalS,
    minWidth: 0,
    paddingTop: tokens.spacingVerticalXS,
    paddingBottom: tokens.spacingVerticalXS,
  },
  icon: { display: "flex", flexShrink: 0, color: tokens.colorBrandForeground1 },
  lines: { display: "flex", flexDirection: "column", minWidth: 0 },
  primary: { overflowWrap: "anywhere", fontWeight: tokens.fontWeightSemibold },
  secondary: { color: tokens.colorNeutralForeground3, overflowWrap: "anywhere" },
});

export function SearchablePicker({
  label,
  options,
  selected,
  placeholder = `Search ${label.toLowerCase()}...`,
  disabled,
  loading,
  error,
  hint,
  hideHint,
  hideLabel,
  emptyText = "No matches found.",
  onSelect,
  onSearch,
  onClear,
}: SearchablePickerProps) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [requestedQuery, setRequestedQuery] = useState<string>();

  useEffect(() => {
    if (!open || !onSearch || disabled) return;
    const timer = window.setTimeout(() => {
      setRequestedQuery(query.trim());
      onSearch(query.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [onSearch, open, query, disabled]);

  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);

  const needle = query.trim().toLocaleLowerCase();
  const searching = loading || Boolean(open && onSearch && requestedQuery !== query.trim());
  const visible = onSearch
    ? options
    : options.filter((option) =>
      `${option.label} ${option.detail ?? ""}`.toLocaleLowerCase().includes(needle));

  return (
    <Field
      className={styles.field}
      label={hideLabel ? undefined : label}
      hint={hideHint ? undefined : selected?.detail ?? hint}
      validationState={error ? "error" : "none"}
      validationMessage={error}
    >
      <div className={styles.control}>
        <Combobox
          className={styles.combo}
          listbox={{ className: styles.list }}
          aria-label={label}
          aria-busy={searching}
          autoComplete="off"
          disabled={disabled}
          open={open}
          value={open ? query : selected?.label ?? ""}
          selectedOptions={selected ? [selected.id] : []}
          placeholder={placeholder}
          onChange={(event) => setQuery(event.target.value)}
          onOpenChange={(_, detail) => {
            setOpen(detail.open);
            if (detail.open) { setQuery(""); setRequestedQuery(undefined); }
          }}
          onOptionSelect={(_, detail) => {
            if (!detail.optionValue) return;
            onSelect(detail.optionValue);
            setOpen(false);
            setQuery("");
          }}
        >
          {searching && (
            <Option value="__loading__" disabled text={`Loading ${label.toLowerCase()}`}>
              <Spinner size="tiny" label={`Loading ${label.toLowerCase()}...`} />
            </Option>
          )}
          {!searching && visible.length === 0 && (
            <Option value="__empty__" disabled>{error ? "The search failed. Try again." : emptyText}</Option>
          )}
          {!searching && visible.map((option) => (
            <Option key={option.id} value={option.id} text={option.label}>
              <span className={styles.option}>
                {option.icon && <span className={styles.icon} aria-hidden="true">{option.icon}</span>}
                <span className={styles.lines}>
                  <Text className={styles.primary}>{option.label}</Text>
                  {option.detail && <Text size={200} className={styles.secondary}>{option.detail}</Text>}
                </span>
              </span>
            </Option>
          ))}
        </Combobox>
        {selected && onClear && (
          <Button
            className={styles.clear}
            size="small"
            appearance="subtle"
            icon={<Dismiss16Regular />}
            aria-label={`Clear ${label.toLowerCase()}`}
            disabled={disabled}
            onClick={onClear}
          />
        )}
      </div>
    </Field>
  );
}
