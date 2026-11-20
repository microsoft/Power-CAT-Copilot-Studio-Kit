import { Link } from '@fluentui/react-components';

import { RUNTIME_LABELS, type TargetRuntime } from '../contracts/ArtifactReview';

const SKILLS_DOCUMENTATION_URLS: Partial<Record<TargetRuntime, string>> = {
  cowork: 'https://learn.microsoft.com/microsoft-365/copilot/cowork/use-cowork#cowork-skills',
  scout: 'https://learn.microsoft.com/microsoft-scout/overview#bundled-skills',
};

interface RuntimeCoverageHintProps {
  runtime: TargetRuntime;
  description: string;
}

/** Add a documentation link only when Microsoft Learn covers that capability. */
export function RuntimeCoverageHint({ runtime, description }: RuntimeCoverageHintProps) {
  const linkText = 'built-in skills';
  const linkStart = SKILLS_DOCUMENTATION_URLS[runtime] ? description.indexOf(linkText) : -1;

  if (linkStart < 0) return description;

  return (
    <>
      {description.slice(0, linkStart)}
      <Link
        href={SKILLS_DOCUMENTATION_URLS[runtime]}
        target="_blank"
        rel="noreferrer"
        aria-label={`${RUNTIME_LABELS[runtime]} built-in skills on Microsoft Learn (opens in a new tab)`}
      >
        {linkText}
      </Link>
      {description.slice(linkStart + linkText.length)}
    </>
  );
}
