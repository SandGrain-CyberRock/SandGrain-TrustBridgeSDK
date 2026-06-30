/**
 * API_URL is resolved at runtime, not build time.
 *
 * Order of resolution (first wins):
 *   1. GET /api/discover (called from main.tsx before the React tree mounts).
 *   2. import.meta.env.VITE_APP_ENDPOINT (build-time fallback, if set).
 *   3. Derived from window.location: same protocol + hostname as the FE, port 3000.
 *
 * This means the FE container does NOT need to be rebuilt when the laptop's
 * LAN IP changes — discovery runs every page load and picks up the current IP.
 */

const deriveFromWindow = (): string => {
  if (typeof window === 'undefined') return 'http://localhost:3000/';
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:3000/`;
};

const buildFallback = (): string => {
  const fromEnv = import.meta.env.VITE_APP_ENDPOINT as string | undefined;
  if (fromEnv && fromEnv.length > 0) {
    return fromEnv.endsWith('/') ? fromEnv.slice(0, -1) : fromEnv;
  }
  return deriveFromWindow();
};

// Live binding — updated by initializeApiUrl() before the React app mounts.
// eslint-disable-next-line prefer-const
export let API_URL: string = buildFallback();

const buildDiscoverUrl = (): string => {
  // Discover lives at /api/discover, but be_url returned by it is the BASE URL.
  if (typeof window === 'undefined') return 'http://localhost:3000/api/discover';
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:3000/api/discover`;
};

const normalize = (url: string): string =>
  url.endsWith('/') ? url.slice(0, -1) : url;

/**
 * Fetch /api/discover from the BE and update API_URL with the discovered URL.
 * Safe to call once, at app boot. Falls back silently to buildFallback() on any error.
 *
 * Resolves with the URL that will be used (discovered or fallback).
 */
export async function initializeApiUrl(): Promise<string> {
  const discoverUrl = buildDiscoverUrl();
  const fallback = buildFallback();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(discoverUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(
        `[discover] HTTP ${response.status} from ${discoverUrl} — using fallback ${fallback}`,
      );
      API_URL = fallback;
      return fallback;
    }

    const json = (await response.json()) as
      | { be_url?: string }
      | { data?: { be_url?: string } };

    // BE wraps responses with a global ResponseInterceptor: { data: {...}, message }
    // — but be defensive in case the endpoint is ever served unwrapped.
    const beUrl =
      ('data' in json && json.data?.be_url) ||
      ('be_url' in json && (json as { be_url: string }).be_url) ||
      undefined;

    if (!beUrl) {
      console.warn(
        `[discover] response missing be_url, using fallback ${fallback}`,
      );
      API_URL = fallback;
      return fallback;
    }

    API_URL = normalize(beUrl);
    console.info(`[discover] BE_URL = ${API_URL}`);
    return API_URL;
  } catch (err) {
    console.warn(
      `[discover] failed (${discoverUrl}) — using fallback ${fallback}`,
      err,
    );
    API_URL = fallback;
    return fallback;
  }
}
