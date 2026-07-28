// Mock implementation of the MCP callTool function for local dev mode.
// Returns shapes that match what the real sf_crm_mcp server returns.

import {
  SAMPLE_LEADS, SAMPLE_ACCOUNTS, SAMPLE_CONTACTS, SAMPLE_OPPORTUNITIES,
  SAMPLE_CASES, SAMPLE_TASKS, SAMPLE_CAMPAIGNS, SAMPLE_APPROVALS,
  SAMPLE_PIPELINE_DASHBOARD,
} from './sample-data';

// In-memory state — survives across calls within a single dev session.
const state = {
  leads:         [...SAMPLE_LEADS],
  accounts:      [...SAMPLE_ACCOUNTS],
  contacts:      [...SAMPLE_CONTACTS],
  opportunities: [...SAMPLE_OPPORTUNITIES],
  cases:         [...SAMPLE_CASES],
  tasks:         [...SAMPLE_TASKS],
  campaigns:     [...SAMPLE_CAMPAIGNS],
  approvals:     [...SAMPLE_APPROVALS],
};

const cacheInfo = () => ({ hit: false, cached_at: new Date().toISOString() });

function genId(prefix: string): string {
  return prefix + Math.random().toString(36).slice(2, 14).padEnd(12, '0');
}

function filterByName<T extends { name?: string }>(items: T[], name?: string): T[] {
  if (!name) return items;
  const q = name.toLowerCase();
  return items.filter(i => i.name?.toLowerCase().includes(q));
}

function findOne<T extends { id: string }>(items: T[], id?: string): T | undefined {
  return id ? items.find(i => i.id === id) : undefined;
}

export async function mockCallTool(name: string, args: any = {}): Promise<any> {
  await new Promise(r => setTimeout(r, 120));

  // ── GET tools ──
  if (name === 'sf__get_leads') {
    let items = state.leads;
    if (args.lead_id) items = items.filter(l => l.id === args.lead_id);
    if (args.company) items = items.filter(l => l.company.toLowerCase().includes(args.company.toLowerCase()));
    if (args.name)    items = items.filter(l => `${l.first_name} ${l.last_name}`.toLowerCase().includes(args.name.toLowerCase()));
    if (args.status)  items = items.filter(l => l.status === args.status);
    if (args.action === 'edit' && items.length === 1) {
      return { type: 'form', entity: 'lead', mode: 'edit', recordId: items[0].id, prefill: items[0] };
    }
    return { type: 'leads', total: items.length, items, _cache: cacheInfo() };
  }
  if (name === 'sf__get_accounts') {
    let items = state.accounts;
    if (args.account_id) items = items.filter(a => a.id === args.account_id);
    if (args.name)       items = filterByName(items, args.name);
    if (args.industry)   items = items.filter(a => a.industry === args.industry);
    if (args.type)       items = items.filter(a => a.type === args.type);
    if (args.action === 'edit' && items.length === 1) {
      return { type: 'form', entity: 'account', mode: 'edit', recordId: items[0].id, prefill: items[0] };
    }
    return { type: 'accounts', total: items.length, items, _cache: cacheInfo() };
  }
  if (name === 'sf__get_contacts') {
    let items = state.contacts;
    if (args.contact_id) items = items.filter(c => c.id === args.contact_id);
    if (args.account_id) items = items.filter(c => c.account_id === args.account_id);
    if (args.name)       items = items.filter(c => `${c.first_name} ${c.last_name}`.toLowerCase().includes(args.name.toLowerCase()));
    if (args.email)      items = items.filter(c => c.email?.toLowerCase().includes(args.email.toLowerCase()));
    return { type: 'contacts', total: items.length, items, _cache: cacheInfo() };
  }
  if (name === 'sf__get_opportunities') {
    let items = state.opportunities;
    if (args.opportunity_id) items = items.filter(o => o.id === args.opportunity_id);
    if (args.account_id)     items = items.filter(o => o.account_id === args.account_id);
    if (args.name)           items = filterByName(items, args.name);
    if (args.stage)          items = items.filter(o => o.stage === args.stage);
    if (args.action === 'edit' && items.length === 1) {
      return { type: 'form', entity: 'opportunity', mode: 'edit', recordId: items[0].id, prefill: items[0] };
    }
    return { type: 'opportunities', total: items.length, items, _cache: cacheInfo() };
  }
  if (name === 'sf__get_cases') {
    let items = state.cases;
    if (args.case_id)     items = items.filter(c => c.id === args.case_id);
    if (args.case_number) items = items.filter(c => c.case_number === args.case_number);
    if (args.account_id)  items = items.filter(c => c.account_id === args.account_id);
    if (args.status)      items = items.filter(c => c.status === args.status);
    if (args.priority)    items = items.filter(c => c.priority === args.priority);
    return { type: 'cases', total: items.length, items, _cache: cacheInfo() };
  }
  if (name === 'sf__get_tasks') {
    let items = state.tasks;
    if (args.task_id) items = items.filter(t => t.id === args.task_id);
    if (args.status)  items = items.filter(t => t.status === args.status);
    return { type: 'tasks', total: items.length, items, _cache: cacheInfo() };
  }
  if (name === 'sf__get_campaigns') {
    let items = state.campaigns;
    if (args.campaign_id) items = items.filter(c => c.id === args.campaign_id);
    if (args.status)      items = items.filter(c => c.status === args.status);
    return { type: 'campaigns', total: items.length, items, _cache: cacheInfo() };
  }
  if (name === 'sf__get_pending_approvals') {
    return { type: 'approvals', total: state.approvals.length, items: state.approvals, _cache: cacheInfo() };
  }
  if (name === 'sf__get_pipeline_dashboard') {
    return SAMPLE_PIPELINE_DASHBOARD;
  }
  if (name === 'sf__get_case_comments') {
    return { type: 'case_activity', case_id: args.case_id, comments: [], tasks: [] };
  }
  if (name === 'sf__get_opportunity_products') {
    return { type: 'opportunity_products', opportunity_id: args.opportunity_id, items: [] };
  }
  if (name === 'sf__get_opportunity_contact_roles') {
    return { type: 'opportunity_contact_roles', opportunity_id: args.opportunity_id, items: [] };
  }

  // ── CREATE / UPDATE ──
  if (name === 'sf__show_create_form') {
    return { type: 'form', entity: args.entity, mode: 'create', prefill: args.prefill || {} };
  }
  if (name === 'sf__create_lead') {
    const newRow = { id: genId('00Q'), ...args };
    state.leads.unshift(newRow);
    return { type: 'success', entity: 'lead', record_id: newRow.id, message: 'Lead created (mock)' };
  }
  if (name === 'sf__update_lead') {
    const idx = state.leads.findIndex(l => l.id === args.lead_id);
    if (idx >= 0) state.leads[idx] = { ...state.leads[idx], ...args };
    return { type: 'success', entity: 'lead', record_id: args.lead_id, message: 'Lead updated (mock)' };
  }
  if (name === 'sf__create_account') {
    const newRow = { id: genId('001'), ...args };
    state.accounts.unshift(newRow);
    return { type: 'success', entity: 'account', record_id: newRow.id, message: 'Account created (mock)' };
  }
  if (name === 'sf__update_account') {
    const idx = state.accounts.findIndex(a => a.id === args.account_id);
    if (idx >= 0) state.accounts[idx] = { ...state.accounts[idx], ...args };
    return { type: 'success', entity: 'account', record_id: args.account_id, message: 'Account updated (mock)' };
  }
  if (name === 'sf__create_contact') {
    const newRow = { id: genId('003'), ...args };
    state.contacts.unshift(newRow);
    return { type: 'success', entity: 'contact', record_id: newRow.id, message: 'Contact created (mock)' };
  }
  if (name === 'sf__update_contact') {
    const idx = state.contacts.findIndex(c => c.id === args.contact_id);
    if (idx >= 0) state.contacts[idx] = { ...state.contacts[idx], ...args };
    return { type: 'success', entity: 'contact', record_id: args.contact_id, message: 'Contact updated (mock)' };
  }
  if (name === 'sf__create_opportunity') {
    const newRow = { id: genId('006'), ...args };
    state.opportunities.unshift(newRow);
    return { type: 'success', entity: 'opportunity', record_id: newRow.id, message: 'Opportunity created (mock)' };
  }
  if (name === 'sf__update_opportunity') {
    const idx = state.opportunities.findIndex(o => o.id === args.opportunity_id);
    if (idx >= 0) state.opportunities[idx] = { ...state.opportunities[idx], ...args };
    return { type: 'success', entity: 'opportunity', record_id: args.opportunity_id, message: 'Opportunity updated (mock)' };
  }
  if (name === 'sf__create_case') {
    const newRow = { id: genId('500'), case_number: String(10000 + state.cases.length), ...args };
    state.cases.unshift(newRow);
    return { type: 'success', entity: 'case', record_id: newRow.id, message: 'Case created (mock)' };
  }
  if (name === 'sf__update_case') {
    const idx = state.cases.findIndex(c => c.id === args.case_id);
    if (idx >= 0) state.cases[idx] = { ...state.cases[idx], ...args };
    return { type: 'success', entity: 'case', record_id: args.case_id, message: 'Case updated (mock)' };
  }
  if (name === 'sf__create_task') {
    const newRow = { id: genId('00T'), ...args };
    state.tasks.unshift(newRow);
    return { type: 'success', entity: 'task', record_id: newRow.id, message: 'Task created (mock)' };
  }
  if (name === 'sf__update_task') {
    const idx = state.tasks.findIndex(t => t.id === args.task_id);
    if (idx >= 0) state.tasks[idx] = { ...state.tasks[idx], ...args };
    return { type: 'success', entity: 'task', record_id: args.task_id, message: 'Task updated (mock)' };
  }
  if (name === 'sf__create_campaign') {
    const newRow = { id: genId('701'), ...args };
    state.campaigns.unshift(newRow);
    return { type: 'success', entity: 'campaign', record_id: newRow.id, message: 'Campaign created (mock)' };
  }
  if (name === 'sf__update_campaign') {
    const idx = state.campaigns.findIndex(c => c.id === args.campaign_id);
    if (idx >= 0) state.campaigns[idx] = { ...state.campaigns[idx], ...args };
    return { type: 'success', entity: 'campaign', record_id: args.campaign_id, message: 'Campaign updated (mock)' };
  }

  // ── Convert / Approvals ──
  if (name === 'sf__convert_lead') {
    const lead = findOne(state.leads, args.lead_id);
    if (lead) lead.status = 'Closed - Converted';
    const newOpp = {
      id: genId('006'),
      name: lead ? `${lead.company} — Converted Opportunity` : 'Converted Opportunity',
      account_id: '001000000000001',
      account_name: lead?.company || 'Unknown',
      stage: 'Qualification',
      amount: 0,
      close_date: '2026-09-30',
      probability: 25,
    };
    if (!args.do_not_create_opportunity) state.opportunities.unshift(newOpp);
    return { type: 'opportunities', total: 1, items: [newOpp], _cache: cacheInfo() };
  }
  if (name === 'sf__approve_record' || name === 'sf__reject_record') {
    state.approvals = state.approvals.filter(a => a.id !== args.approval_id);
    return { type: 'approvals', total: state.approvals.length, items: state.approvals, _cache: cacheInfo() };
  }

  return { error: true, message: `Mock for tool '${name}' is not implemented.` };
}
