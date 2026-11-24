import React from 'react';
import { mergeClasses } from '@fluentui/react-components';
import { useContentStyles } from './Layout.styles';

/**
 * Content component props
 */
export interface ContentProps {
  /** Child elements to render in content area */
  children?: React.ReactNode;
  /** Additional CSS class name */
  className?: string;
}

/**
 * Content component - Main content area with radial gradient background
 *
 * This component serves as the container for feature pages. It provides:
 * - Flexible width (flex: 1) to fill remaining space after sidebar
 * - Full viewport height (100vh)
 * - Automatic scrolling for overflow content
 * - Radial gradient background matching Figma design
 *
 * @example
 * ```tsx
 * <Content>
 *   <Routes>
 *     <Route path="/" element={<HomePage />} />
 *     <Route path="/agents" element={<AgentsPage />} />
 *   </Routes>
 * </Content>
 * ```
 */
export const Content = React.forwardRef<HTMLElement, ContentProps>(
  ({ children, className }, ref) => {
    const styles = useContentStyles();

    return (
      <main ref={ref} className={mergeClasses(styles.root, className)}>
        {children}
      </main>
    );
  }
);

Content.displayName = 'Content';
