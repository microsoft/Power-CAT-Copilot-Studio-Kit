import yaml from 'js-yaml';
import type { IYamlParsingService } from '../models/types.js';

/**
 * Preprocess YAML content to normalize formatting.
 */
export function preprocessYaml(content: string): string {
  if (!content || content.trim() === '') {
    return content;
  }

  const lines = content.split('\n');
  const processed: string[] = [];
  let previousIndent = 0;

  for (const line of lines) {
    let processedLine = line.replace(/\t/g, '  ');

    if (processedLine.trim() === '') {
      processed.push(processedLine);
      continue;
    }

    const leadingSpaces = processedLine.match(/^\s*/)?.[0].length ?? 0;
    let spaceCount = leadingSpaces;

    if (spaceCount % 2 !== 0) {
      spaceCount = Math.floor(spaceCount / 2) * 2;
    }

    if (spaceCount > previousIndent + 4) {
      spaceCount = previousIndent + 2;
    }

    previousIndent = spaceCount;

    const trimmedLine = processedLine.trim();
    const colonIndex = trimmedLine.indexOf(':');

    if (colonIndex > 0) {
      const key = trimmedLine.substring(0, colonIndex);
      const valueAndRest = trimmedLine.substring(colonIndex);
      const adjustedSpace = ' '.repeat(spaceCount);

      if (/^[@&*!|>%]/.test(key) && !/^['"]/.test(key)) {
        processedLine = `${adjustedSpace}'${key}'${valueAndRest}`;
      } else {
        processedLine = `${adjustedSpace}${key}${valueAndRest}`;
      }
    } else {
      processedLine = ' '.repeat(spaceCount) + trimmedLine;
    }

    processed.push(processedLine);
  }

  return processed.join('\n');
}

/**
 * Extract agent instructions from parsed YAML or raw content.
 */
export function extractAgentInstructions(parsedYaml: Record<string, unknown>, rawContent: string): string {
  const instructions =
    parsedYaml?.instructions ??
    parsedYaml?.systemInstructions ??
    parsedYaml?.prompt ??
    parsedYaml?.agentInstructions ??
    parsedYaml?.instruction ??
    parsedYaml?.systemPrompt;

  if (instructions && typeof instructions === 'string') {
    return instructions.trim();
  }

  const patterns = [
    /(?:^|\n)\s*(?:instructions|prompt|agentInstructions|instruction|systemPrompt)\s*:\s*([\s\S]+?)(?=\n\s*\w+\s*:|$)/i,
    /(?:^|\n)\s+(?:instructions|prompt|agentInstructions|instruction|systemPrompt)\s*:\s*([\s\S]+?)(?=\n\s*\w+\s*:|$)/i,
    /(?:instructions|prompt|agentInstructions|instruction|systemPrompt)\s*:\s*\n\s+([\s\S]+?)(?=\n\S|\n\s*\w+\s*:|$)/i,
    /(?:instructions|prompt|agentInstructions|instruction|systemPrompt)\s*:\s*([^\n]*(?:\n(?!\w+:)[^\n]*)*)/i,
  ];

  for (const pattern of patterns) {
    const match = rawContent.match(pattern);
    if (match?.[1]) {
      const extracted = match[1].trim();
      if (extracted) {
        return extracted;
      }
    }
  }

  return '';
}

/**
 * Validate YAML content structure without fully parsing it.
 */
export function isValidYamlStructure(content: string): boolean {
  if (!content || content.trim() === '') {
    return false;
  }

  const hasKeyValuePair = /^\s*[\w-]+\s*:/m.test(content);
  if (!hasKeyValuePair) {
    return false;
  }

  const openBrackets = (content.match(/\[/g) || []).length;
  const closeBrackets = (content.match(/\]/g) || []).length;
  const openBraces = (content.match(/\{/g) || []).length;
  const closeBraces = (content.match(/\}/g) || []).length;

  return openBrackets === closeBrackets && openBraces === closeBraces;
}

interface VariableValue {
  displayName?: string;
  description?: string;
  name?: string;
  VariableName?: string;
  VariableDescription?: string;
}

/**
 * Extract variables from YAML object or array formats.
 */
export function extractVariables(
  vars: unknown,
): Array<{
  VariableName: string;
  displayName?: string;
  VariableDescription?: string;
}> {
  if (!vars) {
    return [];
  }

  if (typeof vars === 'object' && !Array.isArray(vars)) {
    return Object.entries(vars).map(([key, value]) => {
      const varValue = value as VariableValue;
      return {
        VariableName: key,
        displayName: varValue?.displayName,
        VariableDescription: varValue?.description,
      };
    });
  }

  if (Array.isArray(vars)) {
    return vars.map((item) => {
      if (typeof item === 'string') {
        return { VariableName: item };
      }

      const variable = item as VariableValue;
      return {
        VariableName: variable.name || variable.VariableName || '',
        displayName: variable.displayName,
        VariableDescription: variable.description || variable.VariableDescription,
      };
    });
  }

  return [];
}

/**
 * YAML parsing service used by Stage A.
 */
export class YamlParsingService implements IYamlParsingService {
  /**
   * Preprocess YAML content to fix common issues.
   */
  preprocessYAML(yamlContent: string): string {
    return preprocessYaml(yamlContent);
  }

  /**
   * Parse YAML content to a JavaScript object.
   */
  parseYAML(yamlContent: string): unknown {
    return this.parseYaml(yamlContent);
  }

  /**
   * Extract agent instructions from parsed YAML.
   */
  extractAgentInstructions(parsedYaml: unknown): string | undefined {
    const instructions = extractAgentInstructions(parsedYaml as Record<string, unknown>, '');
    return instructions || undefined;
  }

  /**
   * Parse bot component YAML.
   */
  parseComponentYAML(yamlContent: string): unknown | null {
    return this.parseYaml(yamlContent);
  }

  private parseYaml(content: string): unknown | null {
    try {
      if (!isValidYamlStructure(content)) {
        return null;
      }

      const preprocessed = preprocessYaml(content);

      try {
        return yaml.load(preprocessed);
      } catch {
        try {
          return yaml.load(content);
        } catch {
          return null;
        }
      }
    } catch {
      return null;
    }
  }
}

export const yamlParsingService = new YamlParsingService();
