import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Button, buttonClassName } from '@/components/ui/button';

describe('Button', () => {
  it('defaults to a primary, enabled button of type "button"', () => {
    render(<Button>Save</Button>);

    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute('data-variant', 'primary');
    expect(button).not.toHaveAttribute('aria-busy');
  });

  it('passes type, variant and className through', () => {
    render(
      <Button type="submit" variant="secondary" className="w-full">
        Save
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveAttribute('type', 'submit');
    expect(button).toHaveAttribute('data-variant', 'secondary');
    expect(button).toHaveClass('w-full');
  });

  it('is disabled and busy while loading, keeps its name and ignores clicks', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('is disabled without being busy when only disabled', () => {
    render(<Button disabled>Save</Button>);

    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toBeDisabled();
    expect(button).not.toHaveAttribute('aria-busy');
  });

  it('calls onClick once per click', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('buttonClassName', () => {
  it('is the look of a primary Button', () => {
    render(<Button>Save</Button>);

    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass(...buttonClassName('primary').split(' '));
  });

  it('differs per variant and appends a className', () => {
    const secondary = buttonClassName('secondary', 'w-full');

    expect(secondary).not.toBe(buttonClassName('primary'));
    expect(secondary.split(' ')).toContain('w-full');
  });

  it('defaults to primary', () => {
    expect(buttonClassName()).toBe(buttonClassName('primary'));
  });
});
