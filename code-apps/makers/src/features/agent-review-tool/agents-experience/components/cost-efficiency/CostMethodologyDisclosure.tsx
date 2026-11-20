import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Body1,
  Link,
  Subtitle2,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { DocumentFilled, Open16Regular } from '@fluentui/react-icons';

const COPILOT_CREDITS_GUIDE_URL =
  'https://learn.microsoft.com/microsoft-copilot-studio/agents-experience/billing-credit-overview';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    minWidth: 0,
  },
  accordion: {
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusXLarge,
    overflow: 'hidden',
  },
  headerButton: {
    minHeight: '44px',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    marginTop: 0,
    marginBottom: tokens.spacingVerticalM,
    paddingLeft: tokens.spacingHorizontalXXL,
    color: tokens.colorNeutralForeground2,
  },
  sourceLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    minHeight: '44px',
    width: 'fit-content',
    color: tokens.colorNeutralForeground2Link,
    // The link sits directly under body text of the same colour, so an
    // always-on underline is the only non-colour affordance (SC 1.4.1).
    textDecorationLine: 'underline',
    ':hover': {
      color: tokens.colorNeutralForeground2LinkHover,
    },
    ':active': {
      color: tokens.colorNeutralForeground2LinkPressed,
    },
  },
  pdfIcon: {
    color: tokens.colorPaletteRedForeground1,
    flexShrink: 0,
  },
  openIcon: {
    flexShrink: 0,
  },
});

export interface CostMethodologyDisclosureProps {
  headingLevel?: 'h3' | 'h4';
}

/** Reveals the calculation method on demand and keeps the source always visible. */
export function CostMethodologyDisclosure({
  headingLevel = 'h3',
}: CostMethodologyDisclosureProps) {
  const styles = useStyles();
  return (
    <section className={styles.root} aria-labelledby="cost-method-heading">
      <Accordion className={styles.accordion} collapsible defaultOpenItems="method">
        <AccordionItem value="method">
          <AccordionHeader
            as={headingLevel}
            button={{ className: styles.headerButton }}
            expandIconPosition="start"
            id="cost-method-heading"
          >
            <Subtitle2 as="span">How this estimate works</Subtitle2>
          </AccordionHeader>
          <AccordionPanel>
            <ul className={styles.list}>
              <li>
                <Body1>
                  The three task bands, their definitions, and the $0.01 per credit
                  {' '}public PAYG rate come from the August 2026 guide. Monthly totals
                  {' '}are calculated from the task volume and scenario you select. They
                  {' '}are planning estimates, not observed usage or guaranteed costs.
                </Body1>
              </li>
              <li><Body1>Monthly agent tasks x published credits per task.</Body1></li>
              <li><Body1>One conversation can contain several tasks.</Body1></li>
              <li>
                <Body1>
                  The guide ties credit use to the complexity of the work performed, not to
                  {' '}how an agent is configured. Two agents with the same task volume and
                  {' '}scenario therefore show the same estimate.
                </Body1>
              </li>
              <li>
                <Body1>
                  Saved configuration cannot observe task complexity, so you choose the
                  {' '}scenario. It is a planning assumption, not an automatic classification.
                </Body1>
              </li>
              <li>
                <Body1>
                  A configured capability that is not used consumes no credits. Services with
                  {' '}their own meter, including bring-your-own-model processing, are billed separately.
                </Body1>
              </li>
              <li>
                <Body1>
                  This covers runtime only. Building with natural language, previewing,
                  {' '}testing, and generating evaluations also consume credits.
                </Body1>
              </li>
              <li>
                <Body1>
                  Preview and Evaluation consume credits based on the runtime work
                  {' '}performed. Saved test-case count describes validation coverage but
                  {' '}cannot determine the cost of a pass because a case can contain
                  {' '}multiple interactions and runtime tasks.
                </Body1>
              </li>
              <li>
                <Body1>
                  Published credit estimates use saved configuration and planning inputs,
                  not transcripts or actual billed usage. Observed capability use reads
                  transcripts separately and does not calculate credits.
                </Body1>
              </li>
              <li>
                <Body1>
                  Actual credits vary with models, runtime, context, and tools.
                </Body1>
              </li>
              <li>
                <Body1>
                  Public PAYG uses $0.01 per credit. Customer agreements, prepaid capacity,
                  {' '}and license coverage can differ.
                </Body1>
              </li>
              <li>
                <Body1>
                  Microsoft publishes no credit rate for an individual tool, connected
                  {' '}agent, or knowledge source. The optimization cards therefore name
                  {' '}levers to review and never claim a saving amount.
                </Body1>
              </li>
              <li><Body1>Heavy has no published upper estimate.</Body1></li>
            </ul>
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
      <Link
        className={styles.sourceLink}
        href={COPILOT_CREDITS_GUIDE_URL}
        target="_blank"
        rel="noreferrer"
      >
        <DocumentFilled
          aria-hidden
          className={styles.pdfIcon}
          fontSize={16}
        />
        <span>Microsoft Copilot Credits — Billing overview (opens in a new tab)</span>
        <Open16Regular aria-hidden className={styles.openIcon} />
      </Link>
    </section>
  );
}
