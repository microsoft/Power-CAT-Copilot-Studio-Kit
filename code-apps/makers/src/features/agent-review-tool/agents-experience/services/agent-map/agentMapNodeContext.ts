import type {
  AgentMapNodeCategory,
} from '../../contracts/AgentMap';
import type { AeSkill } from '../../contracts/AgentsExperienceModel';
import { AgentMapGraphBuilder } from './graphBuilderState';

export interface AgentMapCapability {
  id: string;
  label: string;
  schemaName: string;
  componentId?: string;
  componentIdUnique?: string;
  category: Extract<AgentMapNodeCategory, 'tool' | 'knowledge'>;
}

export interface AgentMapSkillEntry {
  id: string;
  skill: AeSkill;
}

export interface AgentMapNodeContext {
  rootId: string;
  capabilities: AgentMapCapability[];
  skills: AgentMapSkillEntry[];
}

/** Connect one parsed Microsoft Copilot botcomponent directly to the centered bot. */
export function addRootEdge(
  builder: AgentMapGraphBuilder,
  rootId: string,
  targetId: string,
): void {
  builder.addEdge({
    source: rootId,
    target: targetId,
    relationship: 'has component',
    provenance: 'structural',
    evidence: 'This botcomponent was captured in the reviewed Microsoft Copilot agent snapshot.',
    confidence: 1,
    resolution: 'resolved',
    directed: true,
  });
}
