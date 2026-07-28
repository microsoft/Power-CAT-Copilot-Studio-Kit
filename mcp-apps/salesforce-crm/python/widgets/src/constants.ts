import { tokens } from '@fluentui/react-components';

// ── Constants ──────────────────────────────────────────────────────────────
export const LEAD_STATUSES = ['Open - Not Contacted', 'Working - Contacted', 'Closed - Converted', 'Closed - Not Converted'];
export const LEAD_SOURCES  = ['Web', 'Phone Inquiry', 'Partner Referral', 'External Referral', 'Partner', 'Public Relations', 'Trade Show', 'Word of Mouth', 'Employee Referral', 'Purchased List', 'Other'];
export const OPP_STAGES    = ['Prospecting', 'Qualification', 'Needs Analysis', 'Proposal/Price Quote', 'Negotiation/Review', 'Closed Won', 'Closed Lost'];
export const CASE_STATUSES = ['New', 'Working', 'Escalated', 'Closed'];
export const CASE_PRIOS    = ['High', 'Medium', 'Low'];
export const TASK_STATUSES = ['Not Started', 'In Progress', 'Completed', 'Waiting on someone else', 'Deferred'];
export const TASK_PRIOS    = ['Low', 'Normal', 'High'];
export const ACCT_INDUSTRIES = ['Agriculture', 'Apparel', 'Banking', 'Biotechnology', 'Chemicals', 'Communications', 'Construction', 'Consulting', 'Education', 'Electronics', 'Energy', 'Engineering', 'Entertainment', 'Environmental', 'Finance', 'Food & Beverage', 'Government', 'Healthcare', 'Hospitality', 'Insurance', 'Machinery', 'Manufacturing', 'Media', 'Not For Profit', 'Other', 'Recreation', 'Retail', 'Shipping', 'Technology', 'Telecommunications', 'Transportation', 'Utilities'];
export const ACCT_TYPES    = ['Prospect', 'Customer - Direct', 'Customer - Channel', 'Channel Partner / Reseller', 'Installation Partner', 'Technology Partner', 'Other'];
export const CAMPAIGN_STATUSES = ['Planned', 'In Progress', 'Completed', 'Aborted'];
export const CAMPAIGN_TYPES    = ['Advertising', 'Direct Mail', 'Email', 'Telemarketing', 'Banner Ads', 'Seminar/Conference', 'Public Relations', 'Partners', 'Referral Program', 'Other'];

// ── Status pill styles ─────────────────────────────────────────────────────
// Fluent v9 semantic palette tokens with light/dark auto-swap via FluentProvider.
export type PillStyle = { background: string; color: string; border: string };
export const STATUS_STYLES: Record<string, PillStyle> = {
  open:      { background: tokens.colorPaletteRedBackground1,          color: tokens.colorPaletteRedForeground2,          border: tokens.colorPaletteRedBorder1 },
  contacted: { background: tokens.colorPaletteDarkOrangeBackground1,    color: tokens.colorPaletteDarkOrangeForeground2,    border: tokens.colorPaletteDarkOrangeBorder1 },
  qualified: { background: tokens.colorPaletteGreenBackground1,         color: tokens.colorPaletteGreenForeground2,         border: tokens.colorPaletteGreenBorder1 },
  closed:    { background: tokens.colorPaletteRedBackground1,           color: tokens.colorPaletteRedForeground2,           border: tokens.colorPaletteRedBorder1 },
  warn:      { background: tokens.colorPaletteDarkOrangeBackground1,    color: tokens.colorPaletteDarkOrangeForeground2,    border: tokens.colorPaletteDarkOrangeBorder1 },
};
export function getStatusKey(s: string): string {
  const v = s.toLowerCase();
  if (v.includes('not converted') || v.includes('lost') || v.includes('closed') || v.includes('aborted')) return 'closed';
  if (v.includes('converted') || v.includes('won') || v.includes('qualified') || v.includes('completed')) return 'qualified';
  if (v.includes('working') || v.includes('contacted') || v.includes('needs') || v.includes('proposal') || v.includes('negotiation') || v.includes('escalated') || v.includes('active') || v.includes('in progress')) return 'contacted';
  if (v.includes('high') || v.includes('critical')) return 'warn';
  return 'open';
}
export function fmt$(v: number | null | undefined) { return v == null ? '—' : '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 }); }
export function fmtDate(v?: string | null) { return v ? v.slice(0, 10) : '—'; }


// ── FormView (standalone – from show_create_form tool) ─────────────────────
// ────────────────────────────────────────────────────────────────────────────
export const FORM_DEFS: Record<string, { label: string; key: string; required?: boolean; type?: 'select'; options?: string[]; inputType?: string }[]> = {
  lead: [
    { label: 'First Name', key: 'first_name' }, { label: 'Last Name *', key: 'last_name', required: true },
    { label: 'Company *', key: 'company', required: true }, { label: 'Email', key: 'email', inputType: 'email' },
    { label: 'Phone', key: 'phone' }, { label: 'Status', key: 'status', type: 'select', options: LEAD_STATUSES },
    { label: 'Lead Source', key: 'lead_source', type: 'select', options: LEAD_SOURCES },
  ],
  account: [
    { label: 'Account Name *', key: 'name', required: true }, { label: 'Industry', key: 'industry', type: 'select', options: ACCT_INDUSTRIES },
    { label: 'Phone', key: 'phone' }, { label: 'Website', key: 'website' },
    { label: 'Type', key: 'type', type: 'select', options: ACCT_TYPES }, { label: 'City', key: 'billing_city' },
  ],
  contact: [
    { label: 'First Name', key: 'first_name' }, { label: 'Last Name *', key: 'last_name', required: true },
    { label: 'Email', key: 'email', inputType: 'email' }, { label: 'Phone', key: 'phone' },
    { label: 'Title', key: 'title' }, { label: 'Account (type full name)', key: 'account_name' },
  ],
  opportunity: [
    { label: 'Name *', key: 'name', required: true }, { label: 'Account (type full name)', key: 'account_name' },
    { label: 'Stage', key: 'stage', type: 'select', options: OPP_STAGES }, { label: 'Amount ($)', key: 'amount', inputType: 'number' },
    { label: 'Close Date', key: 'close_date', inputType: 'date' }, { label: 'Probability (%)', key: 'probability', inputType: 'number' },
  ],
  case: [
    { label: 'Subject *', key: 'subject', required: true }, { label: 'Status', key: 'status', type: 'select', options: CASE_STATUSES },
    { label: 'Priority', key: 'priority', type: 'select', options: CASE_PRIOS }, { label: 'Account (type full name)', key: 'account_name' },
    { label: 'Contact (type full name)', key: 'contact_name' },
    { label: 'Description', key: 'description' },
  ],
  task: [
    { label: 'Subject *', key: 'subject', required: true }, { label: 'Status', key: 'status', type: 'select', options: TASK_STATUSES },
    { label: 'Priority', key: 'priority', type: 'select', options: TASK_PRIOS }, { label: 'Due Date', key: 'activity_date', inputType: 'date' },
    { label: 'Name — Contact / Lead (type full name)', key: 'who_name' },
    { label: 'Related To — Account / Opportunity / Campaign (type full name)', key: 'what_name' },
    { label: 'Description', key: 'description' },
  ],
  campaign: [
    { label: 'Name *', key: 'name', required: true },
    { label: 'Status', key: 'status', type: 'select', options: CAMPAIGN_STATUSES },
    { label: 'Type', key: 'type', type: 'select', options: CAMPAIGN_TYPES },
    { label: 'Start Date', key: 'start_date', inputType: 'date' },
    { label: 'End Date', key: 'end_date', inputType: 'date' },
  ],
};

export const FORM_CREATE_TOOL: Record<string, string> = { lead: 'sf__create_lead', account: 'sf__create_account', contact: 'sf__create_contact', opportunity: 'sf__create_opportunity', case: 'sf__create_case', task: 'sf__create_task', campaign: 'sf__create_campaign' };
export const FORM_UPDATE_TOOL: Record<string, string> = { lead: 'sf__update_lead', account: 'sf__update_account', contact: 'sf__update_contact', opportunity: 'sf__update_opportunity', case: 'sf__update_case', task: 'sf__update_task', campaign: 'sf__update_campaign' };
export const FORM_LIST_TOOL: Record<string, string>   = { lead: 'sf__get_leads', account: 'sf__get_accounts', contact: 'sf__get_contacts', opportunity: 'sf__get_opportunities', case: 'sf__get_cases', task: 'sf__get_tasks', campaign: 'sf__get_campaigns' };
export const FORM_ID_PARAM: Record<string, string>    = { lead: 'lead_id', account: 'account_id', contact: 'contact_id', opportunity: 'opportunity_id', case: 'case_id', task: 'task_id', campaign: 'campaign_id' };
export const FORM_ICONS: Record<string, string> = { lead: '👤', account: '🏢', contact: '👥', opportunity: '💰', case: '🎫', task: '✅', campaign: '📣' };
export const FORM_BRAND: Record<string, string> = {
  lead:        tokens.colorPaletteLavenderForeground2,
  account:     tokens.colorPalettePinkForeground2,
  contact:     tokens.colorPaletteMagentaForeground2,
  opportunity: tokens.colorPaletteCornflowerForeground2,
  case:        tokens.colorPaletteDarkOrangeForeground2,
  task:        tokens.colorPaletteTealForeground2,
  campaign:    tokens.colorPaletteMarigoldForeground2,
};
