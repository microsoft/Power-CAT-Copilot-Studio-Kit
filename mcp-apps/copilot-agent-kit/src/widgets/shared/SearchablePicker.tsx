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
  /** The text of the loading option, and of the empty field while it loads. */
  loadingText?: string;
  /** Shows a load in the closed field: the loading text, or a spinner in place of the chevron. */
  loadingInField?: boolean;
  error?: string;
  hint?: string;
  hideHint?: boolean;
  hideLabel?: boolean;
  emptyText?: string;
  onSelect: (id: string) => void;
  /** A remote search for a non-empty query. An empty query restores the loaded options without a search. */
  onSearch?: (query: string) => void;
  onOpen?: () => void;
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
  loadingText = `Loading ${label.toLowerCase()}s...`,
  loadingInField = true,
  error,
  hint,
  hideHint,
  hideLabel,
  emptyText = "No matches found.",
  onSelect,
  onSearch,
  onOpen,
  onClear,
}: SearchablePickerProps) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // The last query sent to onSearch. Undefined: the loaded options show, with no remote search.
  const [requestedQuery, setRequestedQuery] = useState<string>();
  const trimmed = query.trim();

  useEffect(() => {
    if (!open || !onSearch || disabled || trimmed === (requestedQuery ?? "")) return;
    if (!trimmed) {
      setRequestedQuery(undefined);
      onSearch("");
      return;
    }
    const timer = window.setTimeout(() => {
      setRequestedQuery(trimmed);
      onSearch(trimmed);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [onSearch, open, trimmed, requestedQuery, disabled]);

  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);

  const needle = trimmed.toLocaleLowerCase();
  const searching = loading || Boolean(open && onSearch && trimmed && requestedQuery !== trimmed);
  const visible = onSearch && needle
    ? options
    : options.filter((option) =>
      `${option.label} ${option.detail ?? ""}`.toLocaleLowerCase().includes(needle));
  // A closed field shows its load once: as the placeholder when it is empty, or as a spinner in place of the chevron.
  const fieldLoading = Boolean(loading && loadingInField && !open);

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
          placeholder={fieldLoading && !selected ? loadingText : placeholder}
          expandIcon={fieldLoading && selected ? { children: <Spinner size="tiny" aria-hidden="true" /> } : undefined}
          onChange={(event) => setQuery(event.target.value)}
          onOpenChange={(_, detail) => {
            setOpen(detail.open);
            if (!detail.open) return;
            setQuery("");
            // A new open starts with the loaded options. Only an earlier remote search must be reset.
            if (requestedQuery !== undefined) {
              setRequestedQuery(undefined);
              onSearch?.("");
            }
            onOpen?.();
          }}
          onOptionSelect={(_, detail) => {
            if (!detail.optionValue) return;
            onSelect(detail.optionValue);
            setOpen(false);
            setQuery("");
          }}
        >
          {searching && (
            <Option value="__loading__" disabled text={loadingText}>
              <Spinner size="tiny" label={loadingText} />
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
