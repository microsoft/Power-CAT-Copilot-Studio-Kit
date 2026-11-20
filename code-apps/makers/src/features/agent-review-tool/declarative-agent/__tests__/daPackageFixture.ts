import JSZip from 'jszip';

/** Options for one synthetic declarative-agent package. */
export interface DAPackageOptions {
  app?: Record<string, unknown>;
  agent?: Record<string, unknown>;
  files?: Record<string, string>;
}

/**
 * Builds a synthetic Contoso app package with one v1.8 declarative agent.
 * Values in `app` and `agent` replace the defaults; `files` adds package files.
 */
export async function makeDAPackage(options: DAPackageOptions = {}): Promise<File> {
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify({
    id: '11111111-1111-1111-1111-111111111111',
    version: '1.0.0',
    manifestVersion: '1.17',
    name: { short: 'Contoso agent', full: 'Contoso agent' },
    description: { short: 'Short app description', full: 'Full app description' },
    developer: { name: 'Contoso' },
    accentColor: '#FFFFFF',
    copilotAgents: {
      declarativeAgents: [{
        id: 'contoso-agent',
        file: 'declarativeAgent.json',
      }],
    },
    ...options.app,
  }));
  zip.file('declarativeAgent.json', JSON.stringify({
    $schema: 'https://developer.microsoft.com/json-schemas/copilot/declarative-agent/v1.6/schema.json',
    version: 'v1.8',
    id: 'contoso-agent',
    name: 'Contoso agent',
    description: 'Helps with Contoso work.',
    instructions: 'Use the supplied knowledge and explain the result.',
    conversation_starters: [],
    actions: [],
    ...options.agent,
  }));
  for (const [path, content] of Object.entries(options.files ?? {})) {
    zip.file(path, content);
  }
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  return bytes as unknown as File;
}
