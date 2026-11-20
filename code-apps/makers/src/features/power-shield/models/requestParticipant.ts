import type { ParticipantRole } from './status';

export interface RequestParticipant {
  id: string;                       // cat_policyrequestparticipantid (PK GUID)
  policyRequestId: string;          // cat_policyrequestid (lookup FK)
  participantAadObjectId: string;   // cat_participantaadobjectid (stored as text)
  participantUpn: string;           // cat_participantupn
  role: ParticipantRole;            // cat_role
}

export interface RequestParticipantCreate {
  policyRequestId: string;
  participantAadObjectId: string;
  participantUpn: string;
  role: ParticipantRole;
}
