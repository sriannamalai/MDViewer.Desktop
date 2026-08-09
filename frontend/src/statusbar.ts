// Status bar — design/README.md §5 ("Main column" → Status bar).
//
// Stateless renderer, repainted on every scrollspy event (main.ts) as well
// as on tab switches — cheap enough (a handful of spans) that there's no
// need for outline.ts's setActiveLine-style partial-update trick here.

export interface StatusbarInfo {
  libraryVersion: string;
  /** The active outline item's text (outline.ts's activeItem(), driven by scrollspy), or "" with no doc open. */
  activeSection: string;
}

function textSpan(text: string): HTMLElement {
  const span = document.createElement("span");
  span.textContent = text;
  return span;
}

export function render(container: HTMLElement, info: StatusbarInfo): void {
  container.innerHTML = "";

  const dot = document.createElement("span");
  dot.className = "statusbar-dot";
  dot.textContent = "● sanitized";

  const spacer = document.createElement("div");
  spacer.className = "statusbar-spacer";

  const left = [dot, textSpan("CommonMark + GFM"), textSpan("KaTeX · mermaid embedded")];
  if (info.libraryVersion) left.push(textSpan(`libmdviewer ${info.libraryVersion}`));

  const right = [textSpan(info.activeSection), textSpan("UTF-8"), textSpan("LF")];

  container.append(...left, spacer, ...right);
}
