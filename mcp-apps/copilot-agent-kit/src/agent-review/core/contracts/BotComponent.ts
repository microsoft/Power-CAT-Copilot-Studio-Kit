export interface BotComponent {
  botcomponentid: string;
  botid: string;
  componenttype: string;
  content: string;
  data?: string;
  name: string;
  description?: string;
  componentidunique: string;
  schemaname: string;
  modifiedon?: Date;
  parentbotid?: string;
  parentbotcomponentid?: string;
  filedata?: string;
  filedata_name?: string;
  componentstate?: number;
  statecode?: number;
  statuscode?: number;
  versionnumber?: number;
}
