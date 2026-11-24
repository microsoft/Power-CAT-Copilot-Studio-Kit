/**
 * daIdGenerator.ts
 *
 * Generates a unique identifier for a DA manifest for deduplication.
 *
 * Primary: manifest.appId (from manifest.json → id)
 * Fallback: SHA-256 hash of the serialized declarativeAgent.json content
 *           if appId is absent or empty.
 *
 * Used as the cat_componentidunique value for upsert deduplication in Dataverse.
 */

import type { DAManifest } from '../contracts/DAManifest';

/**
 * Returns a stable unique identifier for a DA manifest.
 *
 * @param manifest - Parsed DA manifest
 * @returns appId if available, otherwise SHA-256 hash of key manifest fields
 */
export async function getDAIdentifier(manifest: DAManifest): Promise<string> {
  if (manifest.appId && manifest.appId.trim().length > 0) {
    return manifest.appId.trim();
  }

  // Fallback: hash of stable manifest fields (without iconBase64 — changes per file extraction)
  const content = JSON.stringify({
    daId: manifest.daId,
    name: manifest.name,
    instructions: manifest.instructions,
    schemaVersion: manifest.schemaVersion,
    developerName: manifest.developerName,
  });

  return await sha256(content);
}

async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
