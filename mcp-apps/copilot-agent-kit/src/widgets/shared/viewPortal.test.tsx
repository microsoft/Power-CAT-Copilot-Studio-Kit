import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { App } from "@modelcontextprotocol/ext-apps";
import { Dialog, DialogBody, DialogContent, DialogSurface, DialogTitle, FluentProvider, webLightTheme } from "@fluentui/react-components";
import { McpAppProvider } from "./McpAppProvider";
import type { AppView, McpBootstrap } from "./bootstrap-contract";

afterEach(() => { cleanup(); document.body.replaceChildren(); delete window.__agentReviewMcpBootstrap; });

function mount(view: AppView, open: boolean) {
  const container = document.createElement("div");
  container.dataset.mcpViewRoot = view;
  document.body.append(container);
  const snapshot = { app: new App({ name: "Offline portal fixture", version: "1.0.0" }), data: null, host: undefined };
  const store: McpBootstrap = { view, root: container, getSnapshot: () => snapshot, subscribe: () => () => undefined, replaceData: () => undefined };
  window.__agentReviewMcpBootstrap = store;
  const content = (isOpen: boolean) => <McpAppProvider view={view}><FluentProvider theme={webLightTheme}>
    <Dialog open={isOpen}><DialogSurface><DialogBody><DialogTitle>Independent view dialog</DialogTitle><DialogContent><button type="button" autoFocus>Close fixture</button></DialogContent></DialogBody></DialogSurface></Dialog>
  </FluentProvider></McpAppProvider>;
  const rendered = render(content(open), { container });
  return { container, open: () => rendered.rerender(content(true)) };
}

it.each(["review", "debugger", "evaluation"] as const)("keeps an initially open %s dialog within its own view root", async view => {
  const { container } = mount(view, true);
  const dialog = await screen.findByRole("dialog", { name: "Independent view dialog" });
  expect(dialog).toHaveAttribute("aria-modal", "true");
  expect(container.contains(dialog)).toBe(true);
});

it.each(["review", "debugger", "evaluation"] as const)("keeps a later opened %s dialog within its own view root", async view => {
  const { container, open } = mount(view, false);
  open();
  const dialog = await screen.findByRole("dialog", { name: "Independent view dialog" });
  expect(dialog).toHaveAttribute("aria-modal", "true");
  expect(container.contains(dialog)).toBe(true);
});
