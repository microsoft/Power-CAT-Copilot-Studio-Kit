import React, { useState, useMemo } from 'react';
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
  Skeleton,
  SkeletonItem,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import copilotStudioKitLogo from '../assets/logos/copilot-studio-kit-2.svg';
import { useAuthBoot } from '../contexts/AuthContext';
import type { PowerShieldNavConfig, CskRole } from '../config/navigation';

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export interface AppNavProps {
  config: PowerShieldNavConfig;
  onNavigate: (path: string, mdaPageParams?: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
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
  skeletonContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
  },
});

const SKELETON_ROW_COUNT = 7;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function isRouteVisible(routeRoles: CskRole[] | undefined, cskRole: CskRole): boolean {
  if (cskRole === 'unknown') return false;
  if (!routeRoles) return true;
  return routeRoles.includes(cskRole);
}

/** The internal "Power Shield" route is always selected within this app */
const POWER_SHIELD_PATH = '/power-shield';

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function AppNav({ config, onNavigate }: AppNavProps) {
  const styles = useStyles();
  const boot = useAuthBoot();
  const [isOpen, setIsOpen] = useState(true);

  // Derive cskRole from boot state
  const cskRole: CskRole =
    boot.phase === 'ready'
      ? boot.auth.cskRole
      : boot.phase === 'unauthorized'
        ? boot.cskRole
        : 'unknown';
  const isCskRoleLoading = cskRole === 'unknown';

  // Power Shield is always selected since we ARE the Power Shield app
  const selectedPath = POWER_SHIELD_PATH;

  const visibleSections = useMemo(
    () =>
      config.sections
        .map((section) => ({
          ...section,
          routes: section.routes.filter((route) => isRouteVisible(route.roles, cskRole)),
        }))
        .filter((section) => section.routes.length > 0),
    [config.sections, cskRole],
  );

  const handleNavItemClick = (event: React.MouseEvent, path: string, mdaPageParams?: string) => {
    event.preventDefault();
    onNavigate(path, mdaPageParams);
  };

  return (
    <NavDrawer open={true} type="inline" className={!isOpen ? styles.navDrawerCollapsed : undefined}>
      <NavDrawerHeader>
        <Tooltip content="Toggle navigation menu" relationship="label">
          <Hamburger onClick={() => setIsOpen((prev) => !prev)} />
        </Tooltip>
      </NavDrawerHeader>

      <NavDrawerBody>
        {/* Branding — "Copilot Agent Kit" with logo */}
        {isOpen ? (
          <AppItem
            icon={<img src={copilotStudioKitLogo} alt="" width={24} height={23} className={styles.logoImage} />}
            href="/"
            onClick={(e) => handleNavItemClick(e, '/', 'pagetype=custom&name=cat_homecoe_70fca')}
          >
            Copilot Agent Kit
          </AppItem>
        ) : (
          <Tooltip content="Copilot Agent Kit" relationship="label">
            <AppItem
              icon={<img src={copilotStudioKitLogo} alt="" width={24} height={23} className={styles.logoImage} />}
              href="/"
              onClick={(e) => handleNavItemClick(e, '/', 'pagetype=custom&name=cat_homecoe_70fca')}
            />
          </Tooltip>
        )}

        {/* Loading state — show skeleton while CSK role resolves */}
        {isCskRoleLoading && (
          <Skeleton aria-label="Loading navigation">
            <div className={styles.skeletonContainer}>
              {Array.from({ length: SKELETON_ROW_COUNT }).map((_, i) => (
                <SkeletonItem key={i} size={28} />
              ))}
            </div>
          </Skeleton>
        )}

        {/* Navigation items */}
        {!isCskRoleLoading && visibleSections.length > 0 && (
          <Nav selectedValue={selectedPath}>
            {visibleSections.map((section, sectionIndex) => (
              <React.Fragment key={section.id}>
                <NavSectionHeader className={!isOpen ? styles.sectionHeaderHidden : undefined}>
                  {section.label}
                </NavSectionHeader>

                {section.routes.map((route) => {
                  const isSelected = selectedPath === route.path;
                  const Icon = isSelected ? route.iconFilled : route.iconRegular;

                  const navItem = (
                    <NavItem
                      key={route.path}
                      icon={<Icon />}
                      value={route.path}
                      href={route.mdaPageParams ? '#' : `#${route.path}`}
                      onClick={(e) => handleNavItemClick(e, route.path, route.mdaPageParams)}
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

                {sectionIndex < visibleSections.length - 1 && <NavDivider />}
              </React.Fragment>
            ))}
          </Nav>
        )}
      </NavDrawerBody>
    </NavDrawer>
  );
}
