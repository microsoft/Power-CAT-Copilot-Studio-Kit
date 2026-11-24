/**
 * The product mark for each target runtime.
 *
 * One map keeps the same three asset paths out of every runtime selector,
 * verdict card and summary.
 *
 * Rendered decorative (`alt=""`, `aria-hidden`) on purpose. Callers provide the
 * runtime name in visible text or on the containing accessible summary, so
 * announcing the logo would repeat the same name.
 */
import { makeStyles } from '@fluentui/react-components';
import coworkIcon from '../../assets/CopilotCowork.png?inline';
import scoutIcon from '../../assets/MicrosoftScout.png?inline';
import copilotStudioIcon from '../../assets/CopilotStudio_scalable.svg';
import type { TargetRuntime } from '../contracts/ArtifactReview';

const RUNTIME_ICON_SRC: Record<TargetRuntime, string> = {
  cowork: coworkIcon,
  scout: scoutIcon,
  'copilot-studio': copilotStudioIcon,
};

const useStyles = makeStyles({
  icon: {
    // Square and immovable. Inside a Badge the label can wrap or ellipsise;
    // a mark that shrinks with it turns to mush and reads as a rendering fault.
    flexShrink: 0,
    objectFit: 'contain',
    display: 'block',
  },
});

export interface RuntimeIconProps {
  runtime: TargetRuntime;
  /** Edge length in pixels. 14–16 inside a badge, 20–24 on a card header. */
  size?: number;
  className?: string;
}

export function RuntimeIcon({ runtime, size = 16, className }: RuntimeIconProps) {
  const styles = useStyles();

  return (
    <img
      src={RUNTIME_ICON_SRC[runtime]}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className={className ? `${styles.icon} ${className}` : styles.icon}
    />
  );
}
