import type { FlowStep } from '../../contracts/flow-step';

type ActivityIconContext = {
  stepKind?: FlowStep['kind'];
  taskDialogId?: string;
  stepKey?: string;
};

export function resolveActivityIconType(
  type: string,
  context: ActivityIconContext = {},
): string {
  if (
    context.stepKind === 'mcp' ||
    context.taskDialogId?.startsWith('MCP:') ||
    context.stepKey?.startsWith('MCP:')
  ) {
    return 'MCP server';
  }

  return type;
}
