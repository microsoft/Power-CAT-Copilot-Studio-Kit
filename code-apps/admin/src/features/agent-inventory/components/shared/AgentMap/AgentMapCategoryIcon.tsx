import {
  BeakerRegular,
  BotRegular,
  BotSparkleRegular,
  BookOpenRegular,
  BrainCircuitRegular,
  CodeRegular,
  DatabaseRegular,
  ErrorCircleRegular,
  FlashRegular,
  PlugConnectedRegular,
  PuzzlePieceRegular,
  WrenchRegular,
} from '@fluentui/react-icons';
import type { AgentMapNodeCategory } from './AgentMap.types';

interface AgentMapCategoryIconProps {
  category: AgentMapNodeCategory;
}

export function AgentMapCategoryIcon({ category }: AgentMapCategoryIconProps) {
  switch (category) {
    case 'agent':
      return <BotSparkleRegular />;
    case 'connected-agent':
      return <BotRegular />;
    case 'tool':
      return <WrenchRegular />;
    case 'prompt':
      return <BrainCircuitRegular />;
    case 'http-action':
      return <CodeRegular />;
    case 'connection':
      return <PlugConnectedRegular />;
    case 'skill':
      return <PuzzlePieceRegular />;
    case 'knowledge':
      return <BookOpenRegular />;
    case 'classic-data-source':
      return <DatabaseRegular />;
    case 'trigger':
      return <FlashRegular />;
    case 'evaluation':
      return <BeakerRegular />;
    default:
      return <ErrorCircleRegular />;
  }
}
