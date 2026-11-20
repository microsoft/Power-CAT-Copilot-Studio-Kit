import * as React from 'react';
import copilotStudioKitLogo from '../assets/logos/copilot-studio-kit-2.svg';

/**
 * Copilot Agent Kit brand logo component
 *
 * Official brand logo from Figma design (node-id: 48-2554)
 * 24×23px SVG asset used for navbar/sidebar header branding
 * Renders next to "Copilot Agent Kit" text
 */
export const CopilotStudioKitLogo: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <img
      src={copilotStudioKitLogo}
      alt="Copilot Agent Kit"
      width={24}
      height={23}
      className={className}
      style={{ display: 'block', objectFit: 'contain' }}
    />
  );
};
