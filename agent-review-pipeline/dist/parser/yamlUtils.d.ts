import type { IYamlParsingService } from '../models/types.js';
/**
 * Preprocess YAML content to normalize formatting.
 */
export declare function preprocessYaml(content: string): string;
/**
 * Extract agent instructions from parsed YAML or raw content.
 */
export declare function extractAgentInstructions(parsedYaml: Record<string, unknown>, rawContent: string): string;
/**
 * Validate YAML content structure without fully parsing it.
 */
export declare function isValidYamlStructure(content: string): boolean;
/**
 * Extract variables from YAML object or array formats.
 */
export declare function extractVariables(vars: unknown): Array<{
    VariableName: string;
    displayName?: string;
    VariableDescription?: string;
}>;
/**
 * YAML parsing service used by Stage A.
 */
export declare class YamlParsingService implements IYamlParsingService {
    /**
     * Preprocess YAML content to fix common issues.
     */
    preprocessYAML(yamlContent: string): string;
    /**
     * Parse YAML content to a JavaScript object.
     */
    parseYAML(yamlContent: string): unknown;
    /**
     * Extract agent instructions from parsed YAML.
     */
    extractAgentInstructions(parsedYaml: unknown): string | undefined;
    /**
     * Parse bot component YAML.
     */
    parseComponentYAML(yamlContent: string): unknown | null;
    private parseYaml;
}
export declare const yamlParsingService: YamlParsingService;
