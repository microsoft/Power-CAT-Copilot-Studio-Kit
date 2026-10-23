import "@testing-library/jest-dom/vitest";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { InlinePreviewList, inlinePreviewRows, type InlinePreviewListProps } from "./InlinePreviewList";

afterEach(cleanup);

const widgets = (count: number) => Array.from({ length: count }, (_, index) => `Widget ${index + 1}`);

function renderList(props: Partial<InlinePreviewListProps<string>> = {}) {
  const base: InlinePreviewListProps<string> = {
    label: "Widgets", items: widgets(8), maxRows: 3, noun: { one: "widget", other: "widgets" },
    getKey: item => item, renderRow: item => item, ...props,
  };
  const view = render(<FluentProvider theme={webLightTheme}><InlinePreviewList {...base} /></FluentProvider>);
  const rerenderList = (next: Partial<InlinePreviewListProps<string>>) =>
    view.rerender(<FluentProvider theme={webLightTheme}><InlinePreviewList {...base} {...next} /></FluentProvider>);
  return { rerenderList };
}

const rows = () => within(screen.getByRole("list", { name: "Widgets" })).getAllByRole("listitem").map(item => item.textContent);

it("fits from one to five fixed-height rows into the available height", () => {
  expect(inlinePreviewRows(316)).toBe(5);
  expect(inlinePreviewRows(202)).toBe(5);
  expect(inlinePreviewRows(201)).toBe(4);
  expect(inlinePreviewRows(140)).toBe(3);
  expect(inlinePreviewRows(100)).toBe(1);
  expect(inlinePreviewRows(0)).toBe(1);
  expect(inlinePreviewRows(Number.NaN)).toBe(1);
  expect(inlinePreviewRows(150, { caption: true })).toBe(2);
});

it("shows the first rows and a show-all action", async () => {
  const user = userEvent.setup();
  const onShowAll = vi.fn();
  renderList({ onShowAll, showAllLabel: "View all 8 widgets" });
  expect(rows()).toEqual(["Widget 1", "Widget 2", "Widget 3"]);
  expect(screen.getByText("Showing 3 of 8 widgets")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "View all 8 widgets" }));
  expect(onShowAll).toHaveBeenCalledTimes(1);
});

it("pages its rows when there is no show-all action", async () => {
  const user = userEvent.setup();
  renderList();
  expect(rows()).toEqual(["Widget 1", "Widget 2", "Widget 3"]);
  expect(screen.getByText("Showing 1–3 of 8 widgets")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(rows()).toEqual(["Widget 4", "Widget 5", "Widget 6"]);
  expect(screen.getByText("Showing 4–6 of 8 widgets")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(rows()).toEqual(["Widget 7", "Widget 8"]);
  expect(screen.getByText("Showing 7–8 of 8 widgets")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Previous" }));
  expect(screen.getByText("Showing 4–6 of 8 widgets")).toBeInTheDocument();
});

it("shows a single page without a pager and uses the singular noun for one item", () => {
  const { rerenderList } = renderList({ items: widgets(2) });
  expect(screen.getByText("Showing 2 of 2 widgets")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Previous" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
  rerenderList({ items: widgets(1) });
  expect(screen.getByText("Showing 1 of 1 widget")).toBeInTheDocument();
});

it("shows its empty text, or a default, instead of an empty list", () => {
  const { rerenderList } = renderList({ items: [], emptyText: "Nothing was recorded." });
  expect(screen.getByText("Nothing was recorded.")).toBeInTheDocument();
  expect(screen.queryByRole("list")).toBeNull();
  expect(screen.queryByText(/^Showing/)).toBeNull();
  rerenderList({ items: [], emptyText: undefined });
  expect(screen.getByText("No widgets.")).toBeInTheDocument();
});

it("makes each row a titled button when its rows can be opened", async () => {
  const user = userEvent.setup();
  const onOpenItem = vi.fn();
  renderList({ onOpenItem, itemTitle: item => `Open ${item}`, onShowAll: vi.fn(), showAllLabel: "View all 8 widgets" });
  expect(within(screen.getByRole("list", { name: "Widgets" })).getAllByRole("button")).toHaveLength(3);
  expect(screen.getByRole("button", { name: "Widget 2" })).toHaveAttribute("title", "Open Widget 2");
  await user.click(screen.getByRole("button", { name: "Widget 2" }));
  expect(onOpenItem).toHaveBeenCalledWith("Widget 2", 1);
});

it("keeps static rows when its rows cannot be opened", () => {
  renderList({ itemTitle: item => `${item} details` });
  expect(within(screen.getByRole("list", { name: "Widgets" })).queryAllByRole("button")).toHaveLength(0);
  expect(screen.getByTitle("Widget 1 details")).toHaveTextContent("Widget 1");
});

it("returns to the first page when its items change", async () => {
  const user = userEvent.setup();
  const { rerenderList } = renderList();
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText("Showing 4–6 of 8 widgets")).toBeInTheDocument();
  rerenderList({ items: widgets(7) });
  expect(screen.getByText("Showing 1–3 of 7 widgets")).toBeInTheDocument();
  expect(rows()).toEqual(["Widget 1", "Widget 2", "Widget 3"]);
});
