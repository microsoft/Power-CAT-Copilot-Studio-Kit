import type { App } from "@modelcontextprotocol/ext-apps";

export async function downloadJson(app: App, fileName: string, text: string): Promise<void> {
  const safeName = fileName.replace(/[^A-Za-z0-9_.-]/g, "-").replace(/\.json$/i, "").slice(0, 120) + ".json";
  return downloadText(app, safeName, text, "application/json");
}

export async function downloadText(app: App, fileName: string, text: string, mimeType: string): Promise<void> {
  if (!app.getHostCapabilities()?.downloadFile) {
    throw new Error("This host does not support file downloads. Copy the complete export text instead.");
  }
  const safeName = fileName.replace(/[^A-Za-z0-9_.-]/g, "-").slice(0, 128);
  const result = await app.downloadFile({
    contents: [{
      type: "resource",
      resource: { uri: `file:///${safeName}`, mimeType, text },
    }],
  });
  if (result.isError) throw new Error("The host denied or cancelled the download.");
}
