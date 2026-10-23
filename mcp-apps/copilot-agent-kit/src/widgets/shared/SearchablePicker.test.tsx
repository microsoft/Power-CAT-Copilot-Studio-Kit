import "@testing-library/jest-dom/vitest";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchablePicker } from "./SearchablePicker";

afterEach(cleanup);
const options = [
  { id: "first", label: "First conversation", detail: "2026-10-07 | saved-id-1" },
  { id: "second", label: "Second conversation", detail: "2025-01-01 | archived-id-2" },
];

describe("searchable selectors", () => {
  it("searches secondary IDs and supports keyboard selection", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<FluentProvider theme={webLightTheme}><SearchablePicker label="Conversation" options={options} onSelect={onSelect} /></FluentProvider>);
    const combo = screen.getByRole("combobox", { name: "Conversation" });
    await user.click(combo);
    await user.type(combo, "archived-id");
    expect(screen.getByRole("option", { name: /Second conversation/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /First conversation/ })).toBeNull();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onSelect).toHaveBeenCalledWith("second");
  });

  it("waits for remote searches without showing stale selectable rows", async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    render(<FluentProvider theme={webLightTheme}><SearchablePicker label="Conversation" options={options} onSelect={vi.fn()} onSearch={onSearch} /></FluentProvider>);
    const combo = screen.getByRole("combobox", { name: "Conversation" });
    await user.click(combo);
    await user.type(combo, " archived ");
    expect(combo).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("option", { name: "First conversation" })).toBeNull();
    await waitFor(() => expect(onSearch).toHaveBeenLastCalledWith("archived"));
  });

  it("shows errors and a disabled empty state, and clears the selected value", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(<FluentProvider theme={webLightTheme}><SearchablePicker label="Conversation" options={[]} selected={options[0]} onSelect={vi.fn()} onClear={onClear} error="The search failed." /></FluentProvider>);
    expect(screen.getByText(options[0].detail)).toBeInTheDocument();
    expect(screen.getByText("The search failed.")).toBeInTheDocument();
    await user.click(screen.getByRole("combobox", { name: "Conversation" }));
    expect(screen.getByRole("option", { name: "The search failed. Try again." })).toHaveAttribute("aria-disabled", "true");
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Clear conversation" }));
    expect(onClear).toHaveBeenCalledOnce();
  });
});
