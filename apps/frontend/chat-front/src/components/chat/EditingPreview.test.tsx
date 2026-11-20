import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { EditingPreview } from './EditingPreview';

it('says a question is being reworded, and lets go of it', () => {
  const cancel = vi.fn();
  render(<EditingPreview onCancel={cancel} />);
  expect(screen.getByText('Editing your question')).toBeInTheDocument();
  expect(screen.getByText('Sending asks it again and replaces its answer.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel edit' }));
  expect(cancel).toHaveBeenCalledTimes(1);
});
