import React, { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { ErrorFallback } from './ErrorFallback';

interface LazyLoadErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface LazyLoadErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

/**
 * Error Boundary component to catch lazy loading failures gracefully
 * Provides user-friendly error message with retry option
 *
 * @example
 * ```tsx
 * <LazyLoadErrorBoundary>
 *   <Suspense fallback={<LoadingSpinner />}>
 *     <LazyLoadedComponent />
 *   </Suspense>
 * </LazyLoadErrorBoundary>
 * ```
 */
export class LazyLoadErrorBoundary extends Component<
  LazyLoadErrorBoundaryProps,
  LazyLoadErrorBoundaryState
> {
  constructor(props: LazyLoadErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): LazyLoadErrorBoundaryState {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error details for debugging
    console.error('Lazy load error:', error);
    console.error('Error info:', errorInfo);
  }

  handleRetry = (): void => {
    // Reset error state and force a reload
    this.setState({ hasError: false, error: undefined });
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return <ErrorFallback onRetry={this.handleRetry} error={this.state.error} />;
    }

    return this.props.children;
  }
}
