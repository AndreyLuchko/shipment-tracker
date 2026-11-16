import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Skeleton } from '@/components/ui/skeleton';

describe('Skeleton', () => {
  it('renders one hidden block with the caller’s classes', () => {
    const { container } = render(<Skeleton className="h-4 w-32" />);

    const blocks = container.querySelectorAll('div');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toHaveAttribute('aria-hidden', 'true');
    expect(blocks[0]).toHaveClass('h-4', 'w-32');
  });
});
