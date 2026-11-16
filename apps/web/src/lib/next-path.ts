export const DEFAULT_AFTER_LOGIN = '/shipments';

/** A dummy origin: `raw` is resolved against it, and anything that leaves it is rejected. */
const BASE = 'http://n';

/** Where to go after signing in: `raw` when it names a page under `/shipments` on this origin, else `/shipments`. */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_AFTER_LOGIN;
  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return DEFAULT_AFTER_LOGIN;
  }
  if (url.origin !== BASE) return DEFAULT_AFTER_LOGIN;
  if (url.pathname !== DEFAULT_AFTER_LOGIN && !url.pathname.startsWith(`${DEFAULT_AFTER_LOGIN}/`)) {
    return DEFAULT_AFTER_LOGIN;
  }
  return url.pathname + url.search;
}

/** `/login`, carrying `target` as `?next=` — unless `target` is (or falls back to) the default page. */
export function loginHref(target: string): string {
  const next = safeNextPath(target);
  return next === DEFAULT_AFTER_LOGIN ? '/login' : `/login?next=${encodeURIComponent(next)}`;
}
