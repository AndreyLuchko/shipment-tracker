// apps/api/prisma/demo-reset-args.ts
// Argument parsing and the safety gate of the demo-reset CLI: no reset without `--confirm <database host>`.
import { parseArgs } from 'node:util';
import { describeTarget } from './seed-demo.js';

export type ResetArgs = { kind: 'run'; target: string } | { kind: 'error'; message: string };

export function parseResetArgs(argv: string[], databaseUrl: string | undefined): ResetArgs {
  if (databaseUrl === undefined || databaseUrl === '') {
    return { kind: 'error', message: 'DATABASE_URL is not set' };
  }

  let host: string;
  let target: string;
  try {
    host = new URL(databaseUrl).hostname;
    target = describeTarget(databaseUrl);
  } catch {
    return { kind: 'error', message: 'DATABASE_URL is not a valid connection string' };
  }

  let confirm: string | undefined;
  try {
    confirm = parseArgs({ args: argv, options: { confirm: { type: 'string' } }, strict: true }).values.confirm;
  } catch (error) {
    return { kind: 'error', message: error instanceof Error ? error.message : String(error) };
  }

  if (confirm === undefined) {
    return {
      kind: 'error',
      message: `Refusing to reset ${target} without confirmation. This deletes every user, shipment and event there. Run: npm run db:demo-reset -w apps/api -- --confirm ${host}`,
    };
  }
  if (confirm !== host) {
    return {
      kind: 'error',
      message: `Refusing to reset: --confirm "${confirm}" does not match the database host "${host}"`,
    };
  }
  return { kind: 'run', target };
}
