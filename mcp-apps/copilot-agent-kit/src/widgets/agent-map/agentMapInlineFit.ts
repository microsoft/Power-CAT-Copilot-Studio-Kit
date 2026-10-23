/**
 * Inline map fit geometry.
 *
 * Inline, the React Flow controls sit in a column at the right edge of the
 * canvas. The Agent Map expand button and the legend toggle are in the same
 * column. The fit keeps every node out of that column, so no control can cover
 * a node at any inline size. Full screen keeps its own fit and legend panel.
 */

/** The margin of the inline controls panel (React Flow's default is 15px). */
export const AGENT_MAP_INLINE_CONTROLS_MARGIN_PX = 8;
/** The canvas styles hold each React Flow control button at 28px. */
export const AGENT_MAP_CONTROL_BUTTON_PX = 28;
/** The Agent Map expand button: 8px from the right edge, 24px wide (small icon button). */
export const AGENT_MAP_INLINE_EXPAND_EDGE_PX = 8;
export const AGENT_MAP_INLINE_EXPAND_BUTTON_PX = 24;
/** The space between a node and the canvas edge or a control. */
export const AGENT_MAP_INLINE_GAP_PX = 12;
/** The column at the right edge that the inline fit keeps free of nodes. */
export const AGENT_MAP_INLINE_CONTROLS_RESERVE_PX =
  AGENT_MAP_INLINE_CONTROLS_MARGIN_PX + AGENT_MAP_CONTROL_BUTTON_PX + AGENT_MAP_INLINE_GAP_PX;
/** Inline lets the fit zoom out further, so a large graph fits instead of overflowing under the controls. */
export const AGENT_MAP_INLINE_MIN_ZOOM = 0.05;
/** Full screen keeps the earlier zoom floor. */
export const AGENT_MAP_MIN_ZOOM = 0.15;

export type AgentMapPixelPadding = `${number}px`;

export interface AgentMapInlineFitPadding {
  top: AgentMapPixelPadding;
  right: AgentMapPixelPadding;
  bottom: AgentMapPixelPadding;
  left: AgentMapPixelPadding;
}

/**
 * Per-side fit padding for the inline map.
 *
 * `bottomInset` is the height of an overlay at the bottom edge of the map, for
 * example the Review "Topic evaluation incomplete" chip, measured from the edge.
 */
export function agentMapInlineFitPadding(bottomInset = 0): AgentMapInlineFitPadding {
  const inset = Number.isFinite(bottomInset) ? Math.max(0, Math.ceil(bottomInset)) : 0;
  return {
    top: `${AGENT_MAP_INLINE_GAP_PX}px`,
    right: `${AGENT_MAP_INLINE_CONTROLS_RESERVE_PX}px`,
    bottom: `${AGENT_MAP_INLINE_GAP_PX + inset}px`,
    left: `${AGENT_MAP_INLINE_GAP_PX}px`,
  };
}
