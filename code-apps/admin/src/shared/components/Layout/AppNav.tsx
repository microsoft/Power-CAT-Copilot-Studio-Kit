import React, { useState, useEffect } from 'react';
import copilotStudioKitLogo from '../../assets/logos/copilot-studio-kit-2.svg';
import {
  NavDrawer,
  NavDrawerHeader,
  NavDrawerBody,
  AppItem,
  Hamburger,
  Nav,
  NavItem,
  NavSectionHeader,
  NavDivider,
  Tooltip,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import type { NavigationConfig } from '../../types/navigation';

export interface AppNavProps {
  config: NavigationConfig;
  currentPath: string;
  onNavigate: (path: string, mdaPageParams?: string) => void;
  isMda: boolean;
}

/**
 * Below this viewport width the navigation drawer auto-collapses to its
 * icon-only rail so narrow screens (phones, small tablets, high OS display
 * scaling) reclaim horizontal space for page content. Uses a CSS px media
 * query so it tracks the OS display scale, not raw device pixels.
 */
const NAV_AUTO_COLLAPSE_QUERY = '(max-width: 768px)';

const useAppNavStyles = makeStyles({
  navDrawerCollapsed: {
    width: '60px',
    minWidth: '60px',
    maxWidth: '60px',
    overflow: 'hidden',
  },
  logoImage: {
    display: 'block',
  },
  navItemCollapsed: {
    justifyContent: 'center',
    '::after': {
      marginInlineStart: 0,
      insetInlineStart: 0,
      insetBlockStart: '50%',
      transform: 'translateY(-50%)',
    },
  },
  sectionHeaderHidden: {
    display: 'none',
  },
  navItemSelected: {
    '& .fui-NavItem__icon': {
      color: tokens.colorBrandForeground1,
    },
  },
});

export const AppNav: React.FC<AppNavProps> = ({ config, currentPath, onNavigate, isMda }) => {
  const styles = useAppNavStyles();
  const [isOpen, setIsOpen] = useState(
    () => !(typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(NAV_AUTO_COLLAPSE_QUERY).matches),
  );

  // Auto-collapse/expand the drawer when the viewport crosses the mobile
  // breakpoint. The `change` event only fires on a crossing, so a manual
  // hamburger toggle is preserved while the width stays within a range.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia(NAV_AUTO_COLLAPSE_QUERY);
    const handleChange = (event: MediaQueryListEvent) => setIsOpen(!event.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const handleToggle = () => setIsOpen((prev) => !prev);

  /**
   * Strip the trailing `/*` wildcard from a route path to get the navigable
   * base path. Routes like `/power-shield/*` use the wildcard for React Router
   * sub-routing, but the nav should compare and navigate to `/power-shield`.
   */
  const getBasePath = (routePath: string) =>
    routePath.endsWith('/*') ? routePath.slice(0, -2) : routePath;

  const handleNavItemClick = (event: React.MouseEvent, path: string, mdaPageParams?: string) => {
    event.preventDefault();
    onNavigate(getBasePath(path), mdaPageParams);
  };

  // Resolve selectedValue for wildcard routes (e.g., /power-shield/settings → /power-shield)
  const resolvedSelectedValue = (() => {
    for (const section of config.sections) {
      for (const route of section.routes) {
        const base = getBasePath(route.path);
        if (currentPath === base || currentPath.startsWith(base + '/')) {
          return base;
        }
      }
    }
    return currentPath;
  })();

  return (
    <NavDrawer
      open={true}
      type="inline"
      className={!isOpen ? styles.navDrawerCollapsed : undefined}
    >
      <NavDrawerHeader>
        <Tooltip content="Toggle navigation menu" relationship="label">
          <Hamburger onClick={handleToggle} />
        </Tooltip>
      </NavDrawerHeader>

      <NavDrawerBody>
        {isMda && isOpen && (
          <AppItem
            icon={
              <img
                src={copilotStudioKitLogo}
                alt=""
                width={24}
                height={23}
                className={styles.logoImage}
              />
            }
            href="/"
            onClick={(event) => handleNavItemClick(event, '/', 'pagetype=custom&name=cat_homecoe_70fca')}
          >
            Copilot Agent Kit
          </AppItem>
        )}
        {isMda && !isOpen && (
          <Tooltip content="Copilot Agent Kit" relationship="label">
            <AppItem
              icon={<img src={copilotStudioKitLogo} alt="" width={24} height={23} className={styles.logoImage} />}
              href="/"
              onClick={(event) => handleNavItemClick(event, '/', 'pagetype=custom&name=cat_homecoe_70fca')}
            />
          </Tooltip>
        )}

        <Nav selectedValue={resolvedSelectedValue}>
          {config.sections.map((section, sectionIndex) => (
            <React.Fragment key={section.id}>
              <NavSectionHeader className={!isOpen ? styles.sectionHeaderHidden : undefined}>
                {section.label}
              </NavSectionHeader>
              {section.routes.map((route) => {
                const basePath = getBasePath(route.path);
                const isSelected = currentPath === basePath || currentPath.startsWith(basePath + '/');
                const Icon = isSelected ? route.iconFilled : route.iconRegular;

                const navItem = (
                  <NavItem
                    key={route.path}
                    icon={<Icon />}
                    value={basePath}
                    href={basePath}
                    onClick={(event) => handleNavItemClick(event, route.path, route.mdaPageParams)}
                    aria-current={isSelected ? 'page' : undefined}
                    className={mergeClasses(
                      !isOpen && styles.navItemCollapsed,
                      isSelected && styles.navItemSelected,
                    )}
                  >
                    {isOpen && route.label}
                  </NavItem>
                );

                if (!isOpen) {
                  return (
                    <Tooltip key={route.path} content={route.label} relationship="label">
                      {navItem}
                    </Tooltip>
                  );
                }

                return navItem;
              })}
              {sectionIndex < config.sections.length - 1 && <NavDivider />}
            </React.Fragment>
          ))}
        </Nav>
      </NavDrawerBody>
    </NavDrawer>
  );
};
