/**
 * AddAgentDialog - Create or edit an Agent Insights configuration.
 *
 * Single-column form with agent combobox (create mode only),
 * conditional secret/env fields, KPI source checkboxes, and capture switches.
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  makeStyles, tokens, Dialog, DialogSurface, DialogBody, DialogTitle,
  DialogContent, DialogActions, Button, Input, Field, Select, Combobox,
  Option, Checkbox, Switch, Spinner, Label, MessageBar, MessageBarBody, Tooltip,
} from "@fluentui/react-components";
import { Bot20Regular, Info16Regular } from "@fluentui/react-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AgentConfiguration, AgentDetails } from "../../contracts/types";
import { KPI_SOURCE_OPTIONS, SECRET_LOCATION_OPTIONS } from "../../contracts/types";
import { useAgentDetailsSearch } from "../../hooks/useAgentDetails";
import { useConfigurations } from "../../hooks/useConfigurations";
import { queryKeys } from "../../hooks/queryKeys";
import { AgentConfigService } from "../../services/AgentConfigService";
import { ADD_AGENT_FIELDS } from "../../utils/metricDescriptions";

export interface AddAgentDialogProps {
  mode: "create" | "edit";
  editData?: AgentConfiguration;
  onClose: () => void;
}

const useStyles = makeStyles({
  surface: { maxWidth: "500px" },
  actions: { display: "flex", flexWrap: "wrap", gap: tokens.spacingHorizontalS },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: tokens.spacingVerticalM,
  },
  row: {
    display: "flex",
    gap: tokens.spacingHorizontalL,
    alignItems: "flex-start",
  },
  rowItem: {
    flex: "1 1 0",
    minWidth: 0,
  },
  checkboxRow: {
    display: "flex",
    gap: tokens.spacingHorizontalS,
    flexWrap: "wrap",
  },
  groupLabel: {
    display: "block",
    paddingBottom: tokens.spacingVerticalXXS,
  },
  infoIcon: {
    display: "inline-flex",
    verticalAlign: "middle",
    marginLeft: tokens.spacingHorizontalXXS,
    color: tokens.colorNeutralForeground3,
    cursor: "help",
  },
});

interface FormState {
  name: string;
  agentName: string;
  agentDetailsId: string;
  copilotId: string;
  dataverseUrl: string;
  appInsightsAppId: string;
  appInsightsTenantId: string;
  appInsightsClientId: string;
  secretLocationCode: string;
  secret: string;
  environmentVariable: string;
  kpiSourceCodes: string[];
  captureUserDetails: boolean;
  captureUserFeedback: boolean;
}

/** Parse a Dataverse API error into a user-friendly message. */
function parseApiError(error: unknown): { message: string; isDuplicateName: boolean } {
  const raw = (error as Error)?.message ?? String(error);
  try {
    const parsed = JSON.parse(raw);
    const code = parsed?.error?.code ?? "";
    const msg = parsed?.error?.message ?? raw;
    if (code === "0x80060892" || msg.includes("DuplicateRecordEntityKey")) {
      return { message: "An agent configuration with this name already exists", isDuplicateName: true };
    }
    return { message: msg, isDuplicateName: false };
  } catch {
    if (raw.includes("0x80060892") || raw.includes("DuplicateRecordEntityKey")) {
      return { message: "An agent configuration with this name already exists", isDuplicateName: true };
    }
    return { message: raw || "Failed to save configuration. Please try again.", isDuplicateName: false };
  }
}

function initForm(editData?: AgentConfiguration): FormState {
  return {
    name: editData?.cat_name ?? "",
    agentName: editData?.cat_agentname ?? "",
    agentDetailsId: editData?._cat_agents_value ?? "",
    copilotId: editData?.cat_copilotid ?? "",
    dataverseUrl: editData?.cat_dataverseurl ?? "",
    appInsightsAppId: editData?.cat_azureappinsightsapplicationid ?? "",
    appInsightsTenantId: editData?.cat_azureappinsightstenantid ?? "",
    appInsightsClientId: editData?.cat_azureappinsightsclientid ?? "",
    secretLocationCode: String(editData?.cat_azureappinsightssecretlocationcode ?? "1"),
    secret: editData?.cat_azureappinsightssecret ?? "",
    environmentVariable: editData?.cat_azureappinsightsenvironmentvariable ?? "",
    kpiSourceCodes: editData?.cat_kpisourcecodes
      ? editData.cat_kpisourcecodes.split(",").map((s) => s.trim()).filter(Boolean)
      : [],
    captureUserDetails: editData?.cat_iscaptureuserdetailsenabled ?? true,
    captureUserFeedback: editData?.cat_iscaptureuserfeedbackenabled ?? true,
  };
}

/** Renders a field label with an info tooltip icon. */
function InfoLabel({ text, info, styles: s }: { text: string; info: string; styles: ReturnType<typeof useStyles> }) {
  return (
    <span>
      {text}
      <Tooltip content={info} relationship="description" withArrow>
        <span className={s.infoIcon}><Info16Regular /></span>
      </Tooltip>
    </span>
  );
}

/** Dialog for creating or editing an Agent Insights configuration. */
const AddAgentDialog: React.FC<AddAgentDialogProps> = ({ mode, editData, onClose }) => {
  const styles = useStyles();
  const queryClient = useQueryClient();
  const { data: configurations = [] } = useConfigurations();
  const [form, setForm] = useState<FormState>(() => initForm(editData));
  const [agentSearchQuery, setAgentSearchQuery] = useState(editData?.cat_agentname ?? "");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<{ message: string; isDuplicateName: boolean } | null>(null);

  // Debounce search text — 300ms after user stops typing
  useEffect(() => {
    debounceRef.current = setTimeout(() => setDebouncedSearch(agentSearchQuery), 300);
    return () => clearTimeout(debounceRef.current);
  }, [agentSearchQuery]);

  const { data: agentDetailsList = [], isLoading: loadingAgents } = useAgentDetailsSearch(debouncedSearch);

  const isDuplicateName = useMemo(() => {
    const trimmedName = form.name.trim().toLowerCase();
    if (trimmedName === "") return false;
    return configurations.some(
      (c) =>
        c.cat_name.trim().toLowerCase() === trimmedName &&
        (mode === "create" || c.cat_copilotconfigurationid !== editData?.cat_copilotconfigurationid),
    );
  }, [form.name, configurations, mode, editData]);

  const isValid = useMemo(() => {
    if (form.name.trim() === "") return false;
    if (isDuplicateName) return false;
    if (mode === "create" && form.agentDetailsId.trim() === "") return false;
    if (mode === "edit") {
      if (form.agentName.trim() === "") return false;
      if (form.copilotId.trim() === "") return false;
      if (form.dataverseUrl.trim() === "") return false;
    }
    if (form.appInsightsAppId.trim() === "") return false;
    if (form.appInsightsTenantId.trim() === "") return false;
    if (form.appInsightsClientId.trim() === "") return false;
    if (form.secretLocationCode === "") return false;
    if (form.secretLocationCode === "1" && form.secret.trim() === "") return false;
    if (form.secretLocationCode === "2" && form.environmentVariable.trim() === "") return false;
    return true;
  }, [form, mode, isDuplicateName]);

  const updateField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSubmitted(false);
    setServerError(null);
  }, []);

  const handleAgentSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setAgentSearchQuery(e.target.value);
  }, []);

  const handleAgentSelect = useCallback((_: unknown, d: { optionValue?: string; optionText?: string }) => {
    if (!d.optionValue) return;
    const agent = agentDetailsList.find((a: AgentDetails) => a.cat_agentdetailsid === d.optionValue);
    if (agent) {
      const label = `${agent.cat_name}${agent.cat_environmentname ? ` (${agent.cat_environmentname})` : ""}`;
      setAgentSearchQuery(label);
      setForm((prev) => ({
        ...prev,
        agentDetailsId: agent.cat_agentdetailsid,
        agentName: agent.cat_name,
        name: agent.cat_name,
        copilotId: agent.cat_agentid ?? prev.copilotId,
        dataverseUrl: agent.cat_environmenturl ?? prev.dataverseUrl,
      }));
      setSubmitted(false);
      setServerError(null);
    }
  }, [agentDetailsList]);

  const handleKpiSourceToggle = useCallback((value: string, checked: boolean) => {
    setForm((prev) => {
      const current = prev.kpiSourceCodes;
      if (checked) {
        return { ...prev, kpiSourceCodes: current.includes(value) ? current : [...current, value] };
      }
      return { ...prev, kpiSourceCodes: current.filter((c) => c !== value) };
    });
    setSubmitted(false);
    setServerError(null);
  }, []);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload: Partial<AgentConfiguration> = {
        cat_name: form.name,
        cat_agentname: form.agentName,
        cat_copilotid: form.copilotId,
        cat_dataverseurl: form.dataverseUrl,
        cat_azureappinsightsapplicationid: form.appInsightsAppId || undefined,
        cat_azureappinsightstenantid: form.appInsightsTenantId || undefined,
        cat_azureappinsightsclientid: form.appInsightsClientId || undefined,
        cat_azureappinsightssecretlocationcode: Number(form.secretLocationCode),
        cat_azureappinsightssecret: form.secretLocationCode === "1" ? form.secret || undefined : undefined,
        cat_azureappinsightsenvironmentvariable: form.secretLocationCode === "2" ? form.environmentVariable || undefined : undefined,
        cat_configurationtypescodes: "4",
        cat_kpisourcecodes: form.kpiSourceCodes.length > 0 ? form.kpiSourceCodes.join(",") : undefined,
        cat_iscaptureuserdetailsenabled: form.captureUserDetails,
        cat_iscaptureuserfeedbackenabled: form.captureUserFeedback,
      };
      if (mode === "edit" && editData) {
        return AgentConfigService.update(editData.cat_copilotconfigurationid, payload);
      }
      return AgentConfigService.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agentConfigurations() });
      onClose();
    },
    onError: (error: unknown) => {
      setServerError(parseApiError(error));
    },
  });

  const handleSave = useCallback(() => {
    setSubmitted(true);
    mutation.reset();
    if (isValid) mutation.mutate();
  }, [isValid, mutation]);

  return (
    <Dialog open onOpenChange={(_, d) => { if (!d.open) onClose(); }}>
      <DialogSurface className={styles.surface}>
        <DialogBody>
          <DialogTitle>
            <Bot20Regular />
            {" "}
            {mode === "edit" ? "Edit Agent Configuration" : "Add Agent Configuration"}
          </DialogTitle>
          <DialogContent>
            <div className={styles.form}>
              {serverError && !serverError.isDuplicateName && (
                <MessageBar intent="error">
                  <MessageBarBody>{serverError.message}</MessageBarBody>
                </MessageBar>
              )}
              {mode === "create" && (
                <Field
                  label={<InfoLabel text="Agent" info={ADD_AGENT_FIELDS.agent} styles={styles} />}
                  required
                  validationMessage={submitted && form.agentDetailsId.trim() === "" ? "Agent is required" : undefined}
                  validationState={submitted && form.agentDetailsId.trim() === "" ? "error" : undefined}
                >
                  <Combobox
                    aria-label="Select agent"
                    placeholder={loadingAgents ? "Searching agents..." : "Type to search agents..."}
                    value={agentSearchQuery}
                    onChange={handleAgentSearchChange}
                    onOptionSelect={handleAgentSelect}
                    freeform
                    appearance="outline"
                  >
                    {agentDetailsList.map((a) => (
                      <Option
                        key={a.cat_agentdetailsid}
                        value={a.cat_agentdetailsid}
                        text={`${a.cat_name}${a.cat_environmentname ? ` (${a.cat_environmentname})` : ""}`}
                      >
                        {a.cat_name}{a.cat_environmentname ? ` (${a.cat_environmentname})` : ""}
                      </Option>
                    ))}
                  </Combobox>
                </Field>
              )}

              <Field
                label={<InfoLabel text="Name" info={ADD_AGENT_FIELDS.name} styles={styles} />}
                required
                validationMessage={
                  submitted && form.name.trim() === ""
                    ? "Name is required"
                    : (submitted && isDuplicateName) || serverError?.isDuplicateName
                      ? "An agent configuration with this name already exists"
                      : undefined
                }
                validationState={
                  (submitted && (form.name.trim() === "" || isDuplicateName)) || serverError?.isDuplicateName
                    ? "error" : undefined
                }
              >
                <Input
                  value={form.name}
                  onChange={(_, d) => updateField("name", d.value)}
                  appearance="outline"
                  aria-label="Configuration name"
                />
              </Field>

              {mode === "edit" && (
                <>
                  <Field
                    label={<InfoLabel text="Agent Name" info={ADD_AGENT_FIELDS.agentName} styles={styles} />}
                    required
                    validationMessage={submitted && form.agentName.trim() === "" ? "Agent Name is required" : undefined}
                    validationState={submitted && form.agentName.trim() === "" ? "error" : undefined}
                  >
                    <Input
                      value={form.agentName}
                      onChange={(_, d) => updateField("agentName", d.value)}
                      appearance="outline"
                      aria-label="Agent Name"
                    />
                  </Field>
                  <Field
                    label={<InfoLabel text="Agent Id" info={ADD_AGENT_FIELDS.agentId} styles={styles} />}
                    required
                    validationMessage={submitted && form.copilotId.trim() === "" ? "Agent Id is required" : undefined}
                    validationState={submitted && form.copilotId.trim() === "" ? "error" : undefined}
                  >
                    <Input
                      value={form.copilotId}
                      onChange={(_, d) => updateField("copilotId", d.value)}
                      appearance="outline"
                      aria-label="Agent Id"
                    />
                  </Field>
                  <Field
                    label={<InfoLabel text="Dataverse Url" info={ADD_AGENT_FIELDS.dataverseUrl} styles={styles} />}
                    required
                    validationMessage={submitted && form.dataverseUrl.trim() === "" ? "Dataverse Url is required" : undefined}
                    validationState={submitted && form.dataverseUrl.trim() === "" ? "error" : undefined}
                  >
                    <Input
                      value={form.dataverseUrl}
                      onChange={(_, d) => updateField("dataverseUrl", d.value)}
                      appearance="outline"
                      aria-label="Dataverse Url"
                    />
                  </Field>
                </>
              )}

              <Field
                label={<InfoLabel text="App Insights Application ID" info={ADD_AGENT_FIELDS.appInsightsAppId} styles={styles} />}
                required
                validationMessage={submitted && form.appInsightsAppId.trim() === "" ? "Application ID is required" : undefined}
              >
                <Input
                  value={form.appInsightsAppId}
                  onChange={(_, d) => updateField("appInsightsAppId", d.value)}
                  appearance="outline"
                  aria-label="App Insights Application ID"
                />
              </Field>

              <Field
                label={<InfoLabel text="App Insights Tenant ID" info={ADD_AGENT_FIELDS.appInsightsTenantId} styles={styles} />}
                required
                validationMessage={submitted && form.appInsightsTenantId.trim() === "" ? "Tenant ID is required" : undefined}
              >
                <Input
                  value={form.appInsightsTenantId}
                  onChange={(_, d) => updateField("appInsightsTenantId", d.value)}
                  appearance="outline"
                  aria-label="App Insights Tenant ID"
                />
              </Field>

              <Field
                label={<InfoLabel text="App Insights Client ID" info={ADD_AGENT_FIELDS.appInsightsClientId} styles={styles} />}
                required
                validationMessage={submitted && form.appInsightsClientId.trim() === "" ? "Client ID is required" : undefined}
              >
                <Input
                  value={form.appInsightsClientId}
                  onChange={(_, d) => updateField("appInsightsClientId", d.value)}
                  appearance="outline"
                  aria-label="App Insights Client ID"
                />
              </Field>

              <Field label={<InfoLabel text="App Insights Secret Location" info={ADD_AGENT_FIELDS.secretLocation} styles={styles} />} required>
                <Select
                  value={form.secretLocationCode}
                  onChange={(_, d) => updateField("secretLocationCode", d.value)}
                  appearance="outline"
                  aria-label="Secret location"
                >
                  {SECRET_LOCATION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </Select>
              </Field>

              {form.secretLocationCode === "1" && (
                <Field
                  label={<InfoLabel text="App Insights Secret" info={ADD_AGENT_FIELDS.secret} styles={styles} />}
                  required
                  validationMessage={submitted && form.secret.trim() === "" ? "Secret is required" : undefined}
                >
                  <Input
                    value={form.secret}
                    onChange={(_, d) => updateField("secret", d.value)}
                    type="password"
                    appearance="outline"
                    aria-label="App Insights Secret"
                  />
                </Field>
              )}

              {form.secretLocationCode === "2" && (
                <Field
                  label={<InfoLabel text="Environment Variable" info={ADD_AGENT_FIELDS.environmentVariable} styles={styles} />}
                  required
                  validationMessage={submitted && form.environmentVariable.trim() === "" ? "Environment Variable is required" : undefined}
                >
                  <Input
                    value={form.environmentVariable}
                    onChange={(_, d) => updateField("environmentVariable", d.value)}
                    appearance="outline"
                    aria-label="Environment Variable"
                  />
                </Field>
              )}

              <div role="group" aria-labelledby="kpi-source-label">
                <Label id="kpi-source-label" weight="semibold" className={styles.groupLabel}>
                  KPI Source
                  <Tooltip content={ADD_AGENT_FIELDS.kpiSource} relationship="description" withArrow>
                    <span className={styles.infoIcon}><Info16Regular /></span>
                  </Tooltip>
                </Label>
                <div className={styles.checkboxRow}>
                  {KPI_SOURCE_OPTIONS.map((o) => (
                    <Checkbox
                      key={o.value}
                      label={o.label}
                      checked={form.kpiSourceCodes.includes(o.value)}
                      onChange={(_, d) => handleKpiSourceToggle(o.value, !!d.checked)}
                    />
                  ))}
                </div>
              </div>

              <div className={styles.row}>
                <Field label={<InfoLabel text="Capture User Details" info={ADD_AGENT_FIELDS.captureUserDetails} styles={styles} />} className={styles.rowItem}>
                  <Switch
                    checked={form.captureUserDetails}
                    onChange={(_, d) => updateField("captureUserDetails", d.checked)}
                    label={form.captureUserDetails ? "Yes" : "No"}
                  />
                </Field>
                <Field label={<InfoLabel text="Capture User Feedback" info={ADD_AGENT_FIELDS.captureUserFeedback} styles={styles} />} className={styles.rowItem}>
                  <Switch
                    checked={form.captureUserFeedback}
                    onChange={(_, d) => updateField("captureUserFeedback", d.checked)}
                    label={form.captureUserFeedback ? "Yes" : "No"}
                  />
                </Field>
              </div>
            </div>
          </DialogContent>
          <DialogActions className={styles.actions}>
            <Button appearance="secondary" onClick={onClose} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button
              appearance="primary"
              onClick={handleSave}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? <Spinner size="tiny" /> : "Save"}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};

export default React.memo(AddAgentDialog);
