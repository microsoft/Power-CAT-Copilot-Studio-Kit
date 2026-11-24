import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readComponent = (relativePath: string): string =>
  readFileSync(resolve(__dirname, '../components', relativePath), 'utf-8');

const findingsSource = readComponent('findings/FindingsGrouped.tsx');
const skillsSource = readComponent('skills/SkillsGrouped.tsx');
const agentMapSource = readComponent('agent-map/AgentMapInspector.tsx');
const checksSource = readComponent('ChecksPanel.tsx');
const exportSource = readFileSync(
  resolve(__dirname, '../utils/copilotReviewExport.ts'),
  'utf-8',
);

describe('rule id presentation', () => {
  it('hides technical rule ids from review findings', () => {
    expect(findingsSource).not.toContain(
      '<span className={styles.rowId}>{finding.id}</span>',
    );
  });

  it('hides technical rule ids from the skill evaluator', () => {
    expect(skillsSource).not.toContain(
      '<span className={styles.rowId}>{ruleId}</span>',
    );
    expect(skillsSource).not.toContain(
      '<span className={styles.rowId}>{pattern.ruleId}</span>',
    );
    expect(skillsSource).not.toContain(
      '<span className={styles.rowId}>{orch.ruleId}</span>',
    );
  });

  it('hides technical rule ids from the agent map inspector', () => {
    expect(agentMapSource).not.toContain(
      '<Caption1 className={styles.findingRule}>{finding.id}</Caption1>',
    );
  });

  it('uses plain-language labels in All checks', () => {
    expect(checksSource).toContain('ruleDisplayLabel(row.ruleId, row.family)');
    expect(checksSource).not.toContain(
      '<Text className={styles.ruleId}>{row.ruleId}</Text>',
    );
  });

  it('retains rule ids in the technical Excel export', () => {
    expect(exportSource).toContain(
      "{ header: 'Rule ID', key: 'ruleId', width: 14 }",
    );
  });
});
