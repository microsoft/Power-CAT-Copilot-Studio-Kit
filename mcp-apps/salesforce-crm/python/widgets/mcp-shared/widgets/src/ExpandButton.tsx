import React from 'react';
import { useMcpBridge } from './McpBridge';
import { ArrowMaximizeRegular, ArrowMinimizeRegular } from '@fluentui/react-icons';
import { Button, Tooltip } from '@fluentui/react-components';

export function ExpandButton() {
  const { canExpand, isFullscreen, requestFullscreen, exitFullscreen } = useMcpBridge();

  if (!canExpand) return null;

  const label = isFullscreen ? 'Exit expanded view' : 'Expand';

  return (
    <Tooltip content={label} relationship="label" positioning="before">
      <Button
        size="small"
        icon={isFullscreen ? <ArrowMinimizeRegular /> : <ArrowMaximizeRegular />}
        onClick={isFullscreen ? exitFullscreen : requestFullscreen}
        aria-label={label}
      />
    </Tooltip>
  );
}
