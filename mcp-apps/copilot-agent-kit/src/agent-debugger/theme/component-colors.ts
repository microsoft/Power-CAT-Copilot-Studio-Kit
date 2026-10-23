/**
 * Component colour palette.
 *
 * Locked to the approved data-visualisation slots so every surface in the app
 * (timeline bars, flow nodes, legends, breakdown bars) colours a component type
 * identically.
 *
 * Each component type has its own data-visualisation colour. This keeps legends
 * unambiguous when several types appear in the same transcript.
 */
export const DATA_SLOT = {
  data1: '#637CEF',
  data2: '#E3008C',
  data3: '#2AA0A4',
  data4: '#9373C0',
  data5: '#13A10E',
  data6: '#3A96DD',
  data7: '#CA5010',
  data8: '#57811B',
  data9: '#B146C2',
  data10: '#AE8C00',
  data11: '#004E8C',
  data12: '#C239B3',
  data13: '#986F0B',
  data14: '#D13438',
  data15: '#00B7C3',
  data16: '#8764B8',
  data17: '#498205',
  data18: '#8E562E',
  data19: '#005B70',
} as const;

/**
 * Diagnostic node types surfaced by `buildFlowSteps` that are not component
 * types in the Copilot Studio sense. They get their own slots so they never
 * collide with a real component colour in the legend.
 */
const DIAGNOSTIC_COLORS: Readonly<Record<string, string>> = {
  'Chain of thought': DATA_SLOT.data16,
  'Intent Recognition': DATA_SLOT.data15,
  'Variable assignment': DATA_SLOT.data18,
  Error: DATA_SLOT.data14,
  'Generative answers': DATA_SLOT.data17,
  'Model Context Protocol': DATA_SLOT.data19,
};

export const COMPONENT_COLORS: Readonly<Record<string, string>> = {
  Topic: DATA_SLOT.data1,
  Knowledge: DATA_SLOT.data5,
  Tool: DATA_SLOT.data6,
  'Connected agent': DATA_SLOT.data3,
  'Child agent': DATA_SLOT.data4,
  'Custom Prompt': DATA_SLOT.data9,
  Flow: '#8A8886',
  'Connector Action': DATA_SLOT.data8,
  Skill: DATA_SLOT.data10,
  'MCP server': DATA_SLOT.data11,
  'MCP tool': DATA_SLOT.data19,
  Code: DATA_SLOT.data2,
  'Deep reasoning': DATA_SLOT.data12,
};

export const DEFAULT_COMPONENT_COLOR = DATA_SLOT.data1;

/** Resolves the palette colour for a component/step type. */
export function componentColor(type: string | undefined, override?: string): string {
  if (!type) return override ?? DEFAULT_COMPONENT_COLOR;
  if (type === 'MCPServer') return COMPONENT_COLORS['MCP server'];
  if (type.startsWith('Scope:')) return DATA_SLOT.data13;
  return COMPONENT_COLORS[type] ?? DIAGNOSTIC_COLORS[type] ?? override ?? DEFAULT_COMPONENT_COLOR;
}
