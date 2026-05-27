/**
 * Design tokens lifted from https://adoption.microsoft.com/en-us/copilot/.
 *
 * Two gradients drive the whole aesthetic:
 *   - `gradientBar` (45deg, deep): a thin accent line used at the top of the
 *     page and at section boundaries.
 *   - `gradientText` (to right, bright): used as a -webkit-background-clip
 *     fill for the headline portion of hero/section titles.
 *
 * Section backgrounds alternate between two soft pastels (`cream` / `dusty`)
 * with a couple of decorative full-bleed backgrounds in between.
 */
export const palette = {
  // Section pastels — DIALED WAY DOWN from the saturated `#F1E8E1` / `#E5D8EA`
  // that adoption.microsoft.com reserves for modal accents. The actual page
  // backgrounds on adoption.microsoft.com are mostly white with a `copilot-bg`
  // PNG providing only the lightest pastel wash, so we use near-white tints
  // here for the same airy feel.
  cream: "#FBF6F1",        // was #F1E8E1
  creamSoft: "#FDFBF8",    // was #FAF4EF — even softer, nearly white
  dusty: "#F7F1F9",        // was #E5D8EA
  dustySoft: "#FBF7FD",    // was #F1E8F5 — even softer, nearly white
  // Richer accent tones — kept around for badges, borders, the modal-style
  // table head bg, and any future pull-quote that wants the original
  // adoption.microsoft.com saturation.
  creamRich: "#F1E8E1",
  dustyRich: "#E5D8EA",
  textPrimary: "#242424",
  textSecondary: "#595959",
  textMuted: "#707070",
  border: "#EDE6E0",       // softened from #E5DDD7 to track lighter cream
  borderDusty: "#E8DEEE",  // softened from #D5C9DC to track lighter dusty
  white: "#FFFFFF",
  // Pillar accents — these tints existed on the previous Agent Kit site and
  // map cleanly onto the six-stop rainbow.
  pillarQuality: "#833D91",
  pillarGovernance: "#45AB71",
  pillarAnalytics: "#106293",
  pillarComponents: "#F38B67",
};

export const gradientBar =
  "linear-gradient(45deg, #106293, #45ab71, #d0ad45, #f38b67, #ef5d84, #833d91)";

export const gradientText =
  "linear-gradient(to right, #2b88d8, #32c28a, #e6c35a, #f28a3c, #e14b7a, #c54bb5)";

// The adoption.microsoft.com `.page-header h1` uses TWO stacked gradients:
// a dark-to-transparent top overlay to deepen the upper edge of the text,
// and the bright rainbow underneath. We dial the overlay way down (0.30 vs.
// adoption's 0.75) so the headline reads bright and luminous against our
// near-white hero — adoption.microsoft.com sits on a darker textured bg
// where the heavier overlay reads as elegant; on white it reads as muddy.
export const gradientHeroLayered =
  "linear-gradient(to bottom, rgba(0,0,0,0.30), rgba(0,0,0,0)), " +
  "linear-gradient(to right, #3b9be8, #3dd0a0, #f0d370, #ff9d56, #ed6390, #d566c4)";

// Lifted from adoption.microsoft.com `.modal .single-prompt` shadow.
export const glassShadow =
  "0 0 0.125rem rgba(0, 0, 0, 0.12), 0 0.125rem 0.25rem rgba(0, 0, 0, 0.14)";

export const fontFamily =
  "'Segoe UI Variable', 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif";
