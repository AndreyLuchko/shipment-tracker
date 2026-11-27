// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, '../../src/app/globals.css'), 'utf8');

const TOKENS = ['page', 'surface', 'surface-muted', 'ink', 'ink-muted', 'ink-subtle', 'line', 'line-strong', 'accent'];

describe('globals.css colour tokens', () => {
  it('declares both colour schemes', () => {
    expect(css).toContain('color-scheme: light dark');
  });

  it.each(TOKENS)('maps --color-%s in @theme inline', (token) => {
    expect(css).toContain(`--color-${token}: var(--${token});`);
  });

  it.each(TOKENS)('defines --%s exactly twice (light and dark)', (token) => {
    const matches = css.match(new RegExp(`^\\s+--${token}:`, 'gm')) ?? [];
    expect(matches).toHaveLength(2);
  });
});
