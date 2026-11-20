import { createRoot } from "react-dom/client";
import { createDOMRenderer, RendererProvider } from "@griffel/react";
import type { OfflineConversationSnapshot } from "../contracts/offline-viewer";
import { OfflineApp } from "./App";

const root = document.getElementById("offline-root");
const data = document.getElementById("offline-data");
if (root && data?.textContent) {
  const snapshot = JSON.parse(data.textContent) as OfflineConversationSnapshot;
  const insertionPoint = document.getElementById("offline-style-insertion-point");
  if (!insertionPoint) throw new Error("Offline stylesheet insertion point is missing.");
  // Match the live cascade: Fluent base styles precede the shared workspace CSS.
  const renderer = createDOMRenderer(document, { insertionPoint });
  createRoot(root).render(
    <RendererProvider renderer={renderer} targetDocument={document}>
      <OfflineApp snapshot={snapshot} />
    </RendererProvider>,
  );
}
