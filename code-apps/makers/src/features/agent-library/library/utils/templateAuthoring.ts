/**
 * Shared constants for custom-template authoring + display.
 *
 * Single source of truth for the accent swatches and the curated icon choices
 * used by both the in-package authoring dialog (NewTemplateDialog) and consumer
 * host apps that map Dataverse rows into AgentTemplate objects (so a stored
 * accent key resolves to the same gradient the admin picked).
 */

import { ICON_GRADIENTS } from '../data/agentTemplateCatalog';

export interface AccentSwatch {
  key: string;
  gradient: string;
  /** Human-readable colour name shown as a hover tooltip in the picker. */
  label: string;
}

/**
 * Accent swatches — reuse the shared template icon gradients. Order and palette
 * mirror the authoring prototype's colour row (Teal, Blue, Green, Purple,
 * Orange, Indigo, Pink). Keys are stable identifiers persisted on the template,
 * so they are kept as-is even though the display labels differ.
 */
export const ACCENT_SWATCHES: AccentSwatch[] = [
  { key: 'cerulean', gradient: ICON_GRADIENTS.cerulean, label: 'Teal' },
  { key: 'azure', gradient: ICON_GRADIENTS.azure, label: 'Blue' },
  { key: 'fern', gradient: ICON_GRADIENTS.fern, label: 'Green' },
  { key: 'fuchsia', gradient: ICON_GRADIENTS.fuchsia, label: 'Purple' },
  { key: 'gold', gradient: ICON_GRADIENTS.gold, label: 'Orange' },
  { key: 'lavender', gradient: ICON_GRADIENTS.lavender, label: 'Indigo' },
  { key: 'rose', gradient: ICON_GRADIENTS.rose, label: 'Pink' },
];

/** Default accent key applied when none is chosen/stored. */
export const DEFAULT_ACCENT = ACCENT_SWATCHES[0].key;

/** Resolve an accent swatch key to its CSS gradient, falling back to the default. */
export function resolveAccentGradient(key?: string): string {
  return ACCENT_SWATCHES.find((s) => s.key === key)?.gradient ?? ICON_GRADIENTS.cerulean;
}

/**
 * Template-appropriate icon keys offered in the authoring picker. Mirrors the
 * authoring prototype's icon row (in order). Constrained to the 20px filled
 * glyphs in ICON_MAP that read white on the accent gradient — a free-text icon
 * outside this set renders blank on the card.
 */
export const TEMPLATE_ICON_CHOICES: string[] = [
  'Code20Filled', // Code
  'Info20Filled', // Info
  'DocumentBulletList20Filled', // Report
  'People20Filled', // People
  'Chat20Filled', // Chat
  'DataTrending20Filled', // Insights
  'BookOpen20Filled', // Knowledge
  'ShieldCheckmark20Filled', // Compliance
  'BrainCircuit20Filled', // Brain
  'Headset20Filled', // Support
  'TaskListSquareLtr20Filled', // Tasks
  'Search20Filled', // Search
];

/**
 * Friendly labels for the icon picker, shown as hover tooltips. Keyed by the
 * ICON_MAP icon key (see TEMPLATE_ICON_CHOICES). Falls back to the raw key.
 */
export const TEMPLATE_ICON_LABELS: Record<string, string> = {
  Code20Filled: 'Code',
  Info20Filled: 'Info',
  DocumentBulletList20Filled: 'Report',
  People20Filled: 'People',
  Chat20Filled: 'Chat',
  DataTrending20Filled: 'Insights',
  BookOpen20Filled: 'Knowledge',
  ShieldCheckmark20Filled: 'Compliance',
  BrainCircuit20Filled: 'Brain',
  Headset20Filled: 'Support',
  TaskListSquareLtr20Filled: 'Tasks',
  Search20Filled: 'Search',
};

/** Default icon key applied when the admin has not picked one. */
export const DEFAULT_ICON = TEMPLATE_ICON_CHOICES[0];
