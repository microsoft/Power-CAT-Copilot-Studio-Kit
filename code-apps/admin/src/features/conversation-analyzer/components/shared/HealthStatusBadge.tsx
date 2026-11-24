import { Badge } from '@fluentui/react-components';
import {
  CheckmarkCircle12Filled,
  DismissCircle12Filled,
  Warning12Filled,
} from '@fluentui/react-icons';
import type { ReactElement } from 'react';
import { HEALTH_BADGE } from '../../contracts/constants';
import type { HealthStatus } from '../../contracts/types';

const HEALTH_ICON: Partial<Record<HealthStatus, ReactElement>> = {
  critical: <DismissCircle12Filled />,
  attention: <Warning12Filled />,
  healthy: <CheckmarkCircle12Filled />,
};

/** Tinted health status badge with icon (AG-4). Badges are reserved for status (G-6). */
export function HealthStatusBadge({ status }: { status: HealthStatus }) {
  const style = HEALTH_BADGE[status];
  return (
    <Badge appearance={style.appearance} color={style.color} icon={HEALTH_ICON[status]} shape="rounded">
      {style.label}
    </Badge>
  );
}
