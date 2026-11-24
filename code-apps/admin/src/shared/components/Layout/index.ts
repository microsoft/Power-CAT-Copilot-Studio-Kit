/**
 * Application Layout (AppShell) Components
 *
 * This module provides the main application layout structure with:
 * - Layout: Root container with sidebar and content area
 * - AppNav: Sidebar navigation with Fluent UI Nav component
 * - Content: Main content area with radial gradient background
 *
 * @module Layout
 */

export { Layout } from './Layout';
export type { LayoutProps } from './Layout';

export { AppNav } from './AppNav';
export type { AppNavProps } from './AppNav';

export { Content } from './Content';
export type { ContentProps } from './Content';

export {
  useLayoutStyles,
  useContentStyles,
  useHeaderPlaceholderStyles,
} from './Layout.styles';
