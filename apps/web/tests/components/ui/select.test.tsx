import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Select } from '@/components/ui/select';

const items = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
];

describe('Select', () => {
  it('names the combobox by its label and shows the selected item', () => {
    render(<Select label="Letter" value="b" onValueChange={vi.fn()} items={items} />);

    expect(screen.getByRole('combobox', { name: 'Letter' })).toHaveTextContent('Beta');
  });

  it('reports the picked value', async () => {
    const onValueChange = vi.fn();
    render(<Select label="Letter" value="b" onValueChange={onValueChange} items={items} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('combobox', { name: 'Letter' }));
    await user.click(screen.getByRole('option', { name: 'Alpha' }));

    expect(onValueChange).toHaveBeenCalledWith('a');
  });
});
