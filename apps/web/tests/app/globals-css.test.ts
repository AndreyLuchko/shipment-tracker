// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, '../../src/app/globals.css'), 'utf8');

const TOKENS = ['page', 'surface', 'surface-muted', 'ink', 'ink-muted', 'ink-subtle', 'line', 'line-strong', 'accent'];

describe('globals.css colour tokens', () => {
  it('declares both colour schemes', () => {
    expect(css).toContain('color-scheme: light;');
    expect(css).toContain('color-scheme: dark;');
  });

  it('follows the data-theme attribute, not the OS', () => {
    expect(css).toMatch(/@custom-variant dark \(.*\[data-theme='dark'\].*\);/);
    expect(css).toContain(":root[data-theme='dark']");
    expect(css).not.toContain('prefers-color-scheme');
  });

  it.each(TOKENS)('maps --color-%s in @theme inline', (token) => {
    expect(css).toContain(`--color-${token}: var(--${token});`);
  });

  it.each(TOKENS)('defines --%s exactly twice (light and dark)', (token) => {
    const matches = css.match(new RegExp(`^\\s+--${token}:`, 'gm')) ?? [];
    expect(matches).toHaveLength(2);
  });

  it('uses the #0070f3 brand blue, not indigo', () => {
    expect(css).toContain('--color-brand: #0070f3;');
    expect(css).toContain('--accent: var(--color-brand);');
    expect(css).not.toContain('indigo');
  });

  it('gives enabled buttons the pointer cursor', () => {
    expect(css).toMatch(/button:not\(:disabled\)[^{]*\{\s*cursor: pointer;/);
  });
});
