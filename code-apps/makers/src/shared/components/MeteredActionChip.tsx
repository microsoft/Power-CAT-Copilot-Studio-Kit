/**
 * Discloses that an action spends metered capacity, before it is taken.
 *
 * The app already told makers this — in `aiErrorClassifier`, which fires only
 * once credits have run out. That is the one moment the information cannot be
 * acted on. This chip states it at the affordance instead.
 *
 * **Why `meter` is required rather than defaulted.** The app bills on two
 * meters, not one:
 *
 * | Surface | Meter |
 * | --- | --- |
 * | Agent Review Tool, Prompt Advisor | Copilot Credits (`AIService` → `PredictV2`) |
 * | Advanced Testing, Adaptive Cards, Change Tracker | Copilot Studio messages |
 *
 * Only `credits` has a caller today. The union is kept anyway, because this
 * component lives in `shared` for the express purpose of being reused, and a
 * shared chip that could name only one of the app's two meters would be wrong
 * the first time anyone adopted it on a testing surface — wrong in the
 * direction that matters, telling a maker the price is one thing when it is
 * another. Requiring the caller to name the meter costs one prop and removes
 * that failure entirely.
 *
 * **Wording.** The `credits` label matches the chip Copilot Studio shows on its
 * own home page, deliberately: a maker who has seen it there should recognise
 * the same signifier here rather than learn a second vocabulary. The strings
 * themselves live in `meteredActionCopy`.
 *
 * **Placement — one per spending surface, before the spend.** Three placements
 * were considered and rejected:
 *
 * - `HeroSection` persists its dismissal to `localStorage`, so a chip there
 *   disappears permanently after one click, hiding the price from exactly the
 *   repeat users who spend the most.
 * - `ReviewProgressDialog` opens once the run has already started, which is
 *   after the only moment the maker could have acted on the price. That is the
 *   same defect as disclosing at error time, moved slightly earlier.
 * - A grid column header was built and removed. It looked like a control rather
 *   than a label, it was the widest thing in the header row so it outweighed
 *   `Score` and `Issues`, and it forced the column 130px wider than its buttons
 *   needed. The argument for it — "state the price at the affordance" — does not
 *   survive the fact that nobody re-reads a column header, so it bought
 *   permanent visual noise for one-time disclosure.
 *
 * It sits on `PageHeader`'s title row, after `PREVIEW`. Four arrangements were
 * rendered and compared before settling:
 *
 * - **Subtitle row.** Tidy, and it kept the title row clean, but at that weight
 *   on a line most people skim a disclosure risks not being read at all. That
 *   is the opposite failure to the grid header and just as real.
 * - **No chrome at all.** Overcorrected. With the border and the fill both gone
 *   the chip stopped looking like a badge and became stray text.
 * - **Borderless 32px pill.** Overcorrected the other way. Forcing the height
 *   to match `PREVIEW` and rounding it fully made a lozenge that dominated the
 *   row and looked nothing like what the design called for.
 * - **A light-stroked 4px chip at its natural height.** Chosen, and the same
 *   thing the original mock specified: `colorNeutralStroke1` border,
 *   `colorNeutralBackground3` fill, 12px label, icon at 75%.
 *
 * The three detours all came from reasoning about how the chip should relate to
 * `PREVIEW` instead of checking what had already been designed. `PREVIEW` is a
 * brand-tinted tag with no stroke and the chip is a neutral outlined one; they
 * do not need to match, because they are not making the same kind of claim.
 *
 * **`appearance`.** `subtle` exists for exactly that reason: beside an existing
 * badge, an outlined chip competes. Removing the border and fill makes it
 * quieter than `PREVIEW` by construction rather than by careful colour choice.
 * Only `subtle` has a caller today; `outline` remains the default because a
 * chip standing alone — with no badge to defer to — should keep its edges.
 *
 * **The icon.** `CoinStackRegular`. Credits are counted units of entitlement,
 * and a stack of coins is the metaphor for that; a banknote is money, which is
 * a different thing a maker does not spend here.
 *
 * `DatabaseRegular` shipped first and was wrong on meaning — a cylinder is
 * storage, not spend. `MoneyRegular` replaced it briefly on legibility grounds,
 * which was the wrong criterion to lead with: at 16px `CoinStack` is admittedly
 * close to the cylinder it replaces, but a glyph that is slightly harder to
 * read and correct beats one that is crisp and says the wrong thing. The label
 * beside it carries the reading; the icon only has to not mislead.
 *
 * Also rejected: `Premium` reads as a tier, `Sparkle` as AI, `DataUsage` as
 * analytics.
 */

import { Badge, Tooltip, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { CoinStackRegular, ChatRegular } from '@fluentui/react-icons';
import { METER_COPY, type CreditsMeter } from './meteredActionCopy';

const useStyles = makeStyles({
  chip: {
    /*
      `colorNeutralBackground5` (#ebebeb). Two steps greyer than the mock's
      #f5f5f5, because the mock drew the chip on a white card while the header
      sits directly on the page, which is white too. At #f5f5f5 the fill reads
      as no fill; at #f0f0f0 it still reads as a smudge rather than a colour.
    */
    backgroundColor: tokens.colorNeutralBackground5,
    color: tokens.colorNeutralForeground2,
    fontWeight: tokens.fontWeightRegular,
    // The chip is informational, not actionable. `help` says "there is more
    // here" without implying that a click does something.
    cursor: 'help',
    /*
      Fluent's outline Badge does not draw its ring with `border`. It uses an
      absolutely positioned `::after` carrying `border: 1px solid currentColor`.

      That matters more than it sounds. Overriding `borderColor` on the element
      changes a border nobody can see, while the real ring keeps rendering in
      `currentColor` -- here `colorNeutralForeground2`, a near-black. Several
      rounds of "the border is too bold" were spent recolouring the wrong
      element, and the computed styles agreed with each change, because the
      property being measured was genuinely being set. It just was not the one
      being drawn.

      With a fill this definite the ring adds nothing, so it is removed at its
      source. Anything that needs an outline again must set it here.
    */
    '::after': {
      borderTopStyle: 'none',
      borderRightStyle: 'none',
      borderBottomStyle: 'none',
      borderLeftStyle: 'none',
    },
    '& svg': {
      // Holds the glyph a step behind the label. The label carries the reading;
      // the icon only has to mark the row.
      opacity: 0.75,
    },
  },
});

export interface MeteredActionChipProps {
  /** Which capacity the adjacent action draws down. */
  meter: CreditsMeter;
  /** Describes the spending action when it is not a review. */
  description?: string;
  className?: string;
}

/**
 * A small, non-interactive chip naming the meter an adjacent action spends.
 *
 * Rendered as an outline `Badge` rather than a `MessageBar` on purpose: this is
 * a price tag, not a warning. A maker about to do the thing they came to do
 * should not be alerted at.
 */
export function MeteredActionChip({ meter, description: descriptionOverride, className }: MeteredActionChipProps) {
  const styles = useStyles();
  const { label } = METER_COPY[meter];
  const description = descriptionOverride ?? METER_COPY[meter].description;
  const Icon = meter === 'credits' ? CoinStackRegular : ChatRegular;

  return (
    <Tooltip relationship="description" content={description} withArrow>
      <Badge
        appearance="outline"
        shape="circular"
        size="medium"
        icon={<Icon />}
        className={mergeClasses(styles.chip, className)}
        /*
          A Fluent Badge renders a div, which is not focusable. Without this the
          tooltip is mouse-only, so a keyboard user gets the label but never the
          entitlement nuance that only the description carries.
        */
        tabIndex={0}
        aria-label={`${label}. ${description}`}
      >
        {label}
      </Badge>
    </Tooltip>
  );
}
