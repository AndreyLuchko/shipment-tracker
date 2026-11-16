import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { TextareaField } from '@/components/ui/textarea-field';

describe('TextareaField', () => {
  it('labels a textarea that is valid and has no alert without an error', () => {
    render(<TextareaField label="Note" />);

    const textarea = screen.getByLabelText('Note');
    expect(textarea.tagName).toBe('TEXTAREA');
    expect(textarea).toHaveAttribute('aria-invalid', 'false');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('marks the textarea invalid and describes it with the error', () => {
    render(<TextareaField label="Note" error="Note must be at most 500 characters" />);

    const textarea = screen.getByLabelText('Note');
    expect(textarea).toHaveAttribute('aria-invalid', 'true');
    expect(textarea).toHaveAccessibleDescription('Note must be at most 500 characters');
    expect(screen.getByRole('alert')).toHaveTextContent('Note must be at most 500 characters');
  });

  it('treats an empty error as no error', () => {
    render(<TextareaField label="Note" error="" />);

    expect(screen.getByLabelText('Note')).toHaveAttribute('aria-invalid', 'false');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('gives every field its own id', () => {
    render(
      <>
        <TextareaField label="Note" />
        <TextareaField label="Comment" />
      </>,
    );

    const note = screen.getByLabelText('Note');
    const comment = screen.getByLabelText('Comment');
    expect(note).not.toBe(comment);
    expect(note.id).not.toBe(comment.id);
  });

  it('passes every other prop, ref included, to the textarea', async () => {
    const user = userEvent.setup();
    const ref = createRef<HTMLTextAreaElement>();
    const onChange = vi.fn();
    render(<TextareaField label="Note" id="note" name="note" rows={3} ref={ref} onChange={onChange} />);

    const textarea = screen.getByLabelText('Note');
    expect(textarea).toHaveAttribute('id', 'note');
    expect(textarea).toHaveAttribute('name', 'note');
    expect(textarea).toHaveAttribute('rows', '3');
    expect(ref.current).toBe(textarea);
    await user.type(textarea, 'hi');
    expect(onChange).toHaveBeenCalled();
    expect(textarea).toHaveValue('hi');
  });
});
