import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { SelectField } from '@/components/ui/select-field';

const OPTIONS = (
  <>
    <option value="">Pick</option>
    <option value="a">A</option>
  </>
);

describe('SelectField', () => {
  it('labels a select that is valid and has no alert without an error', () => {
    render(<SelectField label="Status">{OPTIONS}</SelectField>);

    const select = screen.getByLabelText('Status');
    expect(select.tagName).toBe('SELECT');
    expect(select).toHaveAttribute('aria-invalid', 'false');
    expect(within(select).getAllByRole('option')).toHaveLength(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('marks the select invalid and describes it with the error', () => {
    render(
      <SelectField label="Status" error="Select a status">
        {OPTIONS}
      </SelectField>,
    );

    const select = screen.getByLabelText('Status');
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(select).toHaveAccessibleDescription('Select a status');
    expect(screen.getByRole('alert')).toHaveTextContent('Select a status');
  });

  it('treats an empty error as no error', () => {
    render(
      <SelectField label="Status" error="">
        {OPTIONS}
      </SelectField>,
    );

    expect(screen.getByLabelText('Status')).toHaveAttribute('aria-invalid', 'false');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('gives every field its own id', () => {
    render(
      <>
        <SelectField label="Status">{OPTIONS}</SelectField>
        <SelectField label="Client">{OPTIONS}</SelectField>
      </>,
    );

    const status = screen.getByLabelText('Status');
    const client = screen.getByLabelText('Client');
    expect(status).not.toBe(client);
    expect(status.id).not.toBe(client.id);
  });

  it('passes every other prop, ref included, to the select', async () => {
    const user = userEvent.setup();
    const ref = createRef<HTMLSelectElement>();
    const onChange = vi.fn();
    const { unmount } = render(
      <SelectField label="Status" id="status" name="status" disabled>
        {OPTIONS}
      </SelectField>,
    );

    const disabled = screen.getByLabelText('Status');
    expect(disabled).toHaveAttribute('id', 'status');
    expect(disabled).toHaveAttribute('name', 'status');
    expect(disabled).toBeDisabled();
    unmount();

    render(
      <SelectField label="Status" id="status" name="status" ref={ref} onChange={onChange}>
        {OPTIONS}
      </SelectField>,
    );

    const select = screen.getByLabelText('Status');
    expect(ref.current).toBe(select);
    await user.selectOptions(select, 'a');
    expect(onChange).toHaveBeenCalled();
    expect(select).toHaveValue('a');
  });
});
