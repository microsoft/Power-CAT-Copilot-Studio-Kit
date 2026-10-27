import "@testing-library/jest-dom/vitest";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
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

  it("opens with the loaded options and searches only a typed query", async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    const onOpen = vi.fn();
    render(<FluentProvider theme={webLightTheme}><SearchablePicker label="Conversation" options={options} onSelect={vi.fn()} onSearch={onSearch} onOpen={onOpen} /></FluentProvider>);
    const combo = screen.getByRole("combobox", { name: "Conversation" });
    await user.click(combo);
    expect(onOpen).toHaveBeenCalledOnce();
    expect(screen.getAllByRole("option")).toHaveLength(2);
    expect(combo).toHaveAttribute("aria-busy", "false");
    await act(() => new Promise<void>(resolve => { window.setTimeout(resolve, 300); }));
    expect(onSearch).not.toHaveBeenCalled();
    await user.keyboard("archived");
    await waitFor(() => expect(onSearch).toHaveBeenCalledWith("archived"));
    expect(onSearch).toHaveBeenCalledOnce();
    await user.keyboard("{Backspace>8/}");
    await waitFor(() => expect(onSearch).toHaveBeenLastCalledWith(""));
    expect(onSearch).toHaveBeenCalledTimes(2);
    expect(screen.getAllByRole("option")).toHaveLength(2);
  });

  it("shows a load once: in the closed field, or as the only option of the open list", async () => {
    const user = userEvent.setup();
    const base: ComponentProps<typeof SearchablePicker> = {
      label: "Conversation", options, onSelect: vi.fn(), loading: true, loadingText: "Loading conversations...",
    };
    const view = (props: Partial<ComponentProps<typeof SearchablePicker>> = {}) =>
      <FluentProvider theme={webLightTheme}><SearchablePicker {...base} {...props} /></FluentProvider>;
    const { rerender } = render(view());
    const combo = screen.getByRole("combobox", { name: "Conversation" });
    expect(combo).toHaveAttribute("placeholder", "Loading conversations...");
    expect(document.querySelectorAll(".fui-Spinner")).toHaveLength(0);

    rerender(view({ selected: options[0] }));
    expect(combo).toHaveValue("First conversation");
    expect(combo).toHaveAttribute("placeholder", "Search conversation...");
    expect(document.querySelectorAll(".fui-Combobox__expandIcon .fui-Spinner")).toHaveLength(1);
    expect(document.querySelectorAll(".fui-Spinner")).toHaveLength(1);

    await user.click(combo);
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option", { name: /Loading conversations\.\.\./ })).toHaveAttribute("aria-disabled", "true");
    expect(document.querySelectorAll(".fui-Spinner")).toHaveLength(1);
    expect(document.querySelectorAll(".fui-Combobox__expandIcon .fui-Spinner")).toHaveLength(0);

    await user.keyboard("{Escape}");
    rerender(view({ selected: options[0], loadingInField: false }));
    expect(document.querySelectorAll(".fui-Combobox__expandIcon .fui-Spinner")).toHaveLength(0);
  });
});
