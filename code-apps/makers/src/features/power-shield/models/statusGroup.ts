import type { RequestStatus } from './status';

/** A named group of statuses used for tile filtering and status dropdowns */
export interface StatusGroupDef {
  label: string;
  statuses: RequestStatus[];
}

/** Status groups for Home and My Requests screens */
export const HOME_STATUS_GROUPS: StatusGroupDef[] = [
  { label: 'Pending', statuses: ['Draft', 'Submitted', 'UnderReview', 'AutoRejected'] },
  { label: 'Completed',     statuses: ['Approved', 'Implementing', 'Implemented'] },
  { label: 'Policy Failed', statuses: ['ImplementedWithErrors'] },
  { label: 'Rejected', statuses: ['Rejected'] },
  { label: 'Withdrawn', statuses: ['Withdrawn'] },
];

/** Status groups for Admin Review screen */
export const ADMIN_REVIEW_STATUS_GROUPS: StatusGroupDef[] = [
  { label: 'Awaiting Review', statuses: ['Submitted'] },
  { label: 'Under Review', statuses: ['UnderReview'] },
  { label: 'In Progress', statuses: ['Approved', 'Implementing'] },
  { label: 'Needs Attention', statuses: ['AutoRejected', 'ImplementedWithErrors'] },
];
