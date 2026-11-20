import React, { Suspense } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Spinner } from '@fluentui/react-components';
import { AppNav } from './AppNav';
import { Content } from './Content';
import { useLayoutStyles, useSuspenseFallbackStyles } from './Layout.styles';
import { navigationConfig } from '../../config/navigation';
import { navigateToMda, getContextualNavConfig } from '../../utils/mda-navigation';
import { useMdaContext } from '../../contexts/MdaContext';

export interface LayoutProps {
  children?: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const styles = useLayoutStyles();
  const fallbackStyles = useSuspenseFallbackStyles();
  const location = useLocation();
  const navigate = useNavigate();

  const isMda = useMdaContext() === true;

  const handleNavigate = (path: string, mdaPageParams?: string) => {
    if (mdaPageParams && isMda) {
      navigateToMda(mdaPageParams);
      return;
    }
    navigate(path);
  };

  return (
    <div className={styles.root}>
      <AppNav
        config={getContextualNavConfig(navigationConfig)}
        currentPath={location.pathname}
        onNavigate={handleNavigate}
        isMda={isMda}
      />
      <Content>
        <Suspense fallback={<div className={fallbackStyles.container}><Spinner size="large" /></div>}>
          {children}
        </Suspense>
      </Content>
    </div>
  );
};
