import {
  Bot20Regular,
  BrainCircuit20Regular,
  BranchFork20Regular,
  ChatMultiple20Regular,
  Code20Regular,
  Flow20Regular,
  Play20Regular,
} from '@fluentui/react-icons';

type ActivityTypeIconProps = {
  type: string;
  className?: string;
};

export function ActivityTypeIcon({ type, className }: ActivityTypeIconProps) {
  if (type === 'Code') return <Code20Regular className={className} aria-hidden="true" />;
  if (type === 'MCP' || type === 'Model Context Protocol' || /^MCP\s*server$/i.test(type)) {
    return <Play20Regular className={className} aria-hidden="true" />;
  }
  if (type === 'Flow' || type === 'Connector Action' || type === 'Skill') {
    return <Flow20Regular className={className} aria-hidden="true" />;
  }
  if (type === 'Deep reasoning') {
    return <BrainCircuit20Regular className={className} aria-hidden="true" />;
  }
  if (type === 'Connected agent' || type === 'Child agent' || type === 'Custom Prompt') {
    return <Bot20Regular className={className} aria-hidden="true" />;
  }
  if (type === 'Topic') return <ChatMultiple20Regular className={className} aria-hidden="true" />;
  return <BranchFork20Regular className={className} aria-hidden="true" />;
}
