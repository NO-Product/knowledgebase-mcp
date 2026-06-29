/**
 * Bounded link-harvest crawler for static documentation sites with no sitemap.
 *
 * The crawler is constrained by URL prefix, visited set, and a hard page cap so
 * source-specific sync scripts can safely discover Doxygen-style doc trees.
 *
 * Pattern name in `_meta.yaml`: `crawl-fetch` (classified free).
 */

export type CrawlFetchOptions = {
  headers?: Record<string, string>;
  retries?: number;
  backoffMs?: number;
};

export type CrawlOptions = {
  seeds: string[];
  prefix: string;
  accept?: (url: string) => boolean;
  onPage?: (url: string, html: string) => void | Promise<void>;
  maxPages?: number;
  concurrency?: number;
  fetchOptions?: CrawlFetchOptions;
  log?: (msg: string) => void;
};

export type CrawlResult = {
  discovered: string[];
  fetched: string[];
  failed: { url: string; error: string }[];
};

const DEFAULT_MAX_PAGES = 5000;
const DEFAULT_CONCURRENCY = 6;

function defaultAccept(url: string): boolean {
  return url.split("#")[0].toLowerCase().endsWith(".html");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, options: CrawlFetchOptions = {}): Promise<Response> {
  const retries = options.retries ?? 2;
  const backoffMs = options.backoffMs ?? 500;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, { headers: options.headers });
      if (response.ok || response.status < 500 || attempt === retries) return response;
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
    }
    await sleep(backoffMs * (attempt + 1));
  }

  throw lastError instanceof Error ? lastError : new Error(`Failed to fetch ${url}`);
}

function normalizeHref(raw: string, pageUrl: string): string | null {
  const cleaned = raw
    .trim()
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  if (!cleaned || cleaned.startsWith("#")) return null;
  if (/^(mailto:|javascript:|tel:|data:)/i.test(cleaned)) return null;
  try {
    const resolved = new URL(cleaned, pageUrl);
    resolved.hash = "";
    return resolved.href;
  } catch {
    return null;
  }
}

function harvestLinks(html: string, pageUrl: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    const url = normalizeHref(m[1], pageUrl);
    if (url) out.push(url);
  }
  return out;
}

async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, idx: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => worker()));
  return results;
}

export async function crawl(options: CrawlOptions): Promise<CrawlResult> {
  const {
    seeds,
    prefix,
    accept = defaultAccept,
    onPage,
    maxPages = DEFAULT_MAX_PAGES,
    concurrency = DEFAULT_CONCURRENCY,
    fetchOptions,
    log = () => {},
  } = options;

  const inScope = (url: string) => url.startsWith(prefix) && accept(url);

  const visited = new Set<string>();
  const discovered = new Set<string>();
  const fetched: string[] = [];
  const failed: { url: string; error: string }[] = [];

  let frontier: string[] = [];
  for (const seed of seeds) {
    if (inScope(seed) && !discovered.has(seed)) {
      discovered.add(seed);
      frontier.push(seed);
    }
  }

  let wave = 0;
  while (frontier.length > 0 && visited.size < maxPages) {
    const budget = maxPages - visited.size;
    const batch = frontier.slice(0, budget);
    for (const url of batch) visited.add(url);

    wave++;
    log(`wave ${wave}: fetching ${batch.length} page(s) (visited ${visited.size}, discovered ${discovered.size})`);

    const harvestedPerPage = await mapConcurrent(batch, concurrency, async (url) => {
      try {
        const res = await fetchWithRetry(url, {
          ...fetchOptions,
          headers: { Accept: "text/html", ...fetchOptions?.headers },
        });
        if (!res.ok) {
          failed.push({ url, error: `${res.status} ${res.statusText}` });
          return [] as string[];
        }
        const html = await res.text();
        fetched.push(url);
        if (onPage) await onPage(url, html);
        return harvestLinks(html, url);
      } catch (err) {
        failed.push({ url, error: err instanceof Error ? err.message : String(err) });
        return [] as string[];
      }
    });

    const nextFrontier: string[] = [];
    for (const links of harvestedPerPage) {
      for (const link of links) {
        if (!inScope(link) || discovered.has(link)) continue;
        discovered.add(link);
        nextFrontier.push(link);
      }
    }
    frontier = nextFrontier;
  }

  if (frontier.length > 0) {
    log(`stopped at page cap ${maxPages}; ${frontier.length} discovered URL(s) left uncrawled`);
  }

  return { discovered: [...discovered], fetched, failed };
}
