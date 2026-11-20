/** Represents a Cloud Flow (workflow) record from the Dataverse `workflows` table. */
export interface CloudFlow {
  /** workflowid (PK) */
  id: string;
  /** name */
  name: string;
  /** statecode: 0 = Draft/Off, 1 = Activated/On, 2 = Suspended */
  statecode: number;
  /** statuscode: 1 = Draft, 2 = Activated, 3 = CompanyDLPViolation */
  statuscode: number;
  /** Derived: statecode === 1 */
  isActivated: boolean;
}
