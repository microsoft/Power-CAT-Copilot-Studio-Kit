import "@testing-library/jest-dom/vitest";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import JsonViewer from "./JsonViewer";

afterEach(cleanup);
const viewer = (data: unknown) => <FluentProvider theme={webLightTheme}><JsonViewer data={data} enableSearch /></FluentProvider>;

describe("JSON inspection", () => {
  it("renders the exact escaped JSON without truncating long strings", () => {
    const data = { text: `${"x".repeat(1200)}\"\\\n<script>`, boolean: true, empty: null, number: 42 };
    const result = render(viewer(data));
    expect(result.container.querySelector(".json-content code")?.textContent).toBe(JSON.stringify(data, null, 2));
    expect(result.container.querySelector("script")).toBeNull();
  });

  it("searches JSON text rather than syntax markup, with literal safe matches", async () => {
    const user = userEvent.setup();
    const data = { text: "span <span> [.*]" };
    const result = render(viewer(data));
    const search = screen.getByRole("textbox", { name: "Search JSON content" });
    await user.type(search, "span");
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
    expect(result.container.querySelectorAll(".json-search-match")).toHaveLength(2);
    expect(result.container.querySelector(".json-content code")?.textContent).toBe(JSON.stringify(data, null, 2));
    await user.clear(search);
    await user.type(search, "class");
    expect(screen.getByText("No matches")).toBeInTheDocument();
    await user.clear(search);
    await user.paste("[.*]");
    expect(screen.getByText("1 of 1")).toBeInTheDocument();
    expect(result.container.querySelector(".json-content code")?.textContent).toBe(JSON.stringify(data, null, 2));
  });

  it("supports next, previous, and Escape search navigation", async () => {
    const user = userEvent.setup();
    render(viewer({ text: "match MATCH match" }));
    const search = screen.getByRole("textbox", { name: "Search JSON content" });
    await user.type(search, "match");
    expect(screen.getByText("1 of 3")).toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(screen.getByText("2 of 3")).toBeInTheDocument();
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    expect(screen.getByText("1 of 3")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(search).toHaveValue("");
  });

  it("searches beyond the visible range of large documents and caps excessive matches", async () => {
    const user = userEvent.setup();
    const result = render(viewer({ text: `${"x".repeat(250000)}needle` }));
    expect(result.container.querySelector(".json-virtual-viewport")).not.toBeNull();
    const search = screen.getByRole("textbox", { name: "Search JSON content" });
    await user.type(search, "needle");
    expect(screen.getByText("1 of 1")).toBeInTheDocument();
    expect(result.container.querySelector(".json-search-current")?.textContent).toBe("needle");
    await user.clear(search);
    await user.type(search, "x");
    expect(screen.getByText("1 of 10000+")).toBeInTheDocument();
  });
});
