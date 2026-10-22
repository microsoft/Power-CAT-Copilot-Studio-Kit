import { useState } from 'react';
import {
  Tab,
  TabList,
  Text,
  makeStyles,
  shorthands,
  tokens,
} from '@fluentui/react-components';
import { skillScorePercent } from './skillHelpers.js';
import type { SkillView, SkillsGroupedView } from './viewTypes.js';
import { SkillsGrouped } from './skills/SkillsGrouped.js';
import { SkillsListView } from './skills/SkillsListView.js';

/**
 * Skill evaluator (spec 013). Grouped-by-rubric-dimension view (default) with a
 * cross-skill orchestration section, plus a "By skill" accordion alternative.
 */

const useStyles = makeStyles({
  intro: { ...shorthands.padding('14px', '20px', 0), color: tokens.colorNeutralForeground2, fontSize: '12.5px' },
  summaryStrip: { display: 'flex', ...shorthands.gap('24px'), ...shorthands.padding('14px', '20px', '4px'), flexWrap: 'wrap' },
  summaryItem: { fontSize: '12.5px', color: tokens.colorNeutralForeground2 },
  summaryValue: { display: 'block', fontSize: '16px', fontWeight: 600, color: tokens.colorNeutralForeground1 },
  modeBar: { ...shorthands.padding('6px', '20px', 0) },
  body: { ...shorthands.padding('12px', '20px', '18px') },
});

export interface SkillsTabProps {
  grouped: SkillsGroupedView;
  skills: SkillView[];
  onOpenFinding: (findingId: string) => void;
}

export function SkillsTab({ grouped, skills, onOpenFinding }: SkillsTabProps) {
  const styles = useStyles();
  const [mode, setMode] = useState<'grouped' | 'byskill'>('grouped');

  const gradedSkills = skills
    .map((s) => ({ skill: s, pct: skillScorePercent(s) }))
    .filter((entry): entry is { skill: SkillView; pct: number } => entry.pct !== null);
  const avg = gradedSkills.length
    ? Math.round(gradedSkills.reduce((acc, entry) => acc + entry.pct, 0) / gradedSkills.length)
    : null;
  const flagged = skills.filter((s) => s.safetyFlagged).length;
  const allDims = skills.flatMap((s) => s.dimensions);
  const globalWeakest = allDims.length
    ? allDims.reduce((min, d) => (d.score < min.score ? d : min))
    : null;

  return (
    <section aria-label="Skill evaluator">
      <Text block className={styles.intro}>
        Rubric-based quality assessment of each skill. An LLM-as-judge scores four dimensions,
        alongside an upload-safety scan and set-level orchestration checks.
      </Text>

      <div className={styles.summaryStrip}>
        <span className={styles.summaryItem}>
          <span className={styles.summaryValue}>{gradedSkills.length} of {skills.length}</span>skills evaluated
        </span>
        <span className={styles.summaryItem}>
          <span className={styles.summaryValue}>{avg !== null ? `${avg}%` : 'Not available'}</span>average quality
        </span>
        <span className={styles.summaryItem}>
          <span className={styles.summaryValue}>{flagged}</span>safety flag
        </span>
        <span className={styles.summaryItem}>
          <span className={styles.summaryValue}>{globalWeakest ? globalWeakest.key : '\u2014'}</span>weakest dimension
        </span>
        <span className={styles.summaryItem}>
          <span className={styles.summaryValue}>{grouped.orchestration.length}</span>orchestration findings
        </span>
      </div>

      <div className={styles.modeBar}>
        <TabList selectedValue={mode} onTabSelect={(_, d) => setMode(d.value as 'grouped' | 'byskill')} size="small">
          <Tab value="grouped">Group by pattern</Tab>
          <Tab value="byskill">By skill</Tab>
        </TabList>
      </div>

      <div className={styles.body}>
        {mode === 'grouped' ? (
          <SkillsGrouped grouped={grouped} />
        ) : (
          <SkillsListView skills={skills} onOpenFinding={onOpenFinding} />
        )}
      </div>
    </section>
  );
}
