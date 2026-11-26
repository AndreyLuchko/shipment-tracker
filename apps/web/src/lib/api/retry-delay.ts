// Measured 2026-11-26 through Vercel after >= 16 min idle: 401 in 64.69 s (Vercel holds the request until the API is
// up); browser demo login ~38 s.
export const UNAVAILABLE_RETRY_DELAY_MS = 5_000;

/** The pause before the one retry. tests/setup.ts mocks this module so the pause resolves at once. */
export function waitBeforeRetry(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, UNAVAILABLE_RETRY_DELAY_MS);
  });
}
