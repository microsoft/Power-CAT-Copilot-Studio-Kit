/**
 * GenerateMetricsDialog - Historical backfill dialog for Agent Insights.
 *
 * Allows selecting a configuration (or all), date range, and triggers
 * a metrics generation run by setting cat_actionparameters on the config.
 */

import React, { useState, useMemo, useCallback } from "react";
import {
  makeStyles,
  tokens,
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Input,
  Field,
  Select,
  Body1,
  Body1Strong,
  Label,
  ProgressBar,
  MessageBar,
  MessageBarBody,
  Spinner,
  Tooltip,
} from "@fluentui/react-components";
import { Info16Regular } from "@fluentui/react-icons";
import { useMutation } from "@tanstack/react-query";
import { useConfigurations } from "../../hooks/useConfigurations";
import { AgentConfigService } from "../../services/AgentConfigService";
import { SYNC_FIELDS } from "../../utils/metricDescriptions";

export interface GenerateMetricsDialogProps {
  onClose: () => void;
}

const MAX_DAYS_WARNING = 365;

const useStyles = makeStyles({
  surface: {
    maxWidth: "500px",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalS,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: tokens.spacingHorizontalM,
  },
  dateRow: {
    display: "flex",
    gap: tokens.spacingHorizontalM,
  },
  infoIcon: {
    display: "inline-flex",
    verticalAlign: "middle",
    marginLeft: tokens.spacingHorizontalXXS,
    color: tokens.colorNeutralForeground3,
    cursor: "help",
  },
});

function SyncInfoLabel({ text, info, styles: s }: { text: string; info: string; styles: ReturnType<typeof useStyles> }) {
  return (
    <span>
      {text}
      <Tooltip content={info} relationship="description" withArrow>
        <span className={s.infoIcon}><Info16Regular /></span>
      </Tooltip>
    </span>
  );
}

function daysBetween(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

/** Dialog for triggering historical metrics backfill. */
const GenerateMetricsDialog: React.FC<GenerateMetricsDialogProps> = ({ onClose }) => {
  const styles = useStyles();
  const { data: configs = [] } = useConfigurations();

  const todayDate = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const todayStr = `${todayDate.getFullYear()}-${pad(todayDate.getMonth() + 1)}-${pad(todayDate.getDate())}`;
  const maxPastDate = new Date(todayDate);
  maxPastDate.setDate(maxPastDate.getDate() - MAX_DAYS_WARNING);
  const maxPastStr = `${maxPastDate.getFullYear()}-${pad(maxPastDate.getMonth() + 1)}-${pad(maxPastDate.getDate())}`;
  const oneMonthAgo = new Date(todayDate);
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

  const [selectedConfigId, setSelectedConfigId] = useState("");
  const [startDate, setStartDate] = useState(`${oneMonthAgo.getFullYear()}-${pad(oneMonthAgo.getMonth() + 1)}-${pad(oneMonthAgo.getDate())}`);
  const [endDate, setEndDate] = useState(todayStr);
  const [progress, setProgress] = useState(0);
  const [resultMessage, setResultMessage] = useState<{ intent: "success" | "error"; text: string } | null>(null);

  const daysRange = useMemo(
    () => (startDate && endDate ? daysBetween(startDate, endDate) : 0),
    [startDate, endDate],
  );

  const dateErrors = useMemo(() => {
    const errors: { start?: string; end?: string } = {};
    if (startDate && startDate < maxPastStr) errors.start = "Cannot be older than 365 days";
    if (startDate && startDate > todayStr) errors.start = "Cannot be in the future";
    if (endDate && endDate > todayStr) errors.end = "Cannot be in the future";
    if (startDate && endDate && startDate > endDate) errors.start = "Must be before or equal to End Date";
    return errors;
  }, [startDate, endDate, maxPastStr, todayStr]);

  const showWarning = daysRange > MAX_DAYS_WARNING;
  const isValid =
    selectedConfigId !== "" &&
    startDate !== "" &&
    endDate !== "" &&
    daysRange >= 0 &&
    !dateErrors.start &&
    !dateErrors.end;

  const mutation = useMutation({
    mutationFn: async () => {
      let targetConfigId: string;
      let recordId: string;

      if (selectedConfigId === "all") {
        if (configs.length === 0) throw new Error("No configurations available.");
        targetConfigId = configs[0].cat_copilotconfigurationid;
        recordId = "AllAgents";
      } else {
        targetConfigId = selectedConfigId;
        recordId = selectedConfigId;
      }

      const actionParams = JSON.stringify({
        timestamp: new Date().toISOString(),
        recordId,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
      });

      await AgentConfigService.update(targetConfigId, {
        cat_actionparameters: actionParams,
      });
    },
    onMutate: () => {
      setProgress(50);
    },
    onSuccess: () => {
      setProgress(100);
      setResultMessage({
        intent: "success",
        text: "Historical backfill has been triggered successfully. The flow is running in the background.",
      });
      setTimeout(() => onClose(), 2000);
    },
    onError: (err: Error) => {
      setResultMessage({ intent: "error", text: err.message });
    },
  });

  const handleRun = useCallback(() => {
    setProgress(0);
    setResultMessage(null);
    mutation.mutate();
  }, [mutation]);

  return (
    <Dialog open onOpenChange={(_, d) => { if (!d.open) onClose(); }}>
      <DialogSurface className={styles.surface}>
        <DialogBody>
          <DialogTitle>Generate Metrics - Historical Backfill</DialogTitle>
          <DialogContent>
            <div className={styles.form}>
              <Body1>Extract historical metrics for the selected configuration.</Body1>

              <div className={styles.section}>
                <Body1Strong>CONFIGURATION</Body1Strong>
                <Field label={<SyncInfoLabel text="Select Configuration" info={SYNC_FIELDS.configuration} styles={styles} />} required>
                  <Select
                    aria-label="Select configuration"
                    value={selectedConfigId}
                    onChange={(_, d) => setSelectedConfigId(d.value)}
                    appearance="outline"
                  >
                    <option value="" disabled>Select an agent configuration...</option>
                    <option value="all">All Agents</option>
                    {configs.map((c) => (
                      <option key={c.cat_copilotconfigurationid} value={c.cat_copilotconfigurationid}>
                        {c.cat_name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <div className={styles.section}>
                <Body1Strong>DATE RANGE</Body1Strong>
                <div className={styles.dateRow}>
                  <Field
                    label={<SyncInfoLabel text="Start Date" info={SYNC_FIELDS.startDate} styles={styles} />}
                    required
                    style={{ flex: 1 }}
                    validationState={dateErrors.start ? "error" : undefined}
                    validationMessage={dateErrors.start}
                  >
                    <Input
                      type="date"
                      value={startDate}
                      min={maxPastStr}
                      max={endDate || todayStr}
                      onChange={(_, d) => setStartDate(d.value)}
                      aria-label="Start date"
                      appearance="outline"
                    />
                  </Field>
                  <Field
                    label={<SyncInfoLabel text="End Date" info={SYNC_FIELDS.endDate} styles={styles} />}
                    required
                    style={{ flex: 1 }}
                    validationState={dateErrors.end ? "error" : undefined}
                    validationMessage={dateErrors.end}
                  >
                    <Input
                      type="date"
                      value={endDate}
                      min={startDate || maxPastStr}
                      max={todayStr}
                      onChange={(_, d) => setEndDate(d.value)}
                      aria-label="End date"
                      appearance="outline"
                    />
                  </Field>
                </div>
                {showWarning && (
                  <MessageBar intent="warning">
                    <MessageBarBody>
                      The selected range is {daysRange} days. Ranges over {MAX_DAYS_WARNING} days may take a long time to process.
                    </MessageBarBody>
                  </MessageBar>
                )}
              </div>

              {!mutation.isPending && !resultMessage && daysRange > 0 && (
                <MessageBar intent="info">
                  <MessageBarBody>
                    This will trigger the Historical Backfill flow in background. Estimated time: ~{Math.ceil(daysRange / 10)} minutes (depending on data volume)
                  </MessageBarBody>
                </MessageBar>
              )}

              {mutation.isPending && (
                <div>
                  <Label>Processing...</Label>
                  <ProgressBar value={progress / 100} />
                </div>
              )}

              {resultMessage && (
                <MessageBar intent={resultMessage.intent}>
                  <MessageBarBody>{resultMessage.text}</MessageBarBody>
                </MessageBar>
              )}
            </div>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose} disabled={mutation.isPending}>
              {resultMessage ? "Close" : "Cancel"}
            </Button>
            {!resultMessage && (
              <Button
                appearance="primary"
                onClick={handleRun}
                disabled={!isValid || mutation.isPending}
                icon={mutation.isPending ? <Spinner size="tiny" /> : undefined}
              >
                Run
              </Button>
            )}
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};

export default React.memo(GenerateMetricsDialog);
