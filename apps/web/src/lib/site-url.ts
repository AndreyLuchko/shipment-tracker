const LOCAL_ORIGIN = 'http://localhost:3000';

/** The site's absolute origin for metadata: https://<VERCEL_PROJECT_PRODUCTION_URL> on Vercel, else http://localhost:3000. */
export function siteUrl(env: Record<string, string | undefined>): string {
  const host = env['VERCEL_PROJECT_PRODUCTION_URL'];
  return host === undefined || host === '' ? LOCAL_ORIGIN : `https://${host}`;
}
