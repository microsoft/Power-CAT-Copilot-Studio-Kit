import "@testing-library/jest-dom/vitest";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import CopyButton from "./CopyButton";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const view = (value: string) => <FluentProvider theme={webLightTheme}><CopyButton value={value} /></FluentProvider>;

it("shows Copied only after the clipboard write resolves", async () => {
  const user = userEvent.setup();
  let finishWrite: () => void = () => undefined;
  const writeText = vi.spyOn(navigator.clipboard, "writeText").mockImplementation(
    () => new Promise<void>((resolve) => { finishWrite = () => resolve(); }),
  );
  render(view("conversation-id"));
  const button = screen.getByRole("button", { name: "Copy to clipboard" });
  await user.click(button);
  expect(writeText).toHaveBeenCalledWith("conversation-id");
  // The tooltip opens on hover or focus after its show delay.
  expect(await screen.findByText("Copy to clipboard")).toBeInTheDocument();
  expect(button).toHaveAccessibleName("Copy to clipboard");
  expect(screen.queryByText("Copied!")).toBeNull();
  await act(async () => finishWrite());
  expect(await screen.findByRole("button", { name: "Copied" })).toBe(button);
  expect(await screen.findByText("Copied!")).toBeInTheDocument();
});

it("shows Copy failed, never Copied, and leaves no unhandled rejection when the host blocks the clipboard", async () => {
  const user = userEvent.setup();
  const writeText = vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new DOMException("Write permission denied.", "NotAllowedError"));
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => { unhandled.push(reason); };
  process.on("unhandledRejection", onUnhandled);
  try {
    render(view("conversation-id"));
    const button = screen.getByRole("button", { name: "Copy to clipboard" });
    const previousLabels: (string | null)[] = [];
    const observer = new MutationObserver((records) => { previousLabels.push(...records.map((record) => record.oldValue)); });
    observer.observe(button, { attributeFilter: ["aria-label"], attributeOldValue: true });
    await user.click(button);
    expect(await screen.findByRole("button", { name: "Copy failed" })).toBe(button);
    expect(await screen.findByText("Copy failed. The host blocked clipboard access.")).toBeInTheDocument();
    previousLabels.push(...observer.takeRecords().map((record) => record.oldValue));
    observer.disconnect();
    expect(previousLabels).not.toContain("Copied");
    expect(screen.queryByText("Copied!")).toBeNull();
    expect(writeText).toHaveBeenCalledWith("conversation-id");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(unhandled).toEqual([]);
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
});

it("treats a synchronous clipboard error as a failure and goes back to idle after 2 seconds", async () => {
  const user = userEvent.setup();
  vi.spyOn(navigator.clipboard, "writeText").mockImplementation(() => { throw new TypeError("The clipboard API is not available."); });
  render(view("conversation-id"));
  const button = screen.getByRole("button", { name: "Copy to clipboard" });
  await user.click(button);
  expect(await screen.findByRole("button", { name: "Copy failed" })).toBe(button);
  expect(screen.queryByText("Copied!")).toBeNull();
  await waitFor(() => expect(button).toHaveAccessibleName("Copy to clipboard"), { timeout: 5000 });
});
