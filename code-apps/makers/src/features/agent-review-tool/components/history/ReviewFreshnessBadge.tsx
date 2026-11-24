import { Badge } from '@fluentui/react-components';
import type { ReviewFreshness } from '../../contracts/ReviewResult';
import { freshnessLabel } from './reviewHistoryPresentation';

export function ReviewFreshnessBadge({
  freshness,
}: {
  freshness: ReviewFreshness;
}) {
  return (
    <Badge
      appearance="tint"
      color={
        freshness === 'stale'
          ? 'warning'
          : freshness === 'current'
            ? 'success'
            : 'informative'
      }
      size="small"
    >
      {freshnessLabel(freshness)}
    </Badge>
  );
}
