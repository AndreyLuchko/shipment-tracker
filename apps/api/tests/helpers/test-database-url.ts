const TEST_SUFFIX = '_test';

/**
 * Derives the test database URL from the development one by appending `_test` to the database name.
 * Idempotent, and keeps credentials, host and query string intact.
 */
export function toTestDatabaseUrl(databaseUrl: string | undefined): string {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set');
  }

  const url = new URL(databaseUrl);
  const name = url.pathname.replace(/^\//, '');
  if (!name.endsWith(TEST_SUFFIX)) {
    url.pathname = `/${name}${TEST_SUFFIX}`;
  }
  return url.toString();
}
