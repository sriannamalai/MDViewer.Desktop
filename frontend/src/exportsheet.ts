// Export sheet — design/README.md §10.
//
// Real, working export for two of the three formats: "Self-contained
// HTML" and "HTML fragment" call ipc.exportDocument() and write the
// result to a user-picked path via the native save dialog + a Rust write
// command. "PDF" builds the same self-contained HTML into a hidden
// print-only iframe and invokes the browser's own print dialog
// (window.print()), which every desktop OS's print UI can "Save as PDF"
// from — a real, working v1 path without pulling in a headless-Chromium
// or PDF-generation dependency. The design's "Options" checklist (heading
// anchors / print theme / page numbers / table of contents) isn't wired
// to real toggles yet since none of the current render pipeline's options
// map onto them 1:1 — see the code comment above the checklist below.

import { save } from "@tauri-apps/plugin-dialog";
import * as ipc from "./ipc";
import type { ThemeName } from "./ipc";

export type ExportFormat = "pdf" | "html-full" | "html-fragment";

export interface ExportSheetCallbacks {
  onClose(): void;
  /** Renders the export document exactly like the on-screen preview (fragment picks body-only markup). */
  renderExport(fragment: boolean): Promise<string>;
  /** Surfaces a failure inline — main.ts already has an open-error banner convention for this kind of thing. */
  onError(message: string): void;
}

const FORMATS: { id: ExportFormat; title: string; sub: string }[] = [
  { id: "pdf", title: "PDF", sub: "Paginated, via the system print dialog" },
  { id: "html-full", title: "Self-contained HTML", sub: "Zero external requests" },
  { id: "html-fragment", title: "HTML fragment", sub: "Body-only, host styles" },
];

let selectedFormat: ExportFormat = "pdf";

function suggestedFileName(docName: string, format: ExportFormat): string {
  const base = docName.replace(/\.[^.]+$/, "");
  if (format === "pdf") return `${base}.pdf`;
  return `${base}.html`;
}

/** Builds a hidden same-origin iframe, loads `html` into it, and calls its print(). Removed shortly after — window.print() is synchronous-enough from the caller's perspective that a `load` handler is the right lifecycle hook to trigger it and then tear the iframe down. */
function printHtml(html: string): void {
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.setAttribute("aria-hidden", "true");
  document.body.appendChild(frame);
  frame.addEventListener("load", () => {
    const win = frame.contentWindow;
    if (win) {
      win.focus();
      win.print();
    }
    // Give the print dialog a moment to read the frame's content before tearing it down.
    setTimeout(() => frame.remove(), 2000);
  });
  frame.srcdoc = html;
}

async function runExport(docName: string, theme: ThemeName, cb: ExportSheetCallbacks): Promise<void> {
  try {
    if (selectedFormat === "pdf") {
      const html = await cb.renderExport(false);
      printHtml(html);
      cb.onClose();
      return;
    }
    const fragment = selectedFormat === "html-fragment";
    const html = await cb.renderExport(fragment);
    const destination = await save({
      defaultPath: suggestedFileName(docName, selectedFormat),
      filters: [{ name: "HTML", extensions: ["html", "htm"] }],
    });
    if (!destination) return; // user dismissed the dialog
    await ipc.writeExportFile(destination, html);
    cb.onClose();
  } catch (err) {
    cb.onError(err instanceof Error ? err.message : String(err));
  }
}

function paint(host: HTMLElement, docName: string, theme: ThemeName, cb: ExportSheetCallbacks): void {
  host.innerHTML = "";

  const panel = document.createElement("div");
  panel.className = "export-panel";
  panel.addEventListener("click", (ev) => ev.stopPropagation());

  const header = document.createElement("div");
  header.className = "export-header";
  const title = document.createElement("span");
  title.className = "export-title";
  title.textContent = `Export ${docName}`;
  const close = document.createElement("span");
  close.className = "export-close";
  close.textContent = "✕";
  close.addEventListener("click", () => cb.onClose());
  header.append(title, close);

  const body = document.createElement("div");
  body.className = "export-body";

  const rail = document.createElement("div");
  rail.className = "export-rail";

  const formatLabel = document.createElement("div");
  formatLabel.className = "export-section-label";
  formatLabel.textContent = "Format";
  const formatList = document.createElement("div");
  formatList.className = "export-format-list";
  for (const f of FORMATS) {
    const card = document.createElement("div");
    card.className = "export-format-card" + (f.id === selectedFormat ? " selected" : "");
    const t = document.createElement("div");
    t.className = "export-format-title";
    t.textContent = f.title;
    const s = document.createElement("div");
    s.className = "export-format-sub";
    s.textContent = f.sub;
    card.append(t, s);
    card.addEventListener("click", () => {
      selectedFormat = f.id;
      paint(host, docName, theme, cb);
    });
    formatList.appendChild(card);
  }

  const actions = document.createElement("div");
  actions.className = "export-actions";
  const cancelBtn = document.createElement("span");
  cancelBtn.className = "export-btn export-btn-outline";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", () => cb.onClose());
  const exportBtn = document.createElement("span");
  exportBtn.className = "export-btn export-btn-primary";
  exportBtn.textContent = "Export";
  exportBtn.addEventListener("click", () => {
    void runExport(docName, theme, cb);
  });
  actions.append(cancelBtn, exportBtn);

  rail.append(formatLabel, formatList, actions);

  const preview = document.createElement("div");
  preview.className = "export-preview";
  const previewHint = document.createElement("div");
  previewHint.className = "export-preview-hint";
  previewHint.textContent =
    selectedFormat === "pdf"
      ? "PDF export opens your system print dialog — choose “Save as PDF” there."
      : "Exports the document exactly as currently rendered, including the active theme.";
  preview.appendChild(previewHint);

  body.append(rail, preview);
  panel.append(header, body);
  host.appendChild(panel);
}

/** Mounts the export sheet into `host`, defaulting back to the PDF format on every fresh open. */
export function mount(host: HTMLElement, docName: string, theme: ThemeName, cb: ExportSheetCallbacks): void {
  selectedFormat = "pdf";
  paint(host, docName, theme, cb);
}
