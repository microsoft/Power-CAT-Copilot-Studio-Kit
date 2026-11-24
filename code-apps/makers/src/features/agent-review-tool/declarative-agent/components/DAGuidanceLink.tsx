import { Link } from '@fluentui/react-components';
import { Open16Regular } from '@fluentui/react-icons';
import type { LearnDocLink } from '../contracts/learnDocs';

/** Opens recorded Microsoft guidance in a new tab. */
export function DAGuidanceLink({ link }: { link: LearnDocLink }) {
  return (
    <Link
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${link.label}, opens in a new tab`}
    >
      <Open16Regular aria-hidden /> {link.label}
    </Link>
  );
}
