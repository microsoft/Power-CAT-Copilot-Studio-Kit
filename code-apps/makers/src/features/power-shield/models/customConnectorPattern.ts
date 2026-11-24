export type DataGroupLabel = 'Non-business' | 'Business' | 'Blocked';

export interface RequestCustomConnectorPattern {
  id: string;
  policyRequestId: string;
  hostUrlPattern: string;
  dataGroup: DataGroupLabel;
  order: number;
}

/** Maps Dataverse cat_datagroup option set values to display labels. */
export const DATA_GROUP_NUM_TO_LABEL: Record<number, DataGroupLabel> = {
  1: 'Non-business',
  2: 'Business',
  3: 'Blocked',
};

/** Maps Dataverse cat_datagroup option set values to DLP API classification strings. */
export const DATA_GROUP_NUM_TO_DLP: Record<number, string> = {
  1: 'General',
  2: 'Confidential',
  3: 'Blocked',
};

/** Maps display labels back to Dataverse option set values. */
export const DATA_GROUP_LABEL_TO_NUM: Record<DataGroupLabel, 1 | 2 | 3> = {
  'Non-business': 1,
  'Business': 2,
  'Blocked': 3,
};
