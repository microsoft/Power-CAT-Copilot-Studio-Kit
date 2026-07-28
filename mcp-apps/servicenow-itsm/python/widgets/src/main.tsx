import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  ErrorBoundary,
  McpBridgeProvider,
  FluentWrapper,
  ToastContainer,
} from '@gtc/mcp-shared';
import type { BrandVariants } from '@fluentui/react-components';
import { ServiceNowApp } from './App';

const serviceNowBrand: BrandVariants = {
  10: '#E6F2EC',
  20: '#C2E0D1',
  30: '#9DCEB6',
  40: '#78BC9B',
  50: '#5EAD87',
  60: '#4A8C6F',
  70: '#3D7A5F',
  80: '#336B53',
  90: '#2A5B46',
  100: '#224C3A',
  110: '#1A3E2F',
  120: '#143025',
  130: '#0E231B',
  140: '#091812',
  150: '#050E0A',
  160: '#020604',
};

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <McpBridgeProvider appName="gtc-snow-widget">
      <FluentWrapper brand={serviceNowBrand}>
        <ToastContainer />
        <ServiceNowApp />
      </FluentWrapper>
    </McpBridgeProvider>
  </ErrorBoundary>
);
