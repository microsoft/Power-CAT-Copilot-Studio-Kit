import React from 'react';
import { FluentProvider, webLightTheme, webDarkTheme, createLightTheme, createDarkTheme, type BrandVariants, type Theme } from '@fluentui/react-components';
import { useTheme } from './McpBridge';

export function FluentWrapper({ children, brand }: { children: React.ReactNode; brand?: BrandVariants }) {
  const theme = useTheme();
  let lightTheme: Theme = webLightTheme;
  let darkTheme: Theme = webDarkTheme;
  if (brand) {
    lightTheme = createLightTheme(brand);
    darkTheme = createDarkTheme(brand);
  }
  return (
    <FluentProvider theme={theme === 'dark' ? darkTheme : lightTheme} style={{ background: 'transparent' }}>
      {children}
    </FluentProvider>
  );
}
