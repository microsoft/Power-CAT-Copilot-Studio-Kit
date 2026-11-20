/**
 * zipTypeDetector.ts
 *
 * Detects whether a ZIP file is a Declarative Agent package,
 * a Copilot Studio solution ZIP, or an unknown type.
 *
 * Detection logic:
 * - DA package: manifest.json exists AND contains copilotAgents.declarativeAgents
 * - CS solution ZIP: [Content_Types].xml OR solution.xml exists at root
 * - unknown: neither condition matches
 */

import JSZip from 'jszip';

export type ZipType = 'declarative-agent' | 'copilot-studio' | 'unknown';

/**
 * Detects the type of a ZIP file without fully parsing it.
 *
 * @param file - The ZIP file to inspect
 * @returns The detected ZIP type
 */
export async function detectZipType(file: File): Promise<ZipType> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error('Could not read ZIP file. Ensure the file is a valid .zip archive.');
  }

  // Check for DA package: manifest.json with copilotAgents.declarativeAgents
  if (zip.files['manifest.json']) {
    try {
      const manifestText = await zip.files['manifest.json'].async('string');
      const manifest = JSON.parse(manifestText) as Record<string, unknown>;
      const copilotAgents = manifest?.copilotAgents as Record<string, unknown> | undefined;
      const declarativeAgents = copilotAgents?.declarativeAgents as unknown[] | undefined;
      if (Array.isArray(declarativeAgents) && declarativeAgents.length > 0) {
        return 'declarative-agent';
      }
    } catch {
      // manifest.json exists but is not valid JSON — fall through to other checks
    }
  }

  // Check for CS solution ZIP
  if (zip.files['[Content_Types].xml'] || zip.files['solution.xml']) {
    return 'copilot-studio';
  }

  return 'unknown';
}
