import type { ReactNode } from 'react';
import {
  BookRegular,
  BotRegular,
  BotSparkleRegular,
  ChatRegular,
  ClipboardTaskListLtrRegular,
  DocumentBulletListRegular,
  MoreHorizontalRegular,
  PlugConnectedRegular,
  PuzzlePieceRegular,
  ServerRegular,
  SettingsRegular,
  TextDescriptionRegular,
  WrenchRegular,
} from '@fluentui/react-icons';
import { ComponentType } from '../contracts/change-tracker';

/**
 * Glyph for each tracked component type, so the audit breakdown reads at a
 * glance instead of relying on initials.
 */
const COMPONENT_ICON: Record<number, ReactNode> = {
  [ComponentType.Agent]: <BotRegular />,
  [ComponentType.Settings]: <SettingsRegular />,
  [ComponentType.Description]: <TextDescriptionRegular />,
  [ComponentType.Instructions]: <DocumentBulletListRegular />,
  [ComponentType.Knowledge]: <BookRegular />,
  [ComponentType.Topic]: <ChatRegular />,
  [ComponentType.Connector]: <PlugConnectedRegular />,
  [ComponentType.Tool]: <WrenchRegular />,
  [ComponentType.Trigger]: <PuzzlePieceRegular />,
  [ComponentType.ChildAgent]: <BotSparkleRegular />,
  [ComponentType.Skill]: <PuzzlePieceRegular />,
  [ComponentType.Evaluation]: <ClipboardTaskListLtrRegular />,
  [ComponentType.MCP]: <ServerRegular />,
  [ComponentType.Other]: <MoreHorizontalRegular />,
};

/** Icon for a component type, falling back to a neutral glyph. */
export function componentIcon(type: number): ReactNode {
  return COMPONENT_ICON[type] ?? <MoreHorizontalRegular />;
}
