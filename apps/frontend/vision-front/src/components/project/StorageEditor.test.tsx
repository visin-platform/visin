import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StorageEditor from './StorageEditor';
import type { ProjectStorage } from '../../types/Project';

const renderEditor = (value: ProjectStorage) => {
  const onChange = vi.fn();
  render(<StorageEditor value={value} onChange={onChange} />);
  return onChange;
};

describe('StorageEditor', () => {
  it('says a Visin project keeps everything on the server and offers no namespace', () => {
    renderEditor({ provider: 'visin' });
    expect(screen.getByText(/Nothing leaves this server/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Hub user or organisation')).not.toBeInTheDocument();
  });

  it('switches to the Hub', async () => {
    const onChange = renderEditor({ provider: 'visin' });
    await userEvent.click(screen.getByRole('combobox', { name: 'Storage' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Hugging Face Hub' }));
    expect(onChange).toHaveBeenCalledWith({ provider: 'hf' });
  });

  it('shows the namespace for the Hub and reports it trimmed, or cleared when emptied', async () => {
    const onChange = renderEditor({ provider: 'hf', hfNamespace: 'acm' });
    expect(screen.getByText(/Visin keeps only a pointer to the exact commit/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Hub user or organisation'), { target: { value: ' acme ' } });
    expect(onChange).toHaveBeenLastCalledWith({ provider: 'hf', hfNamespace: 'acme' });
    await userEvent.clear(screen.getByLabelText('Hub user or organisation'));
    expect(onChange).toHaveBeenLastCalledWith({ provider: 'hf' });
  });

  it('forgets the namespace when going back to Visin', async () => {
    const onChange = renderEditor({ provider: 'hf', hfNamespace: 'acme' });
    await userEvent.click(screen.getByRole('combobox', { name: 'Storage' }));
    await userEvent.click(await screen.findByRole('option', { name: /^Visin/ }));
    expect(onChange).toHaveBeenCalledWith({ provider: 'visin' });
  });
});
