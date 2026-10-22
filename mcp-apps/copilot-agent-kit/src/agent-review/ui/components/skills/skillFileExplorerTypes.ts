import type { SkillResourceAnalysisView } from '../viewTypes.js';

export interface SkillFileExplorerEntry {
  entryId: string;
  displayPath: string;
  pathKey?: string;
  name: string;
  folder: string;
  sizeBytes: number;
  language?: string;
  kind?: string;
  isSkillDefinition: boolean;
  sourceText?: string;
  sourceOmission?: 'too-large' | 'payload-budget';
  analysisStatus?:
    | 'downloaded'
    | 'queued'
    | 'completed'
    | 'scanned'
    | 'evaluating'
    | 'partial'
    | 'failed'
    | 'skipped'
    | 'oversized'
    | 'cancelled';
  riskLevel?: 'none' | 'info' | 'medium' | 'high' | 'critical';
  readiness?: 'ready' | 'needs-configuration' | 'unsupported' | 'unknown';
  referencedBy: string[];
  analysis?: SkillResourceAnalysisView;
  joinIssue?: string;
}

export interface SkillFilesExplorerModel {
  availability: 'available' | 'historical' | 'empty';
  entries: SkillFileExplorerEntry[];
}
