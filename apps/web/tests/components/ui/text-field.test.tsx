import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { TextField } from '@/components/ui/text-field';

describe('TextField', () => {
  it('labels an input that is valid and has no alert without an error', () => {
    render(<TextField label="Email" />);

    const input = screen.getByLabelText('Email');
    expect(input.tagName).toBe('INPUT');
    expect(input).toHaveAttribute('aria-invalid', 'false');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('marks the input invalid and describes it with the error', () => {
    render(<TextField label="Email" error="Enter a valid email address" />);

    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Enter a valid email address');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address');
  });

  it('treats an empty error as no error', () => {
    render(<TextField label="Email" error="" />);

    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'false');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('gives every field its own id', () => {
    render(
      <>
        <TextField label="Email" />
        <TextField label="Password" />
      </>,
    );

    const email = screen.getByLabelText('Email');
    const password = screen.getByLabelText('Password');
    expect(email).not.toBe(password);
    expect(email.id).not.toBe(password.id);
  });

  it("uses the caller's id", () => {
    render(<TextField label="Email" id="login-email" />);

    expect(screen.getByLabelText('Email')).toHaveAttribute('id', 'login-email');
  });

  it('passes every other prop, ref included, to the input', async () => {
    const user = userEvent.setup();
    const ref = createRef<HTMLInputElement>();
    const onChange = vi.fn();
    render(
      <TextField
        label="Email"
        type="email"
        name="email"
        autoComplete="email"
        placeholder="you@example.com"
        ref={ref}
        onChange={onChange}
      />,
    );

    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('type', 'email');
    expect(input).toHaveAttribute('name', 'email');
    expect(input).toHaveAttribute('autocomplete', 'email');
    expect(input).toHaveAttribute('placeholder', 'you@example.com');
    expect(ref.current).toBe(input);
    await user.type(input, 'a');
    expect(onChange).toHaveBeenCalled();
  });
});
