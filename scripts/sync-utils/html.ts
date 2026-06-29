/**
 * Shared helpers for sync scripts that scrape static HTML instead of fetching
 * raw Markdown. These helpers are intentionally small and site-agnostic.
 */

/**
 * Rewrite relative `src` / `href` attribute values to absolute URLs resolved
 * against `baseUrl`. Already absolute URLs, fragments, and non-navigational
 * schemes are left untouched.
 */
export function absolutizeRefs(html: string, baseUrl: string): string {
  return html.replace(/\b(src|href)\s*=\s*"([^"]*)"/gi, (full, attr, val) => {
    if (!val || /^(https?:|data:|mailto:|tel:|javascript:|#)/i.test(val)) return full;
    try {
      return `${attr}="${new URL(val, baseUrl).href}"`;
    } catch {
      return full;
    }
  });
}

/**
 * Given the byte index of an element's opening `<tag`, return the inner HTML
 * between that opening tag and its balanced closing tag, accounting for nested
 * same-name tags.
 */
export function sliceBalancedElement(html: string, tagName: string, openIdx: number): string {
  const openTagEnd = html.indexOf(">", openIdx);
  if (openTagEnd === -1) return "";
  const contentStart = openTagEnd + 1;
  const rest = html.slice(contentStart);

  const tagRe = new RegExp(`<(/?)${tagName}\\b[^>]*>`, "gi");
  let depth = 1;
  for (const m of rest.matchAll(tagRe)) {
    if (m[1] === "/") {
      depth--;
      if (depth === 0) return rest.slice(0, m.index);
    } else if (!m[0].endsWith("/>")) {
      depth++;
    }
  }
  return rest;
}

export function extractById(html: string, tagName: string, id: string): string | null {
  const re = new RegExp(`<${tagName}\\b[^>]*\\bid="${id}"[^>]*>`, "i");
  const m = html.match(re);
  if (!m || m.index === undefined) return null;
  return sliceBalancedElement(html, tagName, m.index);
}

export function extractByClass(html: string, tagName: string, cls: string): string | null {
  const re = new RegExp(`<${tagName}\\b[^>]*\\bclass="[^"]*\\b${cls}\\b[^"]*"[^>]*>`, "i");
  const m = html.match(re);
  if (!m || m.index === undefined) return null;
  return sliceBalancedElement(html, tagName, m.index);
}

export function removeByClass(html: string, tagName: string, cls: string): string {
  const re = new RegExp(`<${tagName}\\b[^>]*\\bclass="[^"]*\\b${cls}\\b[^"]*"[^>]*>`, "i");
  let out = html;
  for (let guard = 0; guard < 1000; guard++) {
    const m = out.match(re);
    if (!m || m.index === undefined) break;
    const inner = sliceBalancedElement(out, tagName, m.index);
    const openTagEnd = out.indexOf(">", m.index);
    const closeLen = `</${tagName}>`.length;
    const fullEnd = openTagEnd + 1 + inner.length + closeLen;
    out = out.slice(0, m.index) + out.slice(fullEnd);
  }
  return out;
}
