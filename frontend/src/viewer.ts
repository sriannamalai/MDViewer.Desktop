// Sandboxed document viewer — design/README.md §7 ("the product itself").
//
// The rendered page from `ipc.renderDocument` is a full, self-contained
// HTML document (own <html>/<head>/<body>, embedded KaTeX/mermaid, a
// `data-md-line` source map). It's untrusted-ish content from disk, so it
// loads into an `<iframe sandbox="allow-scripts">` via `srcdoc` rather than
// being inlined into the chrome document: scripts run (mermaid/KaTeX need
// that), but the iframe gets an opaque origin with no access to the parent
// DOM, storage, or top-level navigation.
//
// The brief's scrollspy script (verbatim) is appended before `</body>` on
// every load — it postMessages `{mdviewer:'scrollspy', line, scrollY,
// docH}` on scroll and answers `{mdviewer:'scrollTo', line}` requests from
// the parent. This module re-emits the former as a `mdviewer:scrollspy`
// CustomEvent on `window` for later tasks (Task 6's outline) to consume,
// and exposes `scrollToLine` for them to drive the latter.
//
// Task 6 adds the source view (design/README.md §7 "Source view"): a
// second, plain `<pre>` element that sits alongside the iframe inside the
// same host and is toggled visible/hidden via `setMode()`. It's raw text,
// not sandboxed content, so it needs none of the iframe's isolation.
//
// v2 network gating (AGENTS.md known limitation): the `sandbox` attribute
// alone only restricts navigation/scripting/popups — it does NOT stop the
// document's own markup from making outbound network requests (a remote
// `<img src>`, `<link>`, or fetch would still hit the network from inside
// the sandboxed origin). CSP is the actual gate for that: NETWORK_CSP
// below is injected into every loaded document's `<head>` and blocks
// everything except the embedded (`data:`) assets the renderer already
// produces offline — no remote images/fonts/media, no `connect-src`
// (fetch/XHR/WebSocket), no nested frames/objects, no form submissions.
// External links are a separate, deliberate escape hatch (not "gated
// shut"): the injected script below intercepts http(s) anchor clicks and
// asks the parent to open them via the OS's default browser (see
// `handleMessage`'s `openExternal` case) instead of silently failing the
// sandboxed in-frame navigation the way an unmodified sandbox would.

import { openUrl } from "@tauri-apps/plugin-opener";

const NETWORK_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; " +
  "img-src data: blob:; font-src data:; media-src data: blob:; " +
  "connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

const SCROLLSPY = `<script>
(function(){
  const marked = Array.from(document.querySelectorAll('[data-md-line]'));
  function report(){
    let active = marked[0];
    for (const el of marked){
      if (el.getBoundingClientRect().top <= 80) active = el; else break;
    }
    parent.postMessage({ mdviewer: 'scrollspy',
      line: active ? +active.getAttribute('data-md-line') : 0,
      scrollY: scrollY, docH: document.body.scrollHeight }, '*');
  }
  addEventListener('scroll', () => requestAnimationFrame(report), {passive:true});
  addEventListener('message', (e) => {
    if (e.data && e.data.mdviewer === 'scrollTo')
      document.querySelector('[data-md-line="'+e.data.line+'"]')?.scrollIntoView({behavior:'smooth'});
  });
  addEventListener('click', (e) => {
    const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    const href = a.getAttribute('href') || '';
    if (/^https?:\\/\\//i.test(href)) {
      e.preventDefault();
      parent.postMessage({ mdviewer: 'openExternal', url: href }, '*');
    }
    // Fragment-only/relative links fall through to the sandbox's own
    // (blocked, allow-top-navigation-less) default handling — no change
    // in behavior for those versus before this task.
  });
  report();
})();
<\/script>`;

let host: HTMLElement | null = null;
let iframe: HTMLIFrameElement | null = null;
let sourceEl: HTMLPreElement | null = null;

/** http(s)-only guard applied before ever handing a URL to the OS opener — belt-and-suspenders alongside the injected script's own regex, since this handler must not trust the sandboxed content it's reading from. */
function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function handleMessage(e: MessageEvent): void {
  if (!iframe || e.source !== iframe.contentWindow) return;
  const data = e.data as { mdviewer?: string; line?: unknown; scrollY?: unknown; docH?: unknown; url?: unknown } | null;
  if (!data) return;

  if (data.mdviewer === "openExternal") {
    if (typeof data.url === "string" && isHttpUrl(data.url)) {
      void openUrl(data.url).catch((err) => console.error("viewer: openUrl failed:", err));
    }
    return;
  }

  if (data.mdviewer !== "scrollspy") return;
  // Trust-boundary coercion: this payload comes from script running inside
  // the sandboxed iframe. `?? 0` only guards null/undefined — it would let
  // a hostile or buggy in-sandbox script send strings/objects/NaN straight
  // through to the CustomEvent that Task 6's outline consumes. Force to
  // Number and fall back to 0 for anything that doesn't coerce cleanly.
  window.dispatchEvent(
    new CustomEvent("mdviewer:scrollspy", {
      detail: {
        line: Number(data.line) || 0,
        scrollY: Number(data.scrollY) || 0,
        docH: Number(data.docH) || 0,
      },
    }),
  );
}

// Bound once at module load — `mount()` may be called again if the content
// host is ever rebuilt, and a second `addEventListener("message", ...)`
// would just fire the (idempotent) handler twice, but there's no reason to
// let listeners accumulate.
window.addEventListener("message", handleMessage);

/** Creates the iframe (and the hidden source-view `<pre>`) inside `container`, filling it entirely. */
export function mount(container: HTMLElement): void {
  host = container;
  host.innerHTML = "";
  iframe = document.createElement("iframe");
  iframe.className = "doc-viewer-frame";
  iframe.setAttribute("sandbox", "allow-scripts");
  iframe.setAttribute("title", "Document preview");

  sourceEl = document.createElement("pre");
  sourceEl.className = "doc-source-frame hidden";

  host.append(iframe, sourceEl);
}

/** Loads `html` (a full rendered page from `render_document`) into the iframe. */
export function load(html: string): void {
  if (!host) return;
  if (!iframe) mount(host);
  // Pages with embedded mermaid/KaTeX bundles can contain the literal
  // substring "</body>" more than once — mermaid's own bundled JS embeds
  // an HTML-serialization string like '<html>...<body>'+x+"</body></html>"
  // for its internal sanitizer, which lands *before* the document's real
  // closing tag. A first-match `.replace()` would splice our scrollspy
  // `<script>` (and its closing `</script>`) into the middle of that
  // inline script, prematurely terminating it and dumping the rest of its
  // source as visible page text. Target the *last* occurrence instead —
  // that's always the actual closing `</body>` of the outer document.
  const idx = html.lastIndexOf("</body>");
  const withScrollspy = idx === -1 ? html + SCROLLSPY : html.slice(0, idx) + SCROLLSPY + html.slice(idx);

  // Network gating: inject the CSP meta tag as the very first thing in
  // `<head>` so it's in force before any other tag (the base stylesheet's
  // `<style>`, the mermaid/KaTeX `<script>`s) parses. Falls back to
  // prepending an ad-hoc `<head>` for the (currently theoretical, since
  // `render_document` always emits one) case of headless input.
  const headIdx = withScrollspy.indexOf("<head>");
  const cspTag = `<meta http-equiv="Content-Security-Policy" content="${NETWORK_CSP}">`;
  const withCsp =
    headIdx === -1
      ? `<head>${cspTag}</head>` + withScrollspy
      : withScrollspy.slice(0, headIdx + "<head>".length) + cspTag + withScrollspy.slice(headIdx + "<head>".length);

  iframe!.srcdoc = withCsp;
}

/** Asks the loaded document to smooth-scroll a `data-md-line` element into view. */
export function scrollToLine(line: number): void {
  iframe?.contentWindow?.postMessage({ mdviewer: "scrollTo", line }, "*");
}

/** Fills the source view's `<pre>` with `raw` markdown text (design §7 "Source view"). */
export function setSource(raw: string): void {
  if (!host) return;
  if (!sourceEl) mount(host);
  sourceEl!.textContent = raw;
}

/** Switches which of the rendered iframe / raw-source `<pre>` is visible. Toolbar-driven, per tab. */
export function setMode(mode: "rendered" | "source"): void {
  iframe?.classList.toggle("hidden", mode === "source");
  sourceEl?.classList.toggle("hidden", mode !== "source");
}

/**
 * Render failure state — no toasts (design spec), so this replaces the
 * iframe with a message styled per the welcome surface (`.welcome-title` /
 * `.welcome-body`), matching the calm empty-state visual language rather
 * than an alarming error dialog.
 */
export function showError(message: string): void {
  if (!host) return;
  host.innerHTML = "";
  iframe = null;
  sourceEl = null;

  const wrap = document.createElement("div");
  wrap.className = "viewer-error";

  const title = document.createElement("div");
  title.className = "welcome-title";
  title.textContent = "Couldn't render this document";

  const body = document.createElement("div");
  body.className = "welcome-body";
  body.textContent = message;

  wrap.append(title, body);
  host.appendChild(wrap);
}
