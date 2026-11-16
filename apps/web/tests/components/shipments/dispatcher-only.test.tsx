import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DispatcherOnly } from '@/components/shipments/dispatcher-only';
import { useAuthStore } from '@/stores/auth';

import { DISPATCHER, USER } from '../../helpers/fixtures';
import { routerMock } from '../../helpers/router';

const renderGuard = () =>
  render(
    <DispatcherOnly>
      <p>form</p>
    </DispatcherOnly>,
  );

describe('DispatcherOnly', () => {
  it('renders the children for a dispatcher', () => {
    useAuthStore.setState({ status: 'authenticated', user: DISPATCHER });

    renderGuard();

    expect(screen.getByText('form')).toBeInTheDocument();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('sends a client to the shipments list without rendering the children', () => {
    useAuthStore.setState({ status: 'authenticated', user: USER });

    renderGuard();

    expect(screen.queryByText('form')).not.toBeInTheDocument();
    expect(routerMock.replace).toHaveBeenCalledTimes(1);
    expect(routerMock.replace).toHaveBeenCalledWith('/shipments');
  });

  it('renders nothing and does not navigate without a user', () => {
    const { container } = renderGuard();

    expect(container).toBeEmptyDOMElement();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('hides the children and navigates away when the user stops being a dispatcher', () => {
    useAuthStore.setState({ status: 'authenticated', user: DISPATCHER });
    renderGuard();
    expect(screen.getByText('form')).toBeInTheDocument();

    act(() => useAuthStore.setState({ status: 'authenticated', user: USER }));

    expect(screen.queryByText('form')).not.toBeInTheDocument();
    expect(routerMock.replace).toHaveBeenCalledWith('/shipments');
  });
});
