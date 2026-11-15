import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FormAlert } from '@/components/ui/form-alert';

describe('FormAlert', () => {
  it('shows the message in an alert', () => {
    render(<FormAlert message="Invalid email or password" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password');
  });

  it.each([{ message: undefined }, { message: '' }])('renders nothing for message $message', ({ message }) => {
    const { container } = render(<FormAlert message={message} />);

    expect(container).toBeEmptyDOMElement();
  });
});
