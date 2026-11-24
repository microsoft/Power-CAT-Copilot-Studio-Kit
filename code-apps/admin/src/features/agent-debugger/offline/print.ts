interface ThemeControls {
  get: () => boolean;
  set: (dark: boolean) => void;
}

/** Materializes safe captured evidence once, preserving its DOM and focused descendants. */
export function revealCompleteEvidence(doc: Document): HTMLElement {
  const evidence = doc.getElementById("all-evidence")!;
  if (!evidence.childNodes.length) {
    const template = doc.getElementById("complete-evidence") as HTMLTemplateElement;
    evidence.append(template.content.cloneNode(true));
  }
  evidence.hidden = false;
  return evidence;
}

/** Prints every captured exchange without remounting the interactive React tree or existing evidence. */
export function installOfflinePrinting(doc: Document, host: Window, theme: ThemeControls): () => void {
  let saved: { focus: Element | null; dark: boolean; hidden: boolean; mounted: boolean; open: HTMLDetailsElement[] } | undefined;
  const before = () => {
    if (saved) return;
    const all = doc.getElementById("all-evidence")!;
    saved = { focus: doc.activeElement, dark: theme.get(), hidden: all.hidden, mounted: !!all.childNodes.length,
      open: Array.from(doc.querySelectorAll<HTMLDetailsElement>("details[open]")) };
    theme.set(false);
    revealCompleteEvidence(doc).querySelectorAll("details").forEach(details => { details.open = true; });
  };
  const after = () => {
    if (!saved) return;
    const state = saved;
    saved = undefined;
    const all = doc.getElementById("all-evidence")!;
    all.querySelectorAll("details").forEach(details => { details.open = state.open.includes(details); });
    all.hidden = state.hidden;
    if (!state.mounted) all.replaceChildren();
    theme.set(state.dark);
    if (state.focus?.isConnected && "focus" in state.focus) (state.focus as HTMLElement).focus({ preventScroll: true });
  };
  host.addEventListener("beforeprint", before);
  host.addEventListener("afterprint", after);
  return () => {
    host.removeEventListener("beforeprint", before);
    host.removeEventListener("afterprint", after);
  };
}
