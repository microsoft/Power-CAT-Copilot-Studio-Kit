/**
 * Advanced filters drawer (`.w-drawer` / `paintPanel()`).
 *
 * The design moves everything except Agent, Conversation and Session out of the
 * command row and into this overlay drawer: a two-column time-range radio grid
 * (with an optional custom range), a two-column grid of facet selects,
 * step-type chips and two conversation switches. Edits are staged in a draft
 * and only committed on Apply, matching `STATE.draft` in the prototype.
 *
 * Markup mirrors `paintPanel()` (workspace.js:575-657) one-for-one so the
 * approved `workspace.css` styles it without any paraphrasing layer.
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  Button,
  Combobox,
  MessageBar,
  MessageBarBody,
  Option,
  Radio,
  RadioGroup,
  Select,
  Switch,
} from '@fluentui/react-components';
import { DatePicker } from '@fluentui/react-datepicker-compat';
import { Dismiss20Regular } from '@fluentui/react-icons';
import { KNOWN_COMPONENT_TYPES, componentColor } from '../../theme/component-colors';
import {
  CHANNEL_FILTER_OPTIONS,
  FILTER_DEFAULTS,
  OUTCOME_OPTIONS,
  SESSION_TYPE_OPTIONS,
  TIME_RANGE_OPTIONS,
  customRangeError,
  partsOf,
  type DebuggerFilters,
  type FilterOption,
} from '../../contracts/filters';

export interface AdvancedFiltersDrawerProps {
  open: boolean;
  filters: DebuggerFilters;
  /** Languages configured on the selected bot record. */
  localeOptions: readonly FilterOption[];
  /** Step types discovered in the loaded transcripts. */
  stepTypeOptions: readonly string[];
  scanError?: string;
  onApply: (filters: DebuggerFilters) => void;
  onDismiss: () => void;
}

function dateFromPart(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getFullYear() === Number(match[1]) &&
    date.getMonth() === Number(match[2]) - 1 &&
    date.getDate() === Number(match[3])
    ? date
    : null;
}

function dateToPart(value: Date | null | undefined): string {
  if (!value) return '';
  const year = String(value.getFullYear()).padStart(4, '0');
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTimeLabel(value: string): string {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return '';
  const hour = Number(match[1]);
  const minute = match[2];
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute} ${period}`;
}

const TIME_OPTIONS = Array.from({ length: 96 }, (_, index) => {
  const hour = Math.floor(index / 4);
  const minute = (index % 4) * 15;
  const value = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  return { value, label: formatTimeLabel(value) };
});

export function AdvancedFiltersDrawer({
  open,
  filters,
  localeOptions,
  stepTypeOptions,
  scanError,
  onApply,
  onDismiss,
}: AdvancedFiltersDrawerProps) {
  if (!open) return null;
  return (
    <AdvancedFiltersDrawerSurface
      filters={filters}
      localeOptions={localeOptions}
      stepTypeOptions={stepTypeOptions}
      scanError={scanError}
      onApply={onApply}
      onDismiss={onDismiss}
    />
  );
}

function AdvancedFiltersDrawerSurface({
  filters,
  localeOptions,
  stepTypeOptions,
  scanError,
  onApply,
  onDismiss,
}: Omit<AdvancedFiltersDrawerProps, 'open'>) {
  const [draft, setDraft] = useState<DebuggerFilters>(filters);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    bodyRef.current?.scrollTo({ top: 0, left: 0 });
    surfaceRef.current?.focus({ preventScroll: true });
    return () => {
      previouslyFocusedRef.current?.focus();
      previouslyFocusedRef.current = null;
    };
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onDismiss();
        return;
      }
      if (event.key === 'Tab') {
        const focusable = Array.from(
          surfaceRef.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
          ) ?? [],
        );
        if (!focusable.length) {
          event.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    },
    [onDismiss],
  );

  const set = <K extends keyof DebuggerFilters>(key: K, value: DebuggerFilters[K]) => {
    setDraft((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'timeRange' && value !== 'custom') {
        next.customFrom = '';
        next.customTo = '';
      }
      return next;
    });
  };

  const setCustom = (which: 'from' | 'to', part: 'date' | 'time', value: string) => {
    const key = which === 'from' ? 'customFrom' : 'customTo';
    setDraft((prev) => {
      const p = partsOf(prev[key]);
      if (part === 'date') p.d = value;
      else p.t = value;
      return { ...prev, [key]: p.d ? `${p.d}T${p.t || '00:00'}` : '' };
    });
  };

  const toggleStepType = (type: string) => {
    setDraft((prev) => ({
      ...prev,
      stepTypes: prev.stepTypes.includes(type)
        ? prev.stepTypes.filter((t) => t !== type)
        : [...prev.stepTypes, type],
    }));
  };

  // `paintPanel()` always has chips because the design reads facets from the
  // loaded agent index. Here facets only exist post-analysis, so fall back to
  // the palette's known types rather than hiding the whole section.
  const stepTypes = stepTypeOptions.length > 0 ? stepTypeOptions : KNOWN_COMPONENT_TYPES;
  const validationError = customRangeError(draft);

  const dateField = (which: 'from' | 'to', label: string) => {
    const p = partsOf(which === 'from' ? draft.customFrom : draft.customTo);
    const other = partsOf(which === 'from' ? draft.customTo : draft.customFrom);
    const selectedDate = dateFromPart(p.d);
    const boundaryDate = dateFromPart(other.d) ?? undefined;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const maxDate =
      which === 'from' && boundaryDate && boundaryDate < today ? boundaryDate : today;
    return (
      <div className="w-popfield">
        <label htmlFor={`p-${which}-date`}>{label}</label>
        <div className="w-daterow">
          <DatePicker
            className="w-date-picker"
            id={`p-${which}-date`}
            appearance="outline"
            placeholder="Select date"
            value={selectedDate}
            onSelectDate={(date) => setCustom(which, 'date', dateToPart(date))}
            maxDate={maxDate}
            minDate={which === 'to' ? boundaryDate : undefined}
            aria-label={`${label} date`}
          />
          <Combobox
            className="w-time-picker"
            id={`p-${which}-time`}
            appearance="outline"
            placeholder="Select time"
            value={formatTimeLabel(p.t)}
            selectedOptions={p.t ? [p.t] : []}
            inlinePopup
            disabled={!p.d}
            onOptionSelect={(_, data) => {
              if (data.optionValue) setCustom(which, 'time', data.optionValue);
            }}
            aria-label={`${label} time`}
          >
            {TIME_OPTIONS.map((option) => (
              <Option key={option.value} value={option.value} text={option.label}>
                {option.label}
              </Option>
            ))}
          </Combobox>
        </div>
      </div>
    );
  };

  const facetSelect = (
    id: string,
    key: keyof DebuggerFilters,
    label: string,
    options: readonly FilterOption[],
  ) => (
    <section className="w-fgroup">
      <h3>
        <label htmlFor={id}>{label}</label>
      </h3>
      <Select
        className="w-select"
        id={id}
        value={String(draft[key])}
        onChange={(_, data) => set(key, data.value as never)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </Select>
    </section>
  );

  return (
    <div className="w-drawer" id="filterPanel">
      <div
        className="w-drawer-surface"
        role="dialog"
        aria-modal="true"
        aria-labelledby="panelTitle"
        tabIndex={-1}
        ref={surfaceRef}
        onKeyDown={handleKeyDown}
      >
        <div className="w-drawer-hdr">
          <h2 id="panelTitle">Advanced filters</h2>
          <Button
            appearance="transparent"
            className="w-iconbtn"
            type="button"
            icon={<Dismiss20Regular className="w-ic" aria-hidden="true" />}
            onClick={onDismiss}
            aria-label="Close"
          />
        </div>

        <div className="w-drawer-body" id="panelBody" ref={bodyRef}>
          {scanError && (
            <MessageBar intent="warning">
              <MessageBarBody>Filter scan failed: {scanError}</MessageBarBody>
            </MessageBar>
          )}
          <section className="w-fgroup">
            <h3>Time range</h3>
            <RadioGroup
              className="w-radios compact"
              value={draft.timeRange}
              onChange={(_, data) => set('timeRange', data.value)}
            >
              {TIME_RANGE_OPTIONS.map((o) => (
                <Radio
                  className="w-radio-fluent"
                  key={o.value || 'all'}
                  value={o.value}
                  label={o.label}
                />
              ))}
            </RadioGroup>
            {draft.timeRange === 'custom' && (
              <div className="w-customwrap">
                {dateField('from', 'From')}
                {dateField('to', 'To')}
                {validationError && (
                  <p className="w-hint" role="alert">
                    {validationError}
                  </p>
                )}
              </div>
            )}
          </section>

          <div className="w-fgrid">
            {facetSelect('pChan', 'channel', 'Channel', CHANNEL_FILTER_OPTIONS)}
            {facetSelect('pOutcome', 'outcome', 'Session outcome', OUTCOME_OPTIONS)}
            {facetSelect('pStype', 'sessionType', 'Session type', SESSION_TYPE_OPTIONS)}
            {facetSelect('pLocale', 'locale', 'Locale', localeOptions)}
          </div>

          <section className="w-fgroup">
            <h3>Step types</h3>
            <p className="w-hint">Only list conversations that contain these step types.</p>
            <div className="w-chips">
              {stepTypes.map((type) => (
                <Button
                  appearance="transparent"
                  type="button"
                  key={type}
                  className="w-chip"
                  role="checkbox"
                  aria-checked={draft.stepTypes.includes(type)}
                  onClick={() => toggleStepType(type)}
                >
                  <i
                    className="w-dot"
                    style={{ background: componentColor(type) }}
                    aria-hidden="true"
                  />
                  {type}
                </Button>
              ))}
            </div>
          </section>

          <section className="w-fgroup">
            <h3>Conversations</h3>
            <div className="w-switchgrid">
              <Switch
                className="w-switch-fluent"
                id="pTwoTurns"
                checked={draft.twoTurnsOnly}
                onChange={(_, data) => set('twoTurnsOnly', data.checked)}
                label="At least 2 user turns"
                title="Only list conversations with two or more user turns"
              />
              <Switch
                className="w-switch-fluent"
                id="pErr"
                checked={draft.errorsOnly}
                onChange={(_, data) => set('errorsOnly', data.checked)}
                label="Error conversations"
                title="Only list conversations that contain an error"
              />
              <Switch
                className="w-switch-fluent"
                id="pSlow"
                checked={draft.slowOnly}
                onChange={(_, data) => set('slowOnly', data.checked)}
                label="Has slow steps (>=10s)"
                title="Only list conversations with a step slower than 10 seconds"
              />
            </div>
          </section>
        </div>

        <div className="w-drawer-actions">
          <Button
            appearance="transparent"
            className="w-btn subtle"
            type="button"
            onClick={() => setDraft({ ...FILTER_DEFAULTS, stepTypes: [] })}
          >
            Reset
          </Button>
          <span style={{ flex: 1 }} />
          <Button appearance="transparent" className="w-btn" type="button" onClick={onDismiss}>
            Cancel
          </Button>
          <Button
            appearance="transparent"
            className="w-btn primary"
            type="button"
            disabled={!!validationError}
            onClick={() => onApply(draft)}
          >
            Apply
          </Button>
        </div>
      </div>
    </div>
  );
}

export default AdvancedFiltersDrawer;
