// Sample Salesforce data for local dev mode (npm run dev).
// Never imported by the production build — see widgets/vite.config.ts.

export const SAMPLE_LEADS = [
  { id: '00Q000000000001', first_name: 'Cohita',  last_name: 'Mogambo',   company: 'Faraway Inc.',         email: 'cohita@faraway.com',     phone: '(555) 010-2233', status: 'Open - Not Contacted',   lead_source: 'Web' },
  { id: '00Q000000000002', first_name: 'Devin',   last_name: 'Park',      company: 'Northwind Traders',    email: 'devin@northwind.com',    phone: '(555) 010-4455', status: 'Working - Contacted',     lead_source: 'Trade Show' },
  { id: '00Q000000000003', first_name: 'Amelia',  last_name: 'Sato',      company: 'Contoso Industries',   email: 'a.sato@contoso.com',     phone: '(555) 010-6677', status: 'Working - Contacted',     lead_source: 'Referral' },
  { id: '00Q000000000004', first_name: 'Marcus',  last_name: 'Greene',    company: 'Tailspin Toys',        email: 'mgreene@tailspin.io',    phone: '(555) 010-8899', status: 'Open - Not Contacted',   lead_source: 'Web' },
  { id: '00Q000000000005', first_name: 'Priya',   last_name: 'Iyer',      company: 'Adatum Corporation',   email: 'priya@adatum.com',       phone: '(555) 010-3344', status: 'Closed - Converted',      lead_source: 'Partner' },
];

export const SAMPLE_ACCOUNTS = [
  { id: '001000000000001', name: 'Florida International', industry: 'Education',         phone: '(305) 555-1212', website: 'fiu.edu',         billing_city: 'Miami',      type: 'Customer - Direct',     number_of_employees: 4200 },
  { id: '001000000000002', name: 'Contoso Industries',    industry: 'Manufacturing',     phone: '(212) 555-3344', website: 'contoso.com',     billing_city: 'New York',   type: 'Customer - Channel',    number_of_employees: 12000 },
  { id: '001000000000003', name: 'Adatum Corporation',    industry: 'Technology',        phone: '(415) 555-9988', website: 'adatum.com',      billing_city: 'San Francisco', type: 'Customer - Direct',  number_of_employees: 800 },
  { id: '001000000000004', name: 'Tailspin Toys',         industry: 'Retail',            phone: '(206) 555-7766', website: 'tailspin.io',     billing_city: 'Seattle',    type: 'Prospect',              number_of_employees: 220 },
  { id: '001000000000005', name: 'Northwind Traders',     industry: 'Wholesale',         phone: '(617) 555-5544', website: 'northwind.com',   billing_city: 'Boston',     type: 'Customer - Direct',     number_of_employees: 540 },
];

export const SAMPLE_CONTACTS = [
  { id: '003000000000001', first_name: 'Cohita',  last_name: 'Mogambo',   email: 'cohita@faraway.com',      phone: '(555) 010-2233', title: 'Procurement Lead',  account_id: '001000000000001', account_name: 'Florida International' },
  { id: '003000000000002', first_name: 'Devin',   last_name: 'Park',      email: 'devin@northwind.com',     phone: '(555) 010-4455', title: 'VP Operations',     account_id: '001000000000005', account_name: 'Northwind Traders' },
  { id: '003000000000003', first_name: 'Amelia',  last_name: 'Sato',      email: 'a.sato@contoso.com',      phone: '(555) 010-6677', title: 'CTO',               account_id: '001000000000002', account_name: 'Contoso Industries' },
  { id: '003000000000004', first_name: 'Marcus',  last_name: 'Greene',    email: 'mgreene@tailspin.io',     phone: '(555) 010-8899', title: 'Director of IT',    account_id: '001000000000004', account_name: 'Tailspin Toys' },
];

export const SAMPLE_OPPORTUNITIES = [
  { id: '006000000000001', name: 'Florida International — Q3 Renewal', account_id: '001000000000001', account_name: 'Florida International', stage: 'Prospecting',         amount: 0,        close_date: '2026-06-30', probability: 10 },
  { id: '006000000000002', name: 'Contoso — Platform License',         account_id: '001000000000002', account_name: 'Contoso Industries',    stage: 'Qualification',       amount: 250000,   close_date: '2026-08-15', probability: 25 },
  { id: '006000000000003', name: 'Adatum — Onboarding Phase 2',        account_id: '001000000000003', account_name: 'Adatum Corporation',    stage: 'Proposal/Price Quote',amount: 95000,    close_date: '2026-07-01', probability: 50 },
  { id: '006000000000004', name: 'Tailspin Toys — Pilot',              account_id: '001000000000004', account_name: 'Tailspin Toys',         stage: 'Negotiation/Review',  amount: 40000,    close_date: '2026-06-20', probability: 75 },
  { id: '006000000000005', name: 'Northwind — Logistics Module',       account_id: '001000000000005', account_name: 'Northwind Traders',     stage: 'Closed Won',          amount: 180000,   close_date: '2026-05-10', probability: 100 },
];

export const SAMPLE_CASES = [
  { id: '500000000000001', case_number: '00001234', subject: 'Login page returns 500',          status: 'New',        priority: 'High',   account_id: '001000000000002', account_name: 'Contoso Industries',    created_date: '2026-05-19' },
  { id: '500000000000002', case_number: '00001235', subject: 'Invoice PDF rendering off',       status: 'Working',    priority: 'Medium', account_id: '001000000000003', account_name: 'Adatum Corporation',    created_date: '2026-05-18' },
  { id: '500000000000003', case_number: '00001236', subject: 'Cannot reset password',           status: 'Escalated',  priority: 'High',   account_id: '001000000000005', account_name: 'Northwind Traders',     created_date: '2026-05-17' },
  { id: '500000000000004', case_number: '00001237', subject: 'Export to CSV missing columns',   status: 'Closed',     priority: 'Low',    account_id: '001000000000004', account_name: 'Tailspin Toys',         created_date: '2026-05-10' },
];

export const SAMPLE_TASKS = [
  { id: '00T000000000001', subject: 'Follow up with Cohita',   status: 'Not Started', priority: 'High',   activity_date: '2026-05-22', who_id: '003000000000001', what_id: null },
  { id: '00T000000000002', subject: 'Prep proposal for Adatum',status: 'In Progress', priority: 'Medium', activity_date: '2026-05-23', who_id: '003000000000003', what_id: '006000000000003' },
  { id: '00T000000000003', subject: 'Renewal call — Tailspin', status: 'Completed',   priority: 'Low',    activity_date: '2026-05-15', who_id: '003000000000004', what_id: '006000000000004' },
];

export const SAMPLE_CAMPAIGNS = [
  { id: '701000000000001', name: 'Spring 2026 Webinar Series', status: 'In Progress', type: 'Webinar',     start_date: '2026-03-01', end_date: '2026-06-30', number_of_leads: 47 },
  { id: '701000000000002', name: 'Q2 Partner Outreach',        status: 'Planned',     type: 'Email',       start_date: '2026-06-01', end_date: '2026-08-31', number_of_leads: 0 },
  { id: '701000000000003', name: 'Trade Show — Dreamforce',    status: 'Completed',   type: 'Conference',  start_date: '2025-09-15', end_date: '2025-09-18', number_of_leads: 312 },
];

export const SAMPLE_APPROVALS = [
  { id: '0WO000000000001', target_name: 'Contoso — Platform License',  status: 'Pending', created_date: '2026-05-19' },
  { id: '0WO000000000002', target_name: 'Adatum — Onboarding Phase 2', status: 'Pending', created_date: '2026-05-20' },
];

export const SAMPLE_PIPELINE_DASHBOARD = {
  type: 'sales_dashboard' as const,
  pipeline_by_stage: [
    { stage: 'Prospecting',          count: 1, amount: 0 },
    { stage: 'Qualification',        count: 1, amount: 250000 },
    { stage: 'Proposal/Price Quote', count: 1, amount: 95000 },
    { stage: 'Negotiation/Review',   count: 1, amount: 40000 },
    { stage: 'Closed Won',           count: 1, amount: 180000 },
  ],
  closed_won_this_month: 180000,
  closed_lost_this_month: 0,
  top_accounts: [
    { id: '001000000000002', name: 'Contoso Industries', amount: 250000 },
    { id: '001000000000003', name: 'Adatum Corporation', amount: 95000 },
    { id: '001000000000005', name: 'Northwind Traders',  amount: 180000 },
  ],
};
