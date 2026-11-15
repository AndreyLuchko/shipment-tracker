export const DEFAULT_API_ORIGIN = 'http://localhost:3001';

const REQUIRED_MESSAGE = 'API_ORIGIN is required: set it to the origin of the API, e.g. https://api.example.com';
const INVALID_MESSAGE = 'API_ORIGIN must be an http(s) origin without a path, e.g. https://api.example.com';

/**
 * The origin the frontend proxies `/api/v1/*` to. Reads `API_ORIGIN`; falls back to `DEFAULT_API_ORIGIN`
 * when it is unset or empty — except on Vercel (`VERCEL=1`), where a missing value is an error.
 */
export function resolveApiOrigin(env: Record<string, string | undefined>): string {
  const value = env['API_ORIGIN'];
  if (value === undefined || value === '') {
    if (env['VERCEL'] === '1') throw new Error(REQUIRED_MESSAGE);
    return DEFAULT_API_ORIGIN;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(INVALID_MESSAGE);
  }

  // A bare origin only (C16): a path, a query or a hash is rejected rather than trimmed. `new URL` turns an
  // empty path into '/', so one trailing slash is allowed; a bare '?' or '#' leaves `search`/`hash` empty,
  // which is why the raw value is checked for them too.
  const isHttp = url.protocol === 'http:' || url.protocol === 'https:';
  const hasExtra = url.pathname !== '/' || url.search !== '' || url.hash !== '' || /[?#]/.test(value);
  if (!isHttp || hasExtra) throw new Error(INVALID_MESSAGE);

  return url.origin;
}
