import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EmptyState } from '@/components/ui/empty-state';

describe('EmptyState', () => {
  it('shows the title and is not an alert', () => {
    render(<EmptyState title="No shipments yet." />);

    expect(screen.getByText('No shipments yet.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the title, the description and the action, in that order', () => {
    render(
      <EmptyState title="T" description="D">
        <a href="/x">Go</a>
      </EmptyState>,
    );

    const title = screen.getByText('T');
    const description = screen.getByText('D');
    const link = screen.getByRole('link', { name: 'Go' });
    expect(title.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(description.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
