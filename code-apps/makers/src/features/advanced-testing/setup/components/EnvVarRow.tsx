/**
 * Single environment variable row used by `EnvironmentVariablesTab`.
 *
 * Two-column layout: label on the left, control on the right. The columns
 * are aligned across rows via the shared `gridTemplateColumns` definition
 * below so the inputs form a clean vertical edge regardless of label length.
 * This matches the Power Platform admin center "Environment settings" and
 * Azure portal "Configuration" page conventions.
 *
 * Branches on `envVar.definition.kind`:
 *  - `decimal` → `Input type="number"` with RD-M1 canonicalization.
 *  - `text` with a known allow-list schema (`cat_PowerAutomateEndpoint`) →
 *    `Dropdown` constrained client-side to the four endpoints (RD-8).
 *  - `text` (other) → `Input`.
 *  - `boolean` / `json` → read-only Input echoing the raw value (defensive:
 *    the three Advanced Testing EVs are all text or decimal; this guards
 *    against future inventory drift).
 *
 * Parent owns dirty state (`value` is the current edit), so this component
 * is a pure presentational shell. Per-row save errors are surfaced via a
 * small `MessageBar` directly below the input.
 */

import { useId } from "react";
import {
  Caption1,
  Dropdown,
  Field,
  Input,
  Label,
  MessageBar,
  MessageBarBody,
  Option,
  Tooltip,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import type { EnvironmentVariable } from "../contracts/types";
import {
  POWER_AUTOMATE_ENDPOINT_OPTIONS,
} from "../services/environmentVariableService";

/**
 * Soft cap on inline description length. Longer text is truncated at the
 * nearest word boundary and the full string is exposed via Tooltip on hover
 * or focus. Tooltips render only when truncation actually fired.
 */
const MAX_DESCRIPTION_LENGTH = 100;

function truncateDescription(text: string): { display: string; truncated: boolean } {
  if (text.length <= MAX_DESCRIPTION_LENGTH) return { display: text, truncated: false };
  const sliced = text.slice(0, MAX_DESCRIPTION_LENGTH).replace(/\s+\S*$/, "").trimEnd();
  return { display: `${sliced}\u2026`, truncated: true };
}

const useStyles = makeStyles({
  root: {
    display: "grid",
    // Label column: flexible, capped so very long labels wrap rather than
    // squeezing the control. Control column: capped at a comfortable width
    // (matches Azure portal input width). Gap aligns inputs across rows.
    gridTemplateColumns: "minmax(220px, 0.6fr) minmax(0, 360px)",
    columnGap: tokens.spacingHorizontalXL,
    rowGap: tokens.spacingVerticalXS,
    alignItems: "center",
    paddingTop: tokens.spacingVerticalL,
    paddingBottom: tokens.spacingVerticalL,
    paddingLeft: tokens.spacingHorizontalL,
    paddingRight: tokens.spacingHorizontalL,
  },
  labelStack: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    minWidth: 0,
  },
  label: {
    fontWeight: tokens.fontWeightSemibold,
  },
  description: {
    color: tokens.colorNeutralForeground3,
  },
  controlCell: {
    minWidth: 0,
  },
  fullSpan: {
    gridColumn: "1 / -1",
  },
});

const POWER_AUTOMATE_ENDPOINT_SCHEMA = "cat_PowerAutomateEndpoint";

interface EnvVarRowProps {
  envVar: EnvironmentVariable;
  /** Current edit value as a string. Parent canonicalizes before save. */
  value: string;
  /** Fluent v9 `Field` validation state. */
  validationState?: "none" | "success" | "warning" | "error";
  /** Help text shown beneath the field when set. */
  validationMessage?: string;
  /** Inline error (e.g. last save failure). */
  rowError?: string | null;
  /** Disables the input (e.g. during save). */
  disabled?: boolean;
  /** Mark the field with a required indicator (RD-8 forced-pick mode). */
  required?: boolean;
  onChange: (next: string) => void;
}

export function EnvVarRow({
  envVar,
  value,
  validationState = "none",
  validationMessage,
  rowError,
  disabled = false,
  required = false,
  onChange,
}: EnvVarRowProps) {
  const styles = useStyles();
  const inputId = useId();
  const { definition } = envVar;

  const renderControl = () => {
    if (
      definition.kind === "text" &&
      definition.schemaName === POWER_AUTOMATE_ENDPOINT_SCHEMA
    ) {
      const isOutsideAllowList =
        !!value &&
        !(POWER_AUTOMATE_ENDPOINT_OPTIONS as readonly string[]).includes(value);
      return (
        <Dropdown
          id={inputId}
          value={value}
          selectedOptions={
            (POWER_AUTOMATE_ENDPOINT_OPTIONS as readonly string[]).includes(value)
              ? [value]
              : []
          }
          placeholder={
            isOutsideAllowList
              ? `Current value "${value}" is not a supported region`
              : "Select a Power Automate region"
          }
          disabled={disabled}
          onOptionSelect={(_e, data) => {
            if (data.optionValue) onChange(data.optionValue);
          }}
        >
          {POWER_AUTOMATE_ENDPOINT_OPTIONS.map((opt) => (
            <Option key={opt} value={opt} text={opt}>
              {opt}
            </Option>
          ))}
        </Dropdown>
      );
    }

    if (definition.kind === "decimal") {
      return (
        <Input
          id={inputId}
          type="number"
          inputMode="decimal"
          value={value}
          disabled={disabled}
          onChange={(_e, data) => onChange(data.value)}
        />
      );
    }

    if (definition.kind === "text") {
      return (
        <Input
          id={inputId}
          value={value}
          disabled={disabled}
          onChange={(_e, data) => onChange(data.value)}
        />
      );
    }

    return (
      <Input
        id={inputId}
        value={value}
        readOnly
        disabled
      />
    );
  };

  const description = definition.description?.trim();
  const truncation = description ? truncateDescription(description) : null;
  const descriptionNode = description && truncation ? (
    truncation.truncated ? (
      <Tooltip content={description} relationship="description" withArrow>
        <Caption1 className={styles.description}>{truncation.display}</Caption1>
      </Tooltip>
    ) : (
      <Caption1 className={styles.description}>{truncation.display}</Caption1>
    )
  ) : null;

  return (
    <div className={styles.root}>
      <div className={styles.labelStack}>
        <Label
          htmlFor={inputId}
          required={required}
          className={styles.label}
        >
          {definition.displayName}
        </Label>
        {descriptionNode}
      </div>
      <div className={styles.controlCell}>
        <Field
          validationState={validationState}
          validationMessage={validationMessage}
        >
          {renderControl()}
        </Field>
      </div>
      {rowError ? (
        <div className={styles.fullSpan}>
          <MessageBar intent="error">
            <MessageBarBody>{rowError}</MessageBarBody>
          </MessageBar>
        </div>
      ) : null}
    </div>
  );
}
