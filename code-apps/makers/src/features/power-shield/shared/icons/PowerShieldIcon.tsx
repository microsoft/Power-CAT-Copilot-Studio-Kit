import { useId, type FC } from 'react';

/** Shield outline path (ShieldRegular from Fluent UI v9) */
const SHIELD_OUTLINE_PATH =
  'M9.72 2.08a.5.5 0 0 1 .56 0c1.94 1.3 4.03 2.1 6.3 2.43A.5.5 0 0 1 17 5v4.5c0 3.9-2.3 6.73-6.82 8.47a.5.5 0 0 1-.36 0C5.31 16.23 3 13.39 3 9.5V5a.5.5 0 0 1 .43-.5 15.05 15.05 0 0 0 6.3-2.42ZM9.6 3.35A15.97 15.97 0 0 1 4 5.43V9.5c0 3.4 1.97 5.86 6 7.46 4.03-1.6 6-4.07 6-7.46V5.43a15.97 15.97 0 0 1-5.6-2.08L10 3.1l-.4.25Z';

/** Outline lightning bolt path — outer shape + inner cutout for Regular style */
const BOLT_OUTLINE_PATH =
  'M7.97 5.75C8.04 5.54 8.24 5.4 8.46 5.4h2.71c.36 0 .61.35.5.69L11.07 7.92h1.66c.46 0 .7.56.38.89L8.46 13.61c-.45.45-1.21.04-1.07-.58l.53-2.38-.66 0c-.51 0-.86-.5-.69-.98l1.4-3.91Zm.57.28-1.37 3.85c-.03.07.03.14.1.14l1.05 0a.32.32 0 0 1 .31.38L8 13.17 12.48 8.55h-1.85a.32.32 0 0 1-.3-.42L11.02 6.03H8.54Z';

/** Filled lightning bolt path — outer shape only, used for Filled variant mask cutout */
const BOLT_FILLED_PATH =
  'M7.97 5.75C8.04 5.54 8.24 5.4 8.46 5.4h2.71c.36 0 .61.35.5.69L11.07 7.92h1.66c.46 0 .7.56.38.89L8.46 13.61c-.45.45-1.21.04-1.07-.58l.53-2.38-.66 0c-.51 0-.86-.5-.69-.98l1.4-3.91Z';

/**
 * PowerShield icon (Regular variant, 20×20px)
 *
 * Shield outline with outline lightning bolt inside.
 * Matches Fluent UI v9 Regular icon style (thin outlines, no fills).
 * Used for Power Shield navigation item (unselected state).
 */
export const PowerShieldIcon20Regular: FC<{ className?: string }> = ({ className }) => {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path d={SHIELD_OUTLINE_PATH} fill="currentColor" />
      <path d={BOLT_OUTLINE_PATH} fill="currentColor" />
    </svg>
  );
};

/**
 * PowerShield icon (Filled variant, 20×20px)
 *
 * Solid shield with lightning bolt cutout (transparent).
 * Used for Power Shield navigation item (selected state).
 */
export const PowerShieldIcon20Filled: FC<{ className?: string }> = ({ className }) => {
  const maskId = useId();

  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <mask id={maskId}>
          <rect width="20" height="20" fill="white" />
          <path d={BOLT_FILLED_PATH} fill="black" />
        </mask>
      </defs>
      <path
        d="M9.72 2.08a.5.5 0 0 1 .56 0c1.94 1.3 4.03 2.1 6.3 2.43A.5.5 0 0 1 17 5v4.5c0 3.9-2.3 6.73-6.82 8.47a.5.5 0 0 1-.36 0C5.31 16.23 3 13.39 3 9.5V5a.5.5 0 0 1 .43-.5 15.05 15.05 0 0 0 6.3-2.42Z"
        fill="currentColor"
        mask={`url(#${maskId})`}
      />
    </svg>
  );
};
