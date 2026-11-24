import type { ComponentType, LazyExoticComponent } from 'react';

export type NavigationSection =
  | 'quick-links'
  | 'configure'
  | 'administration'
  | 'governance'
  | 'productivity';

export interface Route {
  path: string;
  label: string;
  iconRegular: ComponentType<{ className?: string }>;
  iconFilled: ComponentType<{ className?: string }>;
  section: NavigationSection;
  component: LazyExoticComponent<ComponentType>;
  scrollToTop?: boolean;
  mdaPageParams?: string;
}

export interface NavigationSectionConfig {
  id: NavigationSection;
  label: string;
  routes: Route[];
}

export interface NavigationConfig {
  sections: NavigationSectionConfig[];
}

export const SECTION_LABELS: Record<NavigationSection, string> = {
  'quick-links': 'Quick links',
  'configure': 'Configure',
  'administration': 'Administration',
  'governance': 'Governance',
  'productivity': 'Productivity',
};
