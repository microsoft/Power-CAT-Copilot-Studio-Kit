/**
 * DAStatCards Component
 *
 * 4 stat cards for the DA tab:
 * - Total Reviewed
 * - Passing (score ≥ 80)
 * - Avg Score
 * - Total Issues
 *
 * Same StatCard component reused from components/core/StatCard.tsx.
 * Per ui-specification.md Section 3.
 */

import { useMemo } from 'react';
import { makeStyles } from '@fluentui/react-components';
import { StatCard } from '../../components/core/StatCard';
import type { DAReviewRecord } from '../contracts/DAReviewRecord';
import { DA_SCORE_THRESHOLDS } from '../contracts/constants';
import { buildDAReviewShellModel } from '../adapters/daReviewShellModel';

const useStyles = makeStyles({
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '16px',
  },
});

export interface DAStatCardsProps {
  reviews: DAReviewRecord[];
  isLoading?: boolean;
}

/**
 * DAStatCards component
 *
 * Derives stat values from DA review records.
 */
export function DAStatCards({ reviews, isLoading = false }: DAStatCardsProps) {
  const styles = useStyles();

  const stats = useMemo(() => {
    const total = reviews.length;
    const reviewModels = reviews.map(buildDAReviewShellModel);
    const scores = reviewModels
      .map((model) => model.score)
      .filter((score): score is number => score !== null);
    const passing = scores.filter(
      (score) => score >= DA_SCORE_THRESHOLDS.PASS,
    );
    const avgScore =
      scores.length > 0
        ? Math.round(
            scores.reduce((sum, score) => sum + score, 0) / scores.length,
          )
        : 0;

    const totalIssues = reviewModels.reduce(
      (sum, model, index) =>
        sum + (reviews[index].totalIssues ?? model.severity.total),
      0,
    );

    return { total, scored: scores.length, passing: passing.length, avgScore, totalIssues };
  }, [reviews]);

  const passingPercent =
    stats.scored > 0 ? Math.round((stats.passing / stats.scored) * 100) : 0;

  return (
    <div className={styles.grid}>
      <StatCard
        label="Total Reviewed"
        value={isLoading ? '--' : stats.total}
        barColor="slot1"
        tooltip="Total Declarative Agents reviewed"
      />
      <StatCard
        label="Passing"
        value={isLoading ? '--' : `${stats.passing} (${passingPercent}%)`}
        barColor="slot2"
        variant={stats.passing > 0 ? 'success' : 'default'}
        tooltip={`Agents with score ≥ ${DA_SCORE_THRESHOLDS.PASS}`}
      />
      <StatCard
        label="Avg Quality Score"
        value={isLoading || stats.scored === 0 ? '--' : stats.avgScore}
        barColor="slot3"
        variant={
          stats.scored === 0
            ? 'default'
            : stats.avgScore >= DA_SCORE_THRESHOLDS.PASS
              ? 'success'
              : stats.avgScore >= DA_SCORE_THRESHOLDS.WARNING
                ? 'warning'
                : 'error'
        }
        tooltip="Average quality score across all scored declarative-agent reviews"
      />
      <StatCard
        label="Total Issues"
        value={isLoading ? '--' : stats.totalIssues}
        barColor="slot7"
        tooltip="Sum of all issues across all DA reviews"
      />
    </div>
  );
}
