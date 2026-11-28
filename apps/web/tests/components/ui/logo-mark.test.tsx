import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LogoMark } from '@/components/ui/logo-mark';

describe('LogoMark', () => {
  it('is a decorative svg', () => {
    const { container } = render(<LogoMark className="h-8 w-auto" />);

    const svgs = container.querySelectorAll('svg');
    expect(svgs).toHaveLength(1);
    expect(svgs[0]).toHaveAttribute('aria-hidden', 'true');
    expect(svgs[0]).toHaveAttribute('focusable', 'false');
    expect(svgs[0]).toHaveAttribute('viewBox', '250 100 940 720');
    expect(svgs[0]).toHaveClass('h-8', 'w-auto');
    expect(svgs[0].textContent).toBe('');
  });

  it('gives every instance its own gradient ids, and every url(#…) points into its own svg', () => {
    const { container } = render(
      <>
        <LogoMark />
        <LogoMark />
      </>,
    );

    const ids = [...container.querySelectorAll('[id]')].map((element) => element.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);

    for (const svg of container.querySelectorAll('svg')) {
      const refs = [...svg.querySelectorAll('[fill^="url"], [stroke^="url"], [clip-path^="url"]')].flatMap((element) =>
        ['fill', 'stroke', 'clip-path']
          .map((name) => /^url\(#(.+)\)$/.exec(element.getAttribute(name) ?? '')?.[1])
          .filter((ref): ref is string => ref !== undefined),
      );
      expect(refs.length).toBeGreaterThan(0);
      for (const ref of refs) expect(svg.querySelector(`[id="${ref}"]`)).not.toBeNull();
    }
  });
});
