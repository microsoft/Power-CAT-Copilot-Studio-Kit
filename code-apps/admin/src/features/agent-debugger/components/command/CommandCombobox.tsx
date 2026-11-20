/**
 * The design's rich command-bar picker (`.w-combo`).
 *
 * Fluent's `Combobox` renders a single-line input, so it cannot produce the
 * two-line option rows (primary label + secondary detail + trailing badge) or
 * the grouped, avatar-led listbox the approved design uses for the Agent,
 * Conversation and Session pickers. This component reproduces the design's
 * markup while keeping Fluent's combobox roles, keyboard model and tokens.
 *
 * Mirrors `renderPicker()` / `renderConvPicker()` / `renderSessionPicker()` in
 * `design/assets/workspace.js`.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button, Input, mergeClasses } from '@fluentui/react-components';
import { ChevronDown20Regular, ChevronUp20Regular, Dismiss16Regular } from '@fluentui/react-icons';

/** One selectable row in the popover listbox. */
export interface CommandOption {
  /** Stable identity used for selection and React keys. */
  id: string;
  /** Primary line (`.l1`). */
  primary: ReactNode;
  /** Secondary line (`.l2`) — usually a date plus a few facets. */
  secondary?: ReactNode;
  /** Leading avatar glyph (`.av`). */
  icon?: ReactNode;
  /** Trailing badge, e.g. "Current" or an idle-gap warning. */
  badge?: ReactNode;
  /** Optional group heading (`.w-optgrp`); consecutive equal values merge. */
  group?: string;
}

export interface CommandComboboxProps {
  /** Visible field label; also labels the combobox for assistive tech. */
  label: ReactNode;
  /** Collapsed display content — the design shows one or two lines. */
  display: ReactNode;
  options: readonly CommandOption[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  /** Placeholder for the inline search input shown while open. */
  searchPlaceholder: string;
  /** Message shown when the query matches nothing. */
  emptyText?: (query: string) => string;
  /** Rendered above the options when there is no active query. */
  header?: ReactNode;
  /** Optional lazy-loading affordance, used by the agent picker only. */
  onLoadMore?: () => void;
  loadingMore?: boolean;
  disabled?: boolean;
  className?: string;
  /** Called with the live query so callers can filter server-side if needed. */
  onQueryChange?: (query: string) => void;
  /**
   * When supplied *and* a value is selected, a dismiss button is rendered next
   * to the chevron so the field can be reset without picking another option —
   * the same affordance the design uses to drop a filter tag (`.x` ->
   * `clearFilter()`) and to remove a loaded snapshot (`clearSnapshot()`).
   */
  onClear?: () => void;
  /** Accessible label for the clear button. */
  clearLabel?: string;
  /** Interactive action rendered after clear and before the chevron while closed. */
  trailingAction?: ReactNode;
}

export function CommandCombobox({
  label,
  display,
  options,
  selectedId,
  onSelect,
  searchPlaceholder,
  emptyText = (q) => `No match for "${q}"`,
  header,
  onLoadMore,
  loadingMore = false,
  disabled = false,
  className,
  onQueryChange,
  onClear,
  clearLabel = 'Clear selection',
  trailingAction,
}: CommandComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const labelId = useId();
  const listId = useId();

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    onQueryChange?.('');
  }, [onQueryChange]);

  // Clicking away or pressing Escape dismisses the popover, matching the
  // prototype's document-level listener.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const handleQuery = (value: string) => {
    setQuery(value);
    onQueryChange?.(value);
  };

  /** Group headings are emitted only when the group changes, as in the design. */
  const rows = useMemo(() => {
    const out: Array<{ kind: 'group'; label: string } | { kind: 'option'; option: CommandOption }> =
      [];
    let currentGroup: string | undefined;
    for (const option of options) {
      if (option.group && option.group !== currentGroup) {
        currentGroup = option.group;
        out.push({ kind: 'group', label: option.group });
      }
      out.push({ kind: 'option', option });
    }
    return out;
  }, [options]);

  return (
    <div className={mergeClasses('w-field', className)}>
      <label id={labelId}>
        {label}
      </label>
      <div className="w-combo" ref={rootRef}>
        <div
          className="w-combo-input"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={listId}
          aria-labelledby={labelId}
          aria-disabled={disabled}
          tabIndex={disabled ? -1 : 0}
          onClick={() => !disabled && setOpen((v) => !v)}
          onKeyDown={(event) => {
            if (disabled) return;
            // While open the search <input> is a child of this combobox node, so
            // its keystrokes bubble here. Swallowing Space would make the field
            // impossible to type a space into.
            if (event.target !== event.currentTarget) return;
            if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
            }
          }}
        >
          {open ? (
            <Input
              ref={inputRef}
              type="text"
              placeholder={searchPlaceholder}
              value={query}
              onChange={(_, data) => handleQuery(data.value)}
              onClick={(event) => event.stopPropagation()}
              autoComplete="off"
              aria-labelledby={labelId}
              style={{ flex: 1, minWidth: 0, border: 0, backgroundColor: 'transparent' }}
            />
          ) : (
            display
          )}
          {onClear && selectedId && !open && !disabled && (
            <Button
              appearance="transparent"
              type="button"
              className="w-combo-clear"
              aria-label={clearLabel}
              title={clearLabel}
              onClick={(event) => {
                event.stopPropagation();
                onClear();
              }}
            >
              <Dismiss16Regular aria-hidden="true" />
            </Button>
          )}
          {trailingAction && !open && !disabled && (
            <span className="w-combo-action" onClick={(event) => event.stopPropagation()}>
              {trailingAction}
            </span>
          )}
          <span className="chev" aria-hidden="true">
            {open ? <ChevronUp20Regular /> : <ChevronDown20Regular />}
          </span>
        </div>

        {open && (
          <div
            className="w-pop"
            role="listbox"
            id={listId}
            aria-labelledby={labelId}
            aria-busy={loadingMore || undefined}
            onScroll={(event) => {
              const list = event.currentTarget;
              if (!loadingMore && list.scrollHeight - list.scrollTop - list.clientHeight < 64) onLoadMore?.();
            }}
            onWheel={(event) => {
              const list = event.currentTarget;
              if (event.deltaY > 0 && !loadingMore
                && list.scrollHeight - list.scrollTop - list.clientHeight < 64) onLoadMore?.();
            }}
          >
            {!query && header}
            {options.length === 0 ? (
              <div className="w-empty">{emptyText(query)}</div>
            ) : (
              rows.map((row, index) =>
                row.kind === 'group' ? (
                  <div
                    className="w-optgrp"
                    key={`g-${row.label}-${index}`}
                    role="presentation"
                  >
                    {row.label}
                  </div>
                ) : (
                  <Button
                    appearance="transparent"
                    type="button"
                    key={row.option.id}
                    className="w-opt"
                    role="option"
                    aria-selected={row.option.id === selectedId}
                    onClick={() => {
                      onSelect(row.option.id);
                      close();
                    }}
                  >
                    {row.option.icon && (
                      <span className="av" aria-hidden="true">
                        {row.option.icon}
                      </span>
                    )}
                    <span className="lines">
                      <span className="l1">{row.option.primary}</span>
                      {row.option.secondary && (
                        <span className="l2">{row.option.secondary}</span>
                      )}
                    </span>
                    {row.option.badge}
                  </Button>
                ),
              )
            )}
            {loadingMore ? (
              <div className="w-empty" role="status">Loading remaining agents...</div>
            ) : onLoadMore ? (
              <Button appearance="transparent" type="button" onClick={() => onLoadMore()}>
                Load agents from other environments
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

export default CommandCombobox;
