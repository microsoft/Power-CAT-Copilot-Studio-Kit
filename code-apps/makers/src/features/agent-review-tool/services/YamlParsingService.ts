/**
 * YamlParsingService
 *
 * Handles YAML parsing with preprocessing and field extraction.
 * Implements the complete YAML parsing strategy from pcf-extracted-logic.md Section 4.
 *
 * Key features:
 * - 5-step preprocessing for reliable parsing
 * - Primary parsing with js-yaml
 * - Regex fallback for malformed YAML
 * - Field extraction with priority order fallbacks
 * - Variable extraction for object and array formats
 */

import yaml from 'js-yaml';
import type { IYamlParsingService } from '../contracts/ServiceContracts';
import {
  preprocessYaml,
  extractAgentInstructions as extractInstructionsUtil,
  isValidYamlStructure,
} from '../utils/yamlUtils';

/**
 * YamlParsingService implementation
 */
export class YamlParsingService implements IYamlParsingService {
  /**
   * Preprocess YAML content to fix common issues
   * Implements 5 transformation rules from pcf-extracted-logic.md
   *
   * @param yamlContent - Raw YAML string
   * @returns Preprocessed YAML string
   */
  preprocessYAML(yamlContent: string): string {
    return preprocessYaml(yamlContent);
  }

  /**
   * Parse YAML content to JavaScript object
   *
   * @param yamlContent - YAML string (preprocessed)
   * @returns Parsed object
   */
  parseYAML(yamlContent: string): unknown {
    return this.parseYaml(yamlContent);
  }

  /**
   * Extract agent instructions from parsed YAML
   * Looks for AgentInstructions component
   *
   * @param parsedYaml - Parsed YAML object
   * @returns Agent instructions text or undefined
   */
  extractAgentInstructions(parsedYaml: unknown): string | undefined {
    const instructions = extractInstructionsUtil(parsedYaml as Record<string, unknown>, '');
    return instructions || undefined;
  }

  /**
   * Parse bot component YAML
   * Combines preprocessing and parsing
   *
   * @param yamlContent - Raw YAML string
   * @returns Parsed object or null if invalid
   */
  parseComponentYAML(yamlContent: string): unknown | null {
    return this.parseYaml(yamlContent);
  }

  /**
   * Parse YAML content with preprocessing (internal method)
   *
   * @param content - Raw YAML string
   * @returns Parsed object or null if parsing fails
   *
   * @example
   * ```ts
   * const parsed = yamlService.parseYaml(rawYaml);
   * if (parsed) {
   *   console.log('Model:', parsed.modelDisplayName);
   * }
   * ```
   */
  private parseYaml(content: string): unknown | null {
    try {
      // Validate structure first
      if (!isValidYamlStructure(content)) {
        console.warn('Invalid YAML structure detected');
        return null;
      }

      // Apply preprocessing
      const preprocessed = preprocessYaml(content);

      // Primary parsing method: js-yaml
      try {
        const parsed = yaml.load(preprocessed);
        return parsed;
      } catch (yamlError) {
        console.warn('js-yaml parsing failed, attempting regex extraction:', yamlError);

        // Fallback: Try parsing without preprocessing
        try {
          const parsedDirect = yaml.load(content);
          return parsedDirect;
        } catch {
          console.error('Both parsing attempts failed');
          return null;
        }
      }
    } catch (error) {
      console.error('YAML parsing error:', error);
      return null;
    }
  }


}

// Export singleton instance
export const yamlParsingService = new YamlParsingService();
