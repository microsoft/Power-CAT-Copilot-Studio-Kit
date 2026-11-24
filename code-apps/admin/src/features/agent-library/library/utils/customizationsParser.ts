/**
 * Parses customizations.xml from a solution ZIP.
 *
 * Extracts connection references and security role metadata in a single pass.
 * Used by AgentTemplateDialog to determine import requirements:
 * - Connection references → ComponentParameters for ImportSolutionAsync
 * - Security roles → escalated privilege check (System Administrator required)
 *
 * @see https://learn.microsoft.com/en-us/power-platform/alm/solution-async
 */

import type JSZip from 'jszip';
import type { SolutionConnectionReference } from '../contracts/types';
import { getConnectorDisplayName } from '../constants/connectorNames';

export interface CustomizationsParseResult {
  connectionReferences: SolutionConnectionReference[];
  hasSecurityRoles: boolean;
}

/** Reads and parses customizations.xml from the ZIP. Returns null if missing or malformed. */
async function getCustomizationsDoc(zip: JSZip): Promise<Document | null> {
  const custFile = zip.file('customizations.xml');
  if (!custFile) return null;

  const custXml = await custFile.async('string');
  const doc = new DOMParser().parseFromString(custXml, 'application/xml');

  if (doc.querySelector('parsererror')) {
    console.warn('[customizationsParser] XML parse error');
    return null;
  }

  return doc;
}

/** Extracts connection references from a parsed customizations.xml Document. */
function extractConnectionReferences(doc: Document): SolutionConnectionReference[] {
  const refs = doc.querySelectorAll('connectionreference');
  if (refs.length === 0) return [];

  return Array.from(refs).map((cr) => {
    const connectorId = cr.querySelector('connectorid')?.textContent?.trim() ?? '';
    const connectorName = connectorId.includes('/')
      ? connectorId.substring(connectorId.lastIndexOf('/') + 1)
      : connectorId;

    return {
      logicalName: cr.getAttribute('connectionreferencelogicalname') ?? '',
      displayName: cr.querySelector('connectionreferencedisplayname')?.textContent?.trim() ?? '',
      connectorId,
      connectorName,
      connectorDisplayName: getConnectorDisplayName(connectorName),
    };
  });
}

/**
 * Parses customizations.xml once, returns both connection references and security role detection.
 * Single XML parse — no duplication.
 */
export async function parseCustomizations(zip: JSZip): Promise<CustomizationsParseResult> {
  const doc = await getCustomizationsDoc(zip);
  if (!doc) return { connectionReferences: [], hasSecurityRoles: false };

  return {
    connectionReferences: extractConnectionReferences(doc),
    hasSecurityRoles: doc.querySelectorAll('Role[id][name]').length > 0,
  };
}

/**
 * Extracts only connection references from customizations.xml.
 * Convenience wrapper for callers that don't need role detection (e.g., ComponentDialog).
 */
export async function parseConnectionReferences(zip: JSZip): Promise<SolutionConnectionReference[]> {
  const doc = await getCustomizationsDoc(zip);
  if (!doc) return [];
  return extractConnectionReferences(doc);
}
