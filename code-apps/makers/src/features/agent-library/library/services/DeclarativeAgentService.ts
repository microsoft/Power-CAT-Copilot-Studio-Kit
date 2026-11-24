/**
 * DeclarativeAgentService — Parse, modify, and re-zip declarative agent manifests.
 *
 * Declarative agents are M365 Copilot agents packaged as ZIP files containing
 * a declarativeAgent*.json manifest. This service handles the client-side
 * edit-and-download flow: parse the JSON from a ZIP, build a modified version
 * with user edits, write it back, and trigger a browser download.
 */

import JSZip from 'jszip';
import type {
  DeclarativeAgentManifest,
  ParsedDeclarativeAgent,
  CreateDeclarativeAgentInput,
  ConversationStarter,
  DeclarativeCapability,
} from '../contracts/declarative-agent';

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

/**
 * Find and parse the declarativeAgent*.json manifest from a JSZip instance.
 * Handles both `declarativeAgent_0.json` and `declarativeAgent.json` naming.
 */
export async function parseManifest(zip: JSZip): Promise<ParsedDeclarativeAgent> {
  const files = zip.file(/declarativeAgent.*\.json/);
  if (!files.length) {
    throw new Error('No declarativeAgent JSON found in ZIP');
  }

  const file = files[0];
  const content = await file.async('text');
  const manifest: DeclarativeAgentManifest = JSON.parse(content);

  const hasSharePoint = manifest.capabilities.some(
    (cap) => Array.isArray(cap.items_by_url) && cap.items_by_url.length > 0,
  );

  return { manifest, manifestFilename: file.name, hasSharePoint };
}

// ---------------------------------------------------------------------------
// Modify
// ---------------------------------------------------------------------------

/**
 * Build a modified manifest from user edits.
 * Preserves version, id, actions, behavior_overrides, and all unknown fields.
 */
export function buildModifiedManifest(
  original: DeclarativeAgentManifest,
  edits: {
    name: string;
    description: string;
    instructions: string;
    capabilities: Record<string, boolean>;
    sharePointUrls: string[];
    starters: ConversationStarter[];
    hasSharePoint: boolean;
  },
): DeclarativeAgentManifest {
  // Filter out empty starters (both title and text empty)
  const filteredStarters = edits.starters.filter(
    (s) => s.title.trim() !== '' || s.text.trim() !== '',
  );

  let capabilities: DeclarativeCapability[];

  if (edits.hasSharePoint) {
    // SharePoint variant: rebuild items_by_url from the dynamic URL list
    // Only include valid, non-empty URLs
    const validUrls = edits.sharePointUrls
      .map((u) => u.trim())
      .filter((u) => u !== '');

    capabilities = original.capabilities.map((cap) => {
      if (cap.items_by_url) {
        return {
          ...cap,
          items_by_url: validUrls.map((url) => ({ url })),
        };
      }
      return cap;
    });
  } else {
    // Toggle variant: rebuild capabilities from Record<string, boolean>
    capabilities = Object.entries(edits.capabilities)
      .filter(([, enabled]) => enabled)
      .map(([name]) => {
        const existing = original.capabilities.find((c) => c.name === name);
        return existing ? { ...existing } : { name };
      });
  }

  return {
    ...original,
    name: edits.name,
    description: edits.description,
    instructions: edits.instructions,
    capabilities,
    conversation_starters: filteredStarters,
  };
}

// ---------------------------------------------------------------------------
// Icon resize helper
// ---------------------------------------------------------------------------

/**
 * Resize a PNG data URL to the given dimensions using an off-screen Canvas
 * and return the result as a Uint8Array of PNG bytes.
 *
 * Uses the synchronous toDataURL + atob path (no toBlob callback chain) so
 * the bytes are reliably available inside the same task before generateAsync runs.
 */
function resizeIconToPng(dataUrl: string, width: number, height: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas 2D context unavailable'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        // toDataURL is synchronous — no async callback race with generateAsync
        const resizedDataUrl = canvas.toDataURL('image/png');
        const base64 = resizedDataUrl.split(',')[1];
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        resolve(bytes);
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    };
    img.onerror = () => reject(new Error('Failed to load icon data URL'));
    img.src = dataUrl;
  });
}

/**
 * Replace an icon file in the ZIP with a resized version of the supplied data URL.
 * Looks up the existing file path by name pattern; if not found the file is created
 * alongside the manifest (same directory).
 */
async function replaceZipIcon(
  zip: JSZip,
  manifestFilename: string,
  fileNamePattern: RegExp,
  fallbackName: string,
  dataUrl: string,
  width: number,
  height: number,
): Promise<void> {
  const pngBytes = await resizeIconToPng(dataUrl, width, height);

  const existing = zip.file(fileNamePattern);
  const targetPath =
    existing.length > 0
      ? existing[0].name
      : `${manifestFilename.substring(0, manifestFilename.lastIndexOf('/') + 1)}${fallbackName}`;

  zip.file(targetPath, pngBytes);
}

// ---------------------------------------------------------------------------
// Teams manifest (manifest.json) updater
// ---------------------------------------------------------------------------

/**
 * Find manifest.json in the ZIP and patch name.full + description.full.
 *
 * The Teams app manifest lives alongside the declarativeAgent JSON and carries
 * its own name/description blocks:
 *   { "name": { "short": "...", "full": "<agent name>" },
 *     "description": { "short": "...", "full": "<agent description>" } }
 *
 * If manifest.json is not present the function returns silently.
 */
async function updateTeamsManifest(
  zip: JSZip,
  name: string,
  description: string,
): Promise<void> {
  // Match any file whose path ends with manifest.json (case-insensitive).
  // declarativeAgent*.json files don't match this pattern so no collision risk.
  const files = zip.file(/manifest\.json$/i);
  if (!files.length) return;

  const file = files[0];
  let doc: Record<string, unknown>;
  try {
    doc = JSON.parse(await file.async('text')) as Record<string, unknown>;
  } catch {
    return; // Malformed JSON — skip rather than corrupt the file
  }

  if (doc.name && typeof doc.name === 'object' && doc.name !== null) {
    (doc.name as Record<string, unknown>).short = name;
    (doc.name as Record<string, unknown>).full = name;
  }
  if (doc.description && typeof doc.description === 'object' && doc.description !== null) {
    (doc.description as Record<string, unknown>).full = description;
  }

  zip.file(file.name, JSON.stringify(doc, null, 4));
}

// ---------------------------------------------------------------------------
// Create & Download
// ---------------------------------------------------------------------------

/**
 * Write the modified manifest (and optionally a custom icon) back to the ZIP
 * and trigger a browser download.
 *
 * When `iconDataUrl` is provided the uploaded PNG is resized and written as:
 *   - Color.png   → 192 × 192
 *   - Outline.png → 32 × 32
 */
export async function createAndDownload(input: CreateDeclarativeAgentInput): Promise<Blob> {
  // Write modified declarativeAgent JSON back to ZIP
  input.zipInstance.file(
    input.manifestFilename,
    JSON.stringify(input.editedManifest, null, 4),
  );

  // Sync name.full and description.full in the Teams manifest.json
  await updateTeamsManifest(
    input.zipInstance,
    input.editedManifest.name,
    input.editedManifest.description,
  );

  // Replace icon files when a custom icon was uploaded
  if (input.iconDataUrl) {
    await Promise.all([
      replaceZipIcon(
        input.zipInstance,
        input.manifestFilename,
        /Color\.png$/i,
        'Color.png',
        input.iconDataUrl,
        192,
        192,
      ),
      replaceZipIcon(
        input.zipInstance,
        input.manifestFilename,
        /Outline\.png$/i,
        'Outline.png',
        input.iconDataUrl,
        32,
        32,
      ),
    ]);
  }

  // Generate blob
  const blob = await input.zipInstance.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  // Trigger browser download
  const sanitizedName = input.templateName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${sanitizedName}_modified.zip`;
  anchor.click();
  URL.revokeObjectURL(url);

  return blob;
}
