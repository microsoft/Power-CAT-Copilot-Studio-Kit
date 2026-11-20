/**
 * Consolidated icon and color-token maps for the Component Library.
 *
 * Merges duplicated ICON_MAP / iconColorTokenMap definitions from
 * ComponentCard, ComponentDetailsDialog, and HeroCard into a single source of truth.
 */

import * as React from 'react';
import { tokens } from '@fluentui/react-components';
import {
  // Component icons (24px)
  DocumentText24Regular,
  Search24Regular,
  DocumentBulletList24Regular,
  PlugConnected24Regular,
  Hexagon24Regular,
  BrainCircuit24Regular,
  ChatHistory24Regular,
  // Agent template icons (20px filled — white on gradient)
  BookOpen20Filled,
  Receipt20Filled,
  // New template icons from Figma (node 1687:17850)
  CalendarLtr20Filled,
  PersonTag20Filled,
  DocumentBriefcase20Filled,
  // Wave 2 declarative agent template icons (per HPA wave2 spec)
  HatGraduation24Regular,
  Trophy24Regular,
  PeopleSearch24Regular,
  News24Regular,
  // Component squircle icons (20px filled, white on gradient)
  DocumentTextExtract20Filled,
  BrainSparkle20Filled,
  PeopleCheckmark20Filled,
  Search20Filled,
  DocumentBulletList20Filled,
  // Custom-template authoring picker icons (20px filled — mirrors the prototype set)
  Code20Filled,
  Info20Filled,
  People20Filled,
  Chat20Filled,
  DataTrending20Filled,
  ShieldCheckmark20Filled,
  BrainCircuit20Filled,
  Headset20Filled,
  ContactCard20Filled,
  TaskListSquareLtr20Filled,
  Sticker20Filled,
  // MCP app squircle icons (24px regular, white on gradient)
  PersonSupport24Regular,
  Chat24Regular,
  ContactCard24Regular,
} from '@fluentui/react-icons';

/** Icon lookup by string key. Falls back to Hexagon24Regular at call-sites. */
export const ICON_MAP: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  // Component icons (24px, for dialog sections)
  DocumentText24Regular,
  Search24Regular,
  DocumentBulletList24Regular,
  PlugConnected24Regular,
  Hexagon24Regular,
  BrainCircuit24Regular,
  ChatHistory24Regular,
  // Agent template icons (20px filled)
  BookOpen20Filled,
  Receipt20Filled,
  // New Figma template icons
  CalendarLtr20Filled,
  PersonTag20Filled,
  DocumentBriefcase20Filled,
  // Wave 2 declarative agent template icons
  HatGraduation24Regular,
  Trophy24Regular,
  PeopleSearch24Regular,
  News24Regular,
  // Component squircle icons
  DocumentTextExtract20Filled,
  BrainSparkle20Filled,
  PeopleCheckmark20Filled,
  Search20Filled,
  DocumentBulletList20Filled,
  // Custom-template authoring picker icons (prototype set)
  Code20Filled,
  Info20Filled,
  People20Filled,
  Chat20Filled,
  DataTrending20Filled,
  ShieldCheckmark20Filled,
  BrainCircuit20Filled,
  Headset20Filled,
  ContactCard20Filled,
  TaskListSquareLtr20Filled,
  Sticker20Filled,
  // MCP app squircle icons
  PersonSupport24Regular,
  Chat24Regular,
  ContactCard24Regular,
};

/** Maps an iconColor name to a Fluent UI background token for the icon circle. */
export const ICON_COLOR_TOKEN_MAP: Record<string, string> = {
  Teal: tokens.colorPaletteTealBackground2,
  Green: tokens.colorPaletteGreenBackground2,
  Orange: tokens.colorPaletteMarigoldBackground2,
  Blue: tokens.colorPaletteRoyalBlueBackground2,
  Purple: tokens.colorPaletteLavenderBackground2,
  Amber: tokens.colorPaletteDarkOrangeBackground2,
};
