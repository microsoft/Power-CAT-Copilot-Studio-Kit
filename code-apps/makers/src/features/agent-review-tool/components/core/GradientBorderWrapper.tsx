/**
 * GradientBorderWrapper Component
 *
 * Animated shimmer border effect for dialogs and cards (Copilot Studio style).
 * Matches the PCF implementation exactly — uses inline <style> tag in JSX,
 * no Griffel makeStyles (avoids @keyframes Griffel limitation).
 */

import React, { type ReactNode } from 'react';
import { tokens } from '@fluentui/react-components';

/**
 * GradientBorderWrapper props
 */
export interface GradientBorderWrapperProps {
  /** Child content to wrap */
  children: ReactNode;

  /** Enable shimmer animation (default: true) */
  enableAnimation?: boolean;

  /** Border radius (default: tokens.borderRadiusMedium) */
  borderRadius?: string;
}

/**
 * GradientBorderWrapper component
 *
 * Wraps content with an animated Copilot-style shimmer border.
 */
export function GradientBorderWrapper({
  children,
  enableAnimation = true,
  borderRadius = tokens.borderRadiusMedium,
}: GradientBorderWrapperProps) {
  return (
    <>
      <style>{`
        @keyframes shimmerBorder {
          0%   { background-position: 0% 0%;   transform: rotate(0deg)   scale(2); }
          75%  { background-position: 150% 0%; transform: rotate(180deg) scale(2); }
          100% { background-position: 300% 0%; transform: rotate(360deg) scale(2); }
        }
        .gradient-border-wrapper {
          position: relative;
          border-radius: ${borderRadius};
          overflow: hidden;
          width: 100%;
          height: 100%;
        }
        .gradient-border-layer {
          position: absolute;
          top: -4px;
          left: -4px;
          right: -4px;
          bottom: -4px;
          border-radius: inherit;
          background-image: linear-gradient(
            to right,
            #FFFFFF, #077FAB, #B25ABF, #F59F57, #DD598F, #C647B9,
            #077FAB, #FFFFFF, #B25ABF, #F59F57, #DD598F, #C647B9, #FFFFFF
          );
          background-size: 100% 100%;
          z-index: 0;
          ${enableAnimation ? 'animation: shimmerBorder 8s linear infinite;' : ''}
        }
        .gradient-border-inner {
          position: relative;
          z-index: 1;
          background-color: ${tokens.colorNeutralBackground1};
          border-radius: ${borderRadius};
          margin: 4px;
          overflow: hidden;
          width: calc(100% - 8px);
          height: calc(100% - 8px);
        }
      `}</style>
      <div className="gradient-border-wrapper">
        <div className="gradient-border-layer" />
        <div className="gradient-border-inner">
          {children}
        </div>
      </div>
    </>
  );
}
