export interface DemoAccount {
  /** The button's text. */
  label: string;
  email: string;
  password: string;
}

/** The accounts `apps/api/prisma/seed.ts` creates. Public by design (spec §11): they are listed in the README. */
export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  { label: 'Demo dispatcher', email: 'dispatcher@demo.dev', password: 'dispatcher123' },
  { label: 'Demo client', email: 'client@demo.dev', password: 'client123' },
];
