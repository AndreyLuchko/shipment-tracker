import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import AuthLayout from '@/app/(auth)/layout';

describe('AuthLayout', () => {
  it("renders the app name and the page's content inside <main>", () => {
    render(
      <AuthLayout>
        <h1>Log in</h1>
      </AuthLayout>,
    );

    const main = screen.getByRole('main');
    const appName = screen.getByText('Shipment Tracker');
    expect(main).toContainElement(appName);
    expect(main).toContainElement(screen.getByRole('heading', { name: 'Log in' }));
    expect(screen.queryByRole('heading', { name: 'Shipment Tracker' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('heading')).toHaveLength(1);
  });
});
