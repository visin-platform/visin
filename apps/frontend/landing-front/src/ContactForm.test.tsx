import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ContactForm from './ContactForm';

vi.mock('./config/ConfigProvider', () => ({
  useConfig: () => ({ VISION_API_URL: 'http://vision-api.test' }),
}));

const fillForm = () => {
  fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Ada Lovelace', name: 'name' } });
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'ada@example.com', name: 'email' } });
  fireEvent.change(screen.getByLabelText(/message/i), { target: { value: 'Hello there', name: 'message' } });
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('ContactForm', () => {
  it('submits the form to VISION_API_URL and shows a success message', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<ContactForm />);
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() => expect(screen.getByText('Thank you')).toBeInTheDocument());

    expect(fetchMock).toHaveBeenCalledWith(
      'http://vision-api.test/api/contacts',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Ada Lovelace', email: 'ada@example.com', message: 'Hello there' }),
      })
    );
  });

  it('resets the form fields after a successful submit', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) }));
    render(<ContactForm />);
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() => expect(screen.getByText('Thank you')).toBeInTheDocument());
  });

  it('shows the server error message when the API reports failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: false, message: 'Invalid email' }) })
    );

    render(<ContactForm />);
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() => expect(screen.getByText('Invalid email')).toBeInTheDocument());
  });

  it('falls back to a generic error message when none is provided', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));

    render(<ContactForm />);
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() => expect(screen.getByText('Failed to submit form')).toBeInTheDocument());
  });

  it('shows a network error message when the request itself fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    render(<ContactForm />);
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() => expect(screen.getByText('Network error. Please try again.')).toBeInTheDocument());
  });

  it('disables the submit button while sending', async () => {
    let resolveFetch: (value: unknown) => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }))
    );

    render(<ContactForm />);
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    expect(screen.getByRole('button', { name: /sending/i })).toBeDisabled();

    resolveFetch({ ok: true, json: async () => ({ success: true }) });
    await waitFor(() => expect(screen.getByText('Thank you')).toBeInTheDocument());
  });
});
