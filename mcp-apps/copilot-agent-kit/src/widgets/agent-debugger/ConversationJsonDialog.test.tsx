import "@testing-library/jest-dom/vitest";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { App } from "@modelcontextprotocol/ext-apps";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ConversationTranscriptJson } from "../../agent-debugger/contracts/diagnostics";
import { ConversationJsonDialog } from "./ConversationJsonDialog";

let app: App;
vi.mock("../shared/McpAppProvider", () => ({ useMcpApp: () => ({ app }) }));
beforeEach(() => {
  app = new App({ name: "JSON UI test", version: "1.0.0" });
  vi.spyOn(app, "getHostCapabilities").mockReturnValue({ downloadFile: {} });
});
afterEach(cleanup);

const json: ConversationTranscriptJson = {
  conversationId: "saved", recordCount: 1, activityCount: 2,
  records: [{ conversationtranscriptid: "record", name: "saved", content: { activities: [{ id: "first", text: "First session" }, { id: "second", text: "Second session" }] } }],
};
function view(onLoad: () => Promise<ConversationTranscriptJson>, onClose = vi.fn()) {
  return <FluentProvider theme={webLightTheme}><ConversationJsonDialog conversationId="saved" onLoad={onLoad} onClose={onClose} /></FluentProvider>;
}

it("loads JSON on request and downloads all records through the host protocol", async () => {
  const user = userEvent.setup();
  const onLoad = vi.fn().mockResolvedValue(json);
  const download = vi.spyOn(app, "downloadFile").mockResolvedValue({});
  render(view(onLoad));
  expect(await screen.findByText("1 saved record | 2 activities")).toBeInTheDocument();
  expect(onLoad).toHaveBeenCalledOnce();
  await user.click(screen.getByRole("button", { name: "Download conversation JSON" }));
  expect(download).toHaveBeenCalledWith({
    contents: [{ type: "resource", resource: { uri: "file:///conversation-saved.json", mimeType: "application/json", text: JSON.stringify(json, null, 2) } }],
  });
  expect(screen.getByText("The host accepted the download request.")).toBeInTheDocument();
});

it("shows a load failure and retries without a partial success state", async () => {
  const user = userEvent.setup();
  const onLoad = vi.fn().mockRejectedValueOnce(new Error("The transcript exceeds the 500-record limit.")).mockResolvedValue(json);
  render(view(onLoad));
  expect(await screen.findByText("The transcript exceeds the 500-record limit.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Download conversation JSON" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Retry JSON load" }));
  expect(await screen.findByText("1 saved record | 2 activities")).toBeInTheDocument();
  expect(onLoad).toHaveBeenCalledTimes(2);
});

it("keeps inspection available when downloads are unsupported and surfaces host denial", async () => {
  const user = userEvent.setup();
  vi.mocked(app.getHostCapabilities).mockReturnValue({});
  const onLoad = vi.fn().mockResolvedValue(json);
  const rendered = render(view(onLoad));
  await screen.findByText("1 saved record | 2 activities");
  expect(screen.getByRole("button", { name: "Download conversation JSON" })).toBeDisabled();
  expect(screen.getByRole("textbox", { name: "Search JSON content" })).toBeEnabled();
  vi.mocked(app.getHostCapabilities).mockReturnValue({ downloadFile: {} });
  vi.spyOn(app, "downloadFile").mockResolvedValue({ isError: true });
  rendered.rerender(view(onLoad));
  await user.click(screen.getByRole("button", { name: "Download conversation JSON" }));
  expect(await screen.findByText("The host denied or cancelled the download.")).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Search JSON content" })).toBeEnabled();
});

it("surfaces clipboard denial and supports Escape close", async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();
  vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("Denied"));
  render(view(vi.fn().mockResolvedValue(json), onClose));
  await screen.findByText("1 saved record | 2 activities");
  await user.click(screen.getByRole("button", { name: "Copy JSON" }));
  expect(await screen.findByText(/The host blocked clipboard access/)).toBeInTheDocument();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(onClose).toHaveBeenCalled());
});
