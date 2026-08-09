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
  report();
})();
<\/script>`;

let host: HTMLElement | null = null;
let iframe: HTMLIFrameElement | null = null;

function handleMessage(e: MessageEvent): void {
  if (!iframe || e.source !== iframe.contentWindow) return;
  const data = e.data as { mdviewer?: string; line?: number; scrollY?: number; docH?: number } | null;
  if (!data || data.mdviewer !== "scrollspy") return;
  window.dispatchEvent(
    new CustomEvent("mdviewer:scrollspy", {
      detail: { line: data.line ?? 0, scrollY: data.scrollY ?? 0, docH: data.docH ?? 0 },
    }),
  );
}

// Bound once at module load — `mount()` may be called again if the content
// host is ever rebuilt, and a second `addEventListener("message", ...)`
// would just fire the (idempotent) handler twice, but there's no reason to
// let listeners accumulate.
window.addEventListener("message", handleMessage);

/** Creates the iframe inside `container`, filling it entirely. */
export function mount(container: HTMLElement): void {
  host = container;
  host.innerHTML = "";
  iframe = document.createElement("iframe");
  iframe.className = "doc-viewer-frame";
  iframe.setAttribute("sandbox", "allow-scripts");
  iframe.setAttribute("title", "Document preview");
  host.appendChild(iframe);
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
  iframe!.srcdoc = withScrollspy;
}

/** Asks the loaded document to smooth-scroll a `data-md-line` element into view. */
export function scrollToLine(line: number): void {
  iframe?.contentWindow?.postMessage({ mdviewer: "scrollTo", line }, "*");
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
