import { Body1, Link, Subtitle2, makeStyles, tokens } from '@fluentui/react-components';
import type { ReactNode } from 'react';
import type { LearnQuote } from '../../utils/upgradeReadiness';

export interface HarnessFitContentProps {
  /** The heading level of the title. It must fit the headings around the content. */
  headingLevel: 'h3' | 'h4';
  /** The id of the title. The section uses it as its accessible name. */
  headingId?: string;
  /** The title of the advice. When it is not set, no title shows. */
  title?: string;
  /** The text before the signs. */
  lead?: ReactNode;
  /** The signs that the review found, in a fixed order. */
  reasons?: readonly string[];
  /** The Microsoft Learn quote that supports the advice. */
  quote: LearnQuote;
  /** Content after the quote, for example an action button. */
  children?: ReactNode;
}

const useStyles = makeStyles({
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    minWidth: 0,
    overflowWrap: 'anywhere',
  },
  heading: {
    margin: 0,
  },
  text: {
    margin: 0,
  },
  list: {
    margin: 0,
    paddingLeft: tokens.spacingHorizontalXL,
  },
});

/** Shows a Microsoft Learn quote and a link to its page. The link opens in a new tab. */
export function LearnQuoteText({ quote }: { quote: LearnQuote }) {
  return (
    <>
      {quote.lead ? `${quote.lead} ` : null}
      <q>{quote.text}</q>{' '}
      <Link
        inline
        href={quote.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Microsoft Learn, opens in a new tab"
      >
        Microsoft Learn
      </Link>
    </>
  );
}

/**
 * Shows harness fit advice as page content: a title, a lead text, the signs,
 * and a Microsoft Learn quote. It is not a message bar, so a screen reader
 * does not announce the full advice each time it shows.
 */
export function HarnessFitContent({
  headingLevel,
  headingId,
  title,
  lead,
  reasons,
  quote,
  children,
}: HarnessFitContentProps) {
  const styles = useStyles();

  return (
    <section className={styles.section} aria-labelledby={title && headingId ? headingId : undefined}>
      {title ? (
        <Subtitle2 as={headingLevel} id={headingId} className={styles.heading}>
          {title}
        </Subtitle2>
      ) : null}
      {lead ? <Body1 as="p" className={styles.text}>{lead}</Body1> : null}
      {reasons && reasons.length > 0 ? (
        <>
          <Body1 as="p" className={styles.text}>The review found these signs:</Body1>
          <ul className={styles.list}>
            {reasons.map(reason => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </>
      ) : null}
      <Body1 as="p" className={styles.text}>
        <LearnQuoteText quote={quote} />
      </Body1>
      {children}
    </section>
  );
}
