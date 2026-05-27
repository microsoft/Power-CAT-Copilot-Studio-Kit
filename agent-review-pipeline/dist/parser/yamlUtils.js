import yaml from 'js-yaml';
/**
 * Preprocess YAML content to normalize formatting.
 */
export function preprocessYaml(content) {
    if (!content || content.trim() === '') {
        return content;
    }
    const lines = content.split('\n');
    const processed = [];
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
            }
            else {
                processedLine = `${adjustedSpace}${key}${valueAndRest}`;
            }
        }
        else {
            processedLine = ' '.repeat(spaceCount) + trimmedLine;
        }
        processed.push(processedLine);
    }
    return processed.join('\n');
}
/**
 * Extract agent instructions from parsed YAML or raw content.
 */
export function extractAgentInstructions(parsedYaml, rawContent) {
    const instructions = parsedYaml?.instructions ??
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
export function isValidYamlStructure(content) {
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
/**
 * Extract variables from YAML object or array formats.
 */
export function extractVariables(vars) {
    if (!vars) {
        return [];
    }
    if (typeof vars === 'object' && !Array.isArray(vars)) {
        return Object.entries(vars).map(([key, value]) => {
            const varValue = value;
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
            const variable = item;
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
export class YamlParsingService {
    /**
     * Preprocess YAML content to fix common issues.
     */
    preprocessYAML(yamlContent) {
        return preprocessYaml(yamlContent);
    }
    /**
     * Parse YAML content to a JavaScript object.
     */
    parseYAML(yamlContent) {
        return this.parseYaml(yamlContent);
    }
    /**
     * Extract agent instructions from parsed YAML.
     */
    extractAgentInstructions(parsedYaml) {
        const instructions = extractAgentInstructions(parsedYaml, '');
        return instructions || undefined;
    }
    /**
     * Parse bot component YAML.
     */
    parseComponentYAML(yamlContent) {
        return this.parseYaml(yamlContent);
    }
    parseYaml(content) {
        try {
            if (!isValidYamlStructure(content)) {
                return null;
            }
            const preprocessed = preprocessYaml(content);
            try {
                return yaml.load(preprocessed);
            }
            catch {
                try {
                    return yaml.load(content);
                }
                catch {
                    return null;
                }
            }
        }
        catch {
            return null;
        }
    }
}
export const yamlParsingService = new YamlParsingService();
