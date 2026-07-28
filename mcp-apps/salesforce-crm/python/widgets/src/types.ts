// ── Salesforce Entity Types ───────────────────────────────────────────────

export interface Account {
  id: string;
  Name: string;
  Industry?: string;
  Phone?: string;
  Website?: string;
  BillingCity?: string;
  Type?: string;
  NumberOfEmployees?: number | null;
}

export interface Lead {
  id: string;
  FirstName?: string;
  LastName: string;
  Company: string;
  Email?: string;
  Phone?: string;
  Status: string;
  LeadSource?: string;
  // legacy snake_case aliases (kept for backward compat)
  first_name?: string;
  last_name?: string;
  company?: string;
  email?: string;
  phone?: string;
  status?: string;
  lead_source?: string;
}

export interface Contact {
  id: string;
  FirstName?: string;
  LastName: string;
  Email?: string;
  Phone?: string;
  Title?: string;
  AccountId?: string;
  account_name?: string;
}

export interface Opportunity {
  id: string;
  Name: string;
  AccountId?: string;
  account_name?: string;
  StageName: string;
  Amount?: number | null;
  CloseDate?: string;
  Probability?: number | null;
  // legacy snake_case aliases
  name?: string;
  stage?: string;
  amount?: number | null;
  close_date?: string;
  probability?: number | null;
}

export interface Case {
  id: string;
  CaseNumber?: string;
  Subject: string;
  Status: string;
  Priority: string;
  AccountId?: string;
  account_name?: string;
  CreatedDate?: string;
}

export interface Task {
  id: string;
  Subject: string;
  Status: string;
  Priority: string;
  ActivityDate?: string;
  WhoId?: string;
  WhatId?: string;
}

export interface Campaign {
  id: string;
  Name: string;
  Status: string;
  Type?: string;
  StartDate?: string;
  EndDate?: string;
  NumberOfLeads?: number | null;
}

export interface CaseComment {
  id: string;
  Body: string;
  CreatedDate?: string;
  created_by_name?: string;
}

// ── Approval ──────────────────────────────────────────────────────────────
export interface Approval {
  id: string;
  target_name?: string;
  Status?: string;
  CreatedDate?: string;
}

// ── List data ─────────────────────────────────────────────────────────────
export interface SfListData {
  type: 'accounts' | 'leads' | 'contacts' | 'opportunities' | 'cases' | 'tasks' | 'campaigns' | 'approvals' | 'case_activity';
  total?: number;
  items: any[];
  error?: boolean;
  message?: string;
  _createdId?: string;
}

// ── Form data ─────────────────────────────────────────────────────────────
export interface SfFormData {
  type: 'form';
  entity: 'account' | 'lead' | 'contact' | 'opportunity' | 'case' | 'task' | 'campaign';
  prefill?: Record<string, string>;
}

// ── Dashboard data ────────────────────────────────────────────────────────
export interface SalesDashboardData {
  type: 'sales_dashboard';
  pipeline_by_stage: { stage: string; count: number; amount: number }[];
  closed_won_this_month: number;
  closed_lost_this_month: number;
  top_accounts: { id: string; name: string; amount: number }[];
}

// ── Lead Convert result ────────────────────────────────────────────────────
export interface LeadConvertData {
  type: 'lead_convert';
  leadId: string;
  accountId: string;
  contactId: string;
  opportunityId?: string;
}

// ── Error data ────────────────────────────────────────────────────────────
export interface SfErrorData {
  error: true;
  message: string;
  type?: string;
}

// ── Union type ────────────────────────────────────────────────────────────
export type SfData =
  | SfListData
  | SfFormData
  | SalesDashboardData
  | LeadConvertData
  | SfErrorData;
