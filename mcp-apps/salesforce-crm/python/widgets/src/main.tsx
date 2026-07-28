import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  ErrorBoundary,
  McpBridgeProvider,
  FluentWrapper,
  ToastContainer,
} from '@gtc/mcp-shared';
import { SalesforceApp } from './App';

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <McpBridgeProvider appName="gtc-sf-widget">
      <FluentWrapper>
        <ToastContainer />
        <SalesforceApp />
      </FluentWrapper>
    </McpBridgeProvider>
  </ErrorBoundary>
);
