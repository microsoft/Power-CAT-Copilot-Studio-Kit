import { tokens } from '@fluentui/react-components';

// ── Dropdown options ────────────────────────────────────────────────────────
export const PRIORITIES = ['1', '2', '3', '4'];
export const PRIORITY_LABELS: Record<string, string> = {
  '1': '1 – Critical', '2': '2 – High', '3': '3 – Moderate', '4': '4 – Low',
};
export const INCIDENT_STATES = ['New', 'In Progress', 'On Hold', 'Resolved', 'Closed'];
export const CHANGE_STATES   = ['New', 'Assess', 'Authorize', 'Scheduled', 'Implement', 'Review', 'Closed', 'Canceled'];
export const PROBLEM_STATES  = ['New', 'Assess', 'Root Cause Analysis', 'Fix in Progress', 'Resolved', 'Closed'];
export const HR_STATES       = ['Draft', 'Ready', 'Awaiting Approval', 'Work in Progress', 'Awaiting Acceptance', 'Closed Complete', 'Closed Incomplete', 'Cancelled', 'Suspended'];
export const REQUEST_STATES  = ['Pending Approval', 'Approved', 'Closed Complete', 'Closed Incomplete', 'Closed Cancelled', 'Closed Rejected', 'Closed Skipped'];
export const FORM_LIST_TOOL: Record<string, string> = {
  incident: 'sn__get_incidents', request: 'sn__get_requests',
  change_request: 'sn__get_change_requests', problem: 'sn__get_problems',
  hr_case: 'sn__get_hr_cases',
};
export const CATEGORIES = ['inquiry', 'software', 'hardware', 'network', 'database', 'password_reset'];
export const APPROVAL_OPTIONS = ['not requested', 'requested', 'approved', 'rejected'];
export const CHANGE_CATEGORIES = ['Hardware', 'Software', 'Service', 'System Software', 'Applications Software', 'Network', 'Telecom', 'Documentation', 'Other'];
export const CHANGE_TYPES = ['normal', 'standard', 'emergency'];
export const CHANGE_TYPE_LABELS: Record<string, string> = { normal: 'Normal', standard: 'Standard', emergency: 'Emergency' };
export const RISK_OPTIONS = ['2', '3', '4'];
export const RISK_LABELS: Record<string, string> = { '2': 'High', '3': 'Moderate', '4': 'Low' };
export const HR_PRIORITY_LABELS: Record<string, string> = {
  '1': '1 – Critical', '2': '2 – High', '3': '3 – Moderate', '4': '4 – Low',
};
export const FORM_URGENCIES = ['1', '2', '3', '4'];
export const FORM_URGENCY_LABELS: Record<string, string> = { '1': '1 – Critical', '2': '2 – High', '3': '3 – Moderate', '4': '4 – Low' };
export const FORM_IMPACTS = ['1', '2', '3'];
export const FORM_IMPACT_LABELS: Record<string, string> = { '1': '1 – High', '2': '2 – Medium', '3': '3 – Low' };
export const FORM_CATEGORIES_LIST = ['inquiry', 'software', 'hardware', 'network', 'database', 'password_reset'];
export const FORM_CATEGORY_LABELS: Record<string, string> = {
  inquiry: 'Inquiry', software: 'Software', hardware: 'Hardware', network: 'Network', database: 'Database', password_reset: 'Password Reset',
};

// ── Priority pill styles ────────────────────────────────────────────────────
export type PillStyle = { background: string; color: string; border: string };

export const PRIORITY_STYLES: Record<string, PillStyle> = {
  '1': { background: tokens.colorPaletteRedBackground1,          color: tokens.colorPaletteRedForeground2,          border: tokens.colorPaletteRedBorder1 },
  '2': { background: tokens.colorPaletteDarkOrangeBackground1,    color: tokens.colorPaletteDarkOrangeForeground2,    border: tokens.colorPaletteDarkOrangeBorder1 },
  '3': { background: tokens.colorPaletteYellowBackground1, color: tokens.colorPaletteYellowForeground2, border: tokens.colorPaletteYellowBorder1 },
  '4': { background: tokens.colorPaletteGreenBackground1, color: tokens.colorPaletteGreenForeground2, border: tokens.colorPaletteGreenBorder1 },
};

export const STATE_STYLES: Record<string, PillStyle> = {
  'new':         { background: tokens.colorPaletteCornflowerBackground2,  color: tokens.colorPaletteCornflowerForeground2,  border: tokens.colorPaletteCornflowerBorderActive },
  'in progress': { background: tokens.colorPaletteDarkOrangeBackground1,  color: tokens.colorPaletteDarkOrangeForeground2,  border: tokens.colorPaletteDarkOrangeBorder1 },
  'on hold':     { background: tokens.colorNeutralBackground2,    color: tokens.colorNeutralForeground2,    border: tokens.colorNeutralStroke2 },
  'resolved':    { background: tokens.colorPaletteGreenBackground1,      color: tokens.colorPaletteGreenForeground2,      border: tokens.colorPaletteGreenBorder1 },
  'closed':      { background: tokens.colorNeutralBackground2,    color: tokens.colorNeutralForeground2,    border: tokens.colorNeutralStroke2 },
  'published':   { background: tokens.colorPaletteGreenBackground1,      color: tokens.colorPaletteGreenForeground2,      border: tokens.colorPaletteGreenBorder1 },
  'requested':   { background: tokens.colorPaletteDarkOrangeBackground1,  color: tokens.colorPaletteDarkOrangeForeground2,  border: tokens.colorPaletteDarkOrangeBorder1 },
};

export const APPROVAL_STYLES: Record<string, PillStyle> = {
  'approved':      { background: tokens.colorPaletteGreenBackground1,      color: tokens.colorPaletteGreenForeground2,      border: tokens.colorPaletteGreenBorder1 },
  'requested':     { background: tokens.colorPaletteDarkOrangeBackground1,  color: tokens.colorPaletteDarkOrangeForeground2,  border: tokens.colorPaletteDarkOrangeBorder1 },
  'not requested': { background: tokens.colorNeutralBackground2,    color: tokens.colorNeutralForeground2,    border: tokens.colorNeutralStroke2 },
  'rejected':      { background: tokens.colorPaletteRedBackground1,        color: tokens.colorPaletteRedForeground2,        border: tokens.colorPaletteRedBorder1 },
};

export const RISK_STYLES: Record<string, PillStyle> = {
  'low':    { background: tokens.colorPaletteGreenBackground1,      color: tokens.colorPaletteGreenForeground2,      border: tokens.colorPaletteGreenBorder1 },
  'medium': { background: tokens.colorPaletteDarkOrangeBackground1,  color: tokens.colorPaletteDarkOrangeForeground2,  border: tokens.colorPaletteDarkOrangeBorder1 },
  'high':   { background: tokens.colorPaletteRedBackground1,        color: tokens.colorPaletteRedForeground2,        border: tokens.colorPaletteRedBorder1 },
  '4':      { background: tokens.colorPaletteGreenBackground1,      color: tokens.colorPaletteGreenForeground2,      border: tokens.colorPaletteGreenBorder1 },
  '3':      { background: tokens.colorPaletteDarkOrangeBackground1,  color: tokens.colorPaletteDarkOrangeForeground2,  border: tokens.colorPaletteDarkOrangeBorder1 },
  '2':      { background: tokens.colorPaletteRedBackground1,        color: tokens.colorPaletteRedForeground2,        border: tokens.colorPaletteRedBorder1 },
};
