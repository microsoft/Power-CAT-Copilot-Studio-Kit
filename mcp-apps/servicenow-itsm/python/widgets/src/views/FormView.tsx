import React, { useState } from 'react';
import { Button, Field, Input, Spinner, Textarea } from '@fluentui/react-components';
import { SaveRegular } from '@fluentui/react-icons';
import { DatePicker } from '@fluentui/react-datepicker-compat';
import { ExpandButton } from '@gtc/mcp-shared';
import { FkHint } from '@gtc/mcp-shared';
import {
  APPROVAL_OPTIONS,
  CHANGE_CATEGORIES,
  CHANGE_STATES,
  CHANGE_TYPES,
  CHANGE_TYPE_LABELS,
  FORM_LIST_TOOL,
  HR_STATES,
  INCIDENT_STATES,
  PROBLEM_STATES,
  REQUEST_STATES,
  RISK_LABELS,
  RISK_OPTIONS,
} from '../constants';
import { FormSelect } from '../components/FormSelect';
import { NowFooter } from '../components/NowFooter';
import { useStyles } from '../styles';
import { now } from '../theme';

// ── Form View (standalone create form) ──────────────────────────────────────
const FORM_URGENCIES = ['1', '2', '3', '4'];
const FORM_URGENCY_LABELS: Record<string, string> = { '1': '1 – Critical', '2': '2 – High', '3': '3 – Moderate', '4': '4 – Low' };
const FORM_IMPACTS = ['1', '2', '3'];
const FORM_IMPACT_LABELS: Record<string, string> = { '1': '1 – High', '2': '2 – Medium', '3': '3 – Low' };
const FORM_CATEGORIES_LIST = ['inquiry', 'software', 'hardware', 'network', 'database', 'password_reset'];
const FORM_CATEGORY_LABELS: Record<string, string> = {
  inquiry: 'Inquiry', software: 'Software', hardware: 'Hardware', network: 'Network', database: 'Database', password_reset: 'Password Reset',
};

export function FormView({ entity, prefill, mode = 'create', recordId, callTool, toast, theme, renderList }: {
  entity: 'incident' | 'request' | 'change_request' | 'problem' | 'hr_case';
  prefill?: Record<string, string>;
  mode?: 'create' | 'edit';
  recordId?: string;
  callTool: (name: string, args?: Record<string, any>) => Promise<any>;
  toast: (msg: string, type?: 'success' | 'error' | 'info', timeout?: number) => void;
  theme: 'light' | 'dark';
  renderList: (data: any, callTool: (n: string, a?: any) => Promise<any>, toast: (m: string, t?: any, timeout?: number) => void, theme: 'light' | 'dark') => React.ReactNode;
}) {
  const styles = useStyles();
  const t = now(theme);
  // hr_case calls its title field `subject` at the tool surface; other entities call it `short_description`.
  // Use a single state value, branch the label and submit-arg name on entity.
  const [shortDesc, setShortDesc] = useState(prefill?.short_description || prefill?.subject || '');
  const [description, setDescription] = useState(prefill?.description || '');
  // Variable is named `urgency` for historical reasons; the value flows to
  // the tool as the `priority` arg and the tool's prefill key is `priority`.
  // Reading `prefill?.priority` (was `urgency`) so edit-mode actually picks
  // up the current SN value instead of defaulting to '2' (Medium).
  // SN returns choice fields as display strings (e.g. "1 - Critical", "Inquiry")
  // because the list-fetch sets sysparm_display_value=true. Strip to the choice
  // value the dropdown options use so (a) the dropdown shows the right selection
  // and (b) what we send back on save matches what SN expects.
  const [urgency, setUrgency] = useState(prefill?.priority ? String(prefill.priority).charAt(0) : '2');
  const [impact, setImpact] = useState(prefill?.impact ? String(prefill.impact).charAt(0) : '2');
  const [category, setCategory] = useState(prefill?.category ? String(prefill.category).toLowerCase() : '');
  const [changeCategory, setChangeCategory] = useState(prefill?.category || 'Other');
  const [changeType, setChangeType] = useState(prefill?.type || 'normal');
  const [risk, setRisk] = useState(prefill?.risk || '4');
  const [workNote, setWorkNote] = useState('');
  const [callerName, setCallerName] = useState(prefill?.caller_name || '');
  const [assignedToName, setAssignedToName] = useState(prefill?.assigned_to_name || prefill?.assigned_to || '');
  const [requestedForName, setRequestedForName] = useState(prefill?.requested_for_name || prefill?.requested_for || '');
  const [openedForName, setOpenedForName] = useState(prefill?.opened_for_name || prefill?.opened_for || '');
  const [hrServiceName, setHrServiceName] = useState(prefill?.hr_service_name || prefill?.hr_service || '');
  // Consolidated state picker (per-entity options selected below). hr_case had a
  // dedicated hrState hook; folding into one keeps the form layout uniform.
  const [stateValue, setStateValue] = useState(prefill?.state || '');
  const [approval, setApproval] = useState(prefill?.approval || '');
  const [requestState, setRequestState] = useState(prefill?.request_state || '');
  const [dueDate, setDueDate] = useState(prefill?.due_date || '');
  const [plannedStart, setPlannedStart] = useState(prefill?.planned_start_date || prefill?.planned_start || '');
  const [plannedEnd, setPlannedEnd] = useState(prefill?.planned_end_date || prefill?.planned_end || '');
  const [workaround, setWorkaround] = useState(prefill?.workaround || '');
  const [submitting, setSubmitting] = useState(false);
  const [listAfterAction, setListAfterAction] = useState<any | null>(null);

  const isIncident = entity === 'incident';
  const isChange = entity === 'change_request';
  const isProblem = entity === 'problem';
  const isHrCase = entity === 'hr_case';
  const isEdit = mode === 'edit';
  const entityLabel = isIncident ? 'Incident' : isChange ? 'Change Request' : isProblem ? 'Problem' : isHrCase ? 'HR Case' : 'Request';
  const titleFieldLabel = isHrCase ? 'Subject' : 'Short Description';
  const title = `${isEdit ? 'Edit' : 'New'} ${entityLabel}`;
  const titleFieldId = `${mode}-${entity}-title`;
  const descriptionFieldId = `${mode}-${entity}-description`;
  const workNoteFieldId = `${mode}-${entity}-work-note`;
  const callerFieldId = `${mode}-${entity}-caller`;
  const assignedToFieldId = `${mode}-${entity}-assigned-to`;
  const requestedForFieldId = `${mode}-${entity}-requested-for`;
  const openedForFieldId = `${mode}-${entity}-opened-for`;
  const hrServiceFieldId = `${mode}-${entity}-hr-service`;

  const handleSubmit = async () => {
    if (!shortDesc.trim()) { toast('Short Description is required', 'error'); return; }
    setSubmitting(true);
    try {
      let result: any;
      if (isEdit) {
        const toolName = isIncident ? 'sn__update_incident' : isChange ? 'sn__update_change_request' : isProblem ? 'sn__update_problem' : isHrCase ? 'sn__update_hr_case' : 'sn__update_request';
        const args: Record<string, any> = { sys_id: recordId };
        if (isHrCase) args.subject = shortDesc.trim();
        else          args.short_description = shortDesc.trim();
        args.description = description.trim();
        args.priority = urgency;
        if (workNote.trim()) args.work_note = workNote.trim();
        if (stateValue) args.state = stateValue;
        if (isIncident) {
          args.impact = impact;
          args.category = category;
          if (callerName.trim()) args.caller_name = callerName.trim();
          if (assignedToName.trim()) args.assigned_to_name = assignedToName.trim();
        }
        if (isChange)   { args.category = changeCategory; args.type = changeType; args.risk = risk; if (plannedStart) args.planned_start_date = plannedStart; if (plannedEnd) args.planned_end_date = plannedEnd; if (assignedToName.trim()) args.assigned_to_name = assignedToName.trim(); }
        if (isProblem) { if (workaround.trim()) args.workaround = workaround.trim(); if (assignedToName.trim()) args.assigned_to_name = assignedToName.trim(); }
        if (isHrCase) {
          if (openedForName.trim()) args.opened_for_name = openedForName.trim();
          if (assignedToName.trim()) args.assigned_to_name = assignedToName.trim();
          if (hrServiceName.trim()) args.hr_service_name = hrServiceName.trim();
        }
        if (entity === 'request') {
          if (approval)     args.approval = approval;
          if (requestState) { args.request_state = requestState; delete args.state; }
          if (dueDate)      args.due_date = dueDate;
          if (requestedForName.trim()) args.requested_for_name = requestedForName.trim();
        }
        result = await callTool(toolName, args);
      } else if (isIncident) {
        result = await callTool('sn__create_incident', { short_description: shortDesc.trim(), description: description.trim(), priority: urgency, impact, category, ...(stateValue ? { state: stateValue } : {}), ...(callerName.trim() ? { caller_name: callerName.trim() } : {}), ...(assignedToName.trim() ? { assigned_to_name: assignedToName.trim() } : {}) });
      } else if (isChange) {
        result = await callTool('sn__create_change_request', { short_description: shortDesc.trim(), description: description.trim(), category: changeCategory, type: changeType, risk, priority: urgency, ...(stateValue ? { state: stateValue } : {}), ...(plannedStart ? { planned_start_date: plannedStart } : {}), ...(plannedEnd ? { planned_end_date: plannedEnd } : {}), ...(assignedToName.trim() ? { assigned_to_name: assignedToName.trim() } : {}) });
      } else if (isProblem) {
        result = await callTool('sn__create_problem', { short_description: shortDesc.trim(), description: description.trim(), priority: urgency, ...(stateValue ? { state: stateValue } : {}), ...(workaround.trim() ? { workaround: workaround.trim() } : {}), ...(assignedToName.trim() ? { assigned_to_name: assignedToName.trim() } : {}) });
      } else if (isHrCase) {
        result = await callTool('sn__create_hr_case', { subject: shortDesc.trim(), description: description.trim(), priority: urgency, ...(stateValue ? { state: stateValue } : {}), ...(openedForName.trim() ? { opened_for_name: openedForName.trim() } : {}), ...(assignedToName.trim() ? { assigned_to_name: assignedToName.trim() } : {}), ...(hrServiceName.trim() ? { hr_service_name: hrServiceName.trim() } : {}) });
      } else {
        result = await callTool('sn__create_request', { short_description: shortDesc.trim(), description: description.trim(), priority: urgency, ...(dueDate ? { due_date: dueDate } : {}), ...(requestedForName.trim() ? { requested_for_name: requestedForName.trim() } : {}) });
      }
      // Alert path — server returned a non-fatal FK lookup miss with
      // suggestions. Surface persistently and keep the form open so the
      // user can correct the assignee/caller and re-submit.
      // All FK-resolving create/update tools across Incident, Service Request,
      // Change Request, Problem, and HR Case return this shape.
      if (result && result.type === 'alert') {
        toast(result.message || 'Cannot complete — please correct and retry.', 'info', 0);
        return;
      }
      toast(`${entityLabel} ${isEdit ? 'updated' : 'created'} successfully`, 'success');
      // Explicit list refresh after save — matches SF pattern. The update tool's
      // own embedded refresh has occasionally returned empty; an explicit list
      // call is more robust and gives the user immediate confirmation.
      const listTool = FORM_LIST_TOOL[entity];
      if (listTool) {
        try {
          const listRes = await callTool(listTool, { refresh: true });
          if (listRes) setListAfterAction(listRes);
          else if (result) setListAfterAction(result);
        } catch {
          if (result) setListAfterAction(result);
        }
      } else if (result) {
        setListAfterAction(result);
      }
    } catch (e: any) {
      toast(e.message || `Failed to ${isEdit ? 'update' : 'create'} ${entity}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Cancel pivots to the entity's list (no save). The form was opened by an
  // LLM tool call; the natural "back" destination is the list of records.
  const handleCancel = async () => {
    const listTool = FORM_LIST_TOOL[entity];
    if (!listTool) return;
    try {
      const listRes = await callTool(listTool, { refresh: true });
      if (listRes) setListAfterAction(listRes);
    } catch (e: any) {
      toast(e?.message || 'Failed to load list', 'error');
    }
  };

  const formGrid3: React.CSSProperties = {
    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px 20px', marginBottom: '20px',
  };

  if (listAfterAction) {
    const node = renderList(listAfterAction, callTool, toast, theme);
    if (node) return <>{node}</>;
  }

  return (
    <div className={styles.card} style={{ border: `1px solid ${t.border}`, background: t.surface }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: `1px solid ${t.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h2 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: t.text }}>{title}</h2>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <ExpandButton />
        </div>
      </div>

      <div style={{ padding: '16px' }}>
          <div style={{ marginBottom: '12px' }}>
            <label htmlFor={titleFieldId} style={{ color: t.text, fontSize: '12px', fontWeight: 600 }}>{titleFieldLabel} *</label>
            <Input id={titleFieldId} size="small" value={shortDesc} onChange={(_, d) => setShortDesc(d.value)}
              placeholder={`Brief summary of the ${entity.replace('_', ' ')}`}
              style={{ width: '100%', marginTop: '4px' }} />
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label htmlFor={descriptionFieldId} style={{ color: t.text, fontSize: '12px', fontWeight: 600 }}>Description</label>
            <Textarea id={descriptionFieldId} size="small" value={description} onChange={(_, d) => setDescription(d.value)}
              placeholder="Detailed description (optional)" rows={3} resize="vertical"
              style={{ width: '100%', marginTop: '4px' }} />
          </div>
          {isEdit && (
            <div style={{ marginBottom: '12px' }}>
              <label htmlFor={workNoteFieldId} style={{ color: t.text, fontSize: '12px', fontWeight: 600 }}>Work Note <span style={{ color: t.textWeak, fontWeight: 400 }}>(internal — appended to journal)</span></label>
              <Textarea id={workNoteFieldId} size="small" value={workNote} onChange={(_, d) => setWorkNote(d.value)}
                placeholder="Optional internal note…" rows={2} resize="vertical"
                style={{ width: '100%', marginTop: '4px' }} />
            </div>
          )}
          {isEdit && isIncident && (
            <>
              <div style={{ marginBottom: '12px' }}>
                <label htmlFor={callerFieldId} style={{ color: t.text, fontSize: '12px', fontWeight: 600 }}>Caller (type full name)</label>
                <Input id={callerFieldId} size="small" value={callerName} onChange={(_, d) => setCallerName(d.value)} placeholder={prefill?.caller_id || 'e.g. Joe Smith'} style={{ width: '100%', marginTop: '4px' }} />
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label htmlFor={assignedToFieldId} style={{ color: t.text, fontSize: '12px', fontWeight: 600 }}>Assigned To (type full name)</label>
                <Input id={assignedToFieldId} size="small" value={assignedToName} onChange={(_, d) => setAssignedToName(d.value)} placeholder={prefill?.assigned_to || 'e.g. Alice Chen'} style={{ width: '100%', marginTop: '4px' }} />
              </div>
            </>
          )}
          {isEdit && (isChange || isProblem) && (
            <div style={{ marginBottom: '12px' }}>
              <label htmlFor={assignedToFieldId} style={{ color: t.text, fontSize: '12px', fontWeight: 600 }}>Assigned to (type full name)</label>
              <Input id={assignedToFieldId} size="small" value={assignedToName} onChange={(_, d) => setAssignedToName(d.value)} placeholder={prefill?.assigned_to || 'e.g. Alice Chen'} style={{ width: '100%', marginTop: '4px' }} />
            </div>
          )}
          {isEdit && entity === 'request' && (
            <div style={{ marginBottom: '12px' }}>
              <label htmlFor={requestedForFieldId} style={{ color: t.text, fontSize: '12px', fontWeight: 600 }}>Requested for (type full name)</label>
              <Input id={requestedForFieldId} size="small" value={requestedForName} onChange={(_, d) => setRequestedForName(d.value)} placeholder="e.g. Joe Smith" style={{ width: '100%', marginTop: '4px' }} />
            </div>
          )}
          {isEdit && isHrCase && (
            <>
              <div style={{ marginBottom: '12px' }}>
                <label htmlFor={openedForFieldId} style={{ color: t.text, fontSize: '12px', fontWeight: 600 }}>Opened for (type full name)</label>
                <Input id={openedForFieldId} size="small" value={openedForName} onChange={(_, d) => setOpenedForName(d.value)} placeholder="e.g. Joe Smith" style={{ width: '100%', marginTop: '4px' }} />
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label htmlFor={assignedToFieldId} style={{ color: t.text, fontSize: '12px', fontWeight: 600 }}>Assigned to (type full name)</label>
                <Input id={assignedToFieldId} size="small" value={assignedToName} onChange={(_, d) => setAssignedToName(d.value)} placeholder="e.g. Alice Chen" style={{ width: '100%', marginTop: '4px' }} />
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label htmlFor={hrServiceFieldId} style={{ color: t.text, fontSize: '12px', fontWeight: 600 }}>HR Service (type full name)</label>
                <Input id={hrServiceFieldId} size="small" value={hrServiceName} onChange={(_, d) => setHrServiceName(d.value)} placeholder="e.g. VPN Access" style={{ width: '100%', marginTop: '4px' }} />
              </div>
            </>
          )}
          {!isEdit && isIncident && (
            <>
              <div style={{ marginBottom: '12px' }}>
                <label htmlFor={callerFieldId} style={{ color: t.text, fontSize: '12px', fontWeight: 600 }}>Caller (type full name)</label>
                <Input id={callerFieldId} size="small" value={callerName} onChange={(_, d) => setCallerName(d.value)} placeholder="e.g. Joe Smith" style={{ width: '100%', marginTop: '4px' }} />
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label htmlFor={assignedToFieldId} style={{ color: t.text, fontSize: '12px', fontWeight: 600 }}>Assigned To (type full name)</label>
                <Input id={assignedToFieldId} size="small" value={assignedToName} onChange={(_, d) => setAssignedToName(d.value)} placeholder="e.g. Alice Chen" style={{ width: '100%', marginTop: '4px' }} />
              </div>
            </>
          )}
          {!isEdit && (isChange || isProblem) && (
            <div style={{ marginBottom: '12px' }}>
              <label htmlFor={assignedToFieldId} style={{ color: t.text, fontSize: '12px', fontWeight: 600 }}>Assigned to (type full name)</label>
              <Input id={assignedToFieldId} size="small" value={assignedToName} onChange={(_, d) => setAssignedToName(d.value)} placeholder="e.g. Alice Chen" style={{ width: '100%', marginTop: '4px' }} />
            </div>
          )}
          {!isEdit && entity === 'request' && (
            <div style={{ marginBottom: '12px' }}>
              <label htmlFor={requestedForFieldId} style={{ color: t.text, fontSize: '12px', fontWeight: 600 }}>Requested for (type full name)</label>
              <Input id={requestedForFieldId} size="small" value={requestedForName} onChange={(_, d) => setRequestedForName(d.value)} placeholder="e.g. Joe Smith" style={{ width: '100%', marginTop: '4px' }} />
            </div>
          )}
          {!isEdit && isHrCase && (
            <>
              <div style={{ marginBottom: '12px' }}>
                <label htmlFor={openedForFieldId} style={{ color: t.text, fontSize: '12px', fontWeight: 600 }}>Opened for (type full name)</label>
                <Input id={openedForFieldId} size="small" value={openedForName} onChange={(_, d) => setOpenedForName(d.value)} placeholder="e.g. Joe Smith" style={{ width: '100%', marginTop: '4px' }} />
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label htmlFor={assignedToFieldId} style={{ color: t.text, fontSize: '12px', fontWeight: 600 }}>Assigned to (type full name)</label>
                <Input id={assignedToFieldId} size="small" value={assignedToName} onChange={(_, d) => setAssignedToName(d.value)} placeholder="e.g. Alice Chen" style={{ width: '100%', marginTop: '4px' }} />
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label htmlFor={hrServiceFieldId} style={{ color: t.text, fontSize: '12px', fontWeight: 600 }}>HR Service (type full name)</label>
                <Input id={hrServiceFieldId} size="small" value={hrServiceName} onChange={(_, d) => setHrServiceName(d.value)} placeholder="e.g. VPN Access" style={{ width: '100%', marginTop: '4px' }} />
              </div>
            </>
          )}
          <div style={formGrid3}>
            <FormSelect label="Priority" value={urgency} options={FORM_URGENCIES} labels={FORM_URGENCY_LABELS} onChange={setUrgency} theme={theme} disabled />
            {isIncident && <FormSelect label="Impact" value={impact} options={FORM_IMPACTS} labels={FORM_IMPACT_LABELS} onChange={setImpact} theme={theme} />}
            {isIncident && <FormSelect label="Category" value={category} options={FORM_CATEGORIES_LIST} labels={FORM_CATEGORY_LABELS} onChange={setCategory} theme={theme} />}
            {isChange && <FormSelect label="Category" value={changeCategory} options={CHANGE_CATEGORIES} onChange={setChangeCategory} theme={theme} />}
            {isChange && <FormSelect label="Type" value={changeType} options={CHANGE_TYPES} labels={CHANGE_TYPE_LABELS} onChange={setChangeType} theme={theme} />}
            {isChange && <FormSelect label="Risk" value={risk} options={RISK_OPTIONS} labels={RISK_LABELS} onChange={setRisk} theme={theme} />}
            {isEdit && isIncident && <FormSelect label="State" value={stateValue} options={INCIDENT_STATES} onChange={setStateValue} theme={theme} />}
            {!isEdit && isIncident && <FormSelect label="State" value={stateValue} options={INCIDENT_STATES} onChange={setStateValue} theme={theme} />}
            {isEdit && isChange   && <FormSelect label="State" value={stateValue} options={CHANGE_STATES}   onChange={setStateValue} theme={theme} />}
            {!isEdit && isChange  && <FormSelect label="State" value={stateValue} options={CHANGE_STATES}   onChange={setStateValue} theme={theme} />}
            {isEdit && isProblem  && <FormSelect label="State" value={stateValue} options={PROBLEM_STATES}  onChange={setStateValue} theme={theme} />}
            {!isEdit && isProblem && <FormSelect label="State" value={stateValue} options={PROBLEM_STATES}  onChange={setStateValue} theme={theme} />}
            {isEdit && isHrCase   && <FormSelect label="State" value={stateValue || prefill?.state || ''} options={HR_STATES} onChange={setStateValue} theme={theme} />}
            {!isEdit && isHrCase  && <FormSelect label="State" value={stateValue || prefill?.state || ''} options={HR_STATES} onChange={setStateValue} theme={theme} />}
            {isEdit && entity === 'request' && <FormSelect label="Approval" value={approval} options={APPROVAL_OPTIONS} onChange={setApproval} theme={theme} />}
            {isEdit && entity === 'request' && <FormSelect label="Request State" value={requestState} options={REQUEST_STATES} onChange={setRequestState} theme={theme} />}
            {isEdit && entity === 'request' && (
              <Field label="Due Date" size="small">
                <DatePicker size="small" placeholder="Select date" value={dueDate ? new Date(dueDate + 'T00:00:00') : null}                 onSelectDate={(d) => setDueDate(d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` : '')} />
              </Field>
            )}
            {!isEdit && entity === 'request' && (
              <Field label="Due Date" size="small">
                                <DatePicker size="small" placeholder="Select date" value={dueDate ? new Date(dueDate + 'T00:00:00') : null} onSelectDate={(d) => setDueDate(d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` : '')} />
              </Field>
            )}
            {isEdit && isChange && (
              <Field label="Planned Start" size="small">
                <DatePicker size="small" placeholder="Select date" value={plannedStart ? new Date(plannedStart + 'T00:00:00') : null}                 onSelectDate={(d) => setPlannedStart(d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` : '')} />
              </Field>
            )}
            {!isEdit && isChange && (
              <Field label="Planned Start" size="small">
                                <DatePicker size="small" placeholder="Select date" value={plannedStart ? new Date(plannedStart + 'T00:00:00') : null} onSelectDate={(d) => setPlannedStart(d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` : '')} />
              </Field>
            )}
            {isEdit && isChange && (
              <Field label="Planned End" size="small">
                <DatePicker size="small" placeholder="Select date" value={plannedEnd ? new Date(plannedEnd + 'T00:00:00') : null}                 onSelectDate={(d) => setPlannedEnd(d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` : '')} />
              </Field>
            )}
            {!isEdit && isChange && (
              <Field label="Planned End" size="small">
                                <DatePicker size="small" placeholder="Select date" value={plannedEnd ? new Date(plannedEnd + 'T00:00:00') : null} onSelectDate={(d) => setPlannedEnd(d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` : '')} />
              </Field>
            )}
            {isProblem && (
              <Field label="Workaround" size="small" style={{ gridColumn: '1 / -1' }}>
                <Textarea size="small" value={workaround} onChange={(_, d) => setWorkaround(d.value)} placeholder="Optional workaround…" rows={2} resize="vertical" />
              </Field>
            )}
          </div>
          <div className={styles.formActions}>
            <Button size="medium" appearance="secondary" onClick={handleCancel} disabled={submitting}>Cancel</Button>
            <Button size="medium" appearance="primary" onClick={handleSubmit}
              disabled={submitting || !shortDesc.trim()}
              icon={submitting ? <Spinner size="tiny" /> : <SaveRegular />}>
              {submitting ? 'Saving…' : 'Save'}
            </Button>
          </div>
          {isIncident && (
            <FkHint
              fields={[
                { label: 'Caller (type full name)' },
                { label: 'Assigned To (type full name)' },
              ]}
              systemName="ServiceNow"
            />
          )}
          {(isChange || isProblem) && (
            <FkHint
              fields={[{ label: 'Assigned to (type full name)' }]}
              systemName="ServiceNow"
            />
          )}
          {entity === 'request' && (
            <FkHint
              fields={[{ label: 'Requested for (type full name)' }]}
              systemName="ServiceNow"
            />
          )}
          {isHrCase && (
            <FkHint
              fields={[
                { label: 'Opened for (type full name)' },
                { label: 'Assigned to (type full name)' },
                { label: 'HR Service (type full name)' },
              ]}
              systemName="ServiceNow"
            />
          )}
        </div>

      <NowFooter theme={theme} />
    </div>
  );
}
