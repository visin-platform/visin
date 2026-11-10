import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderPage } from '../test/render';
import { admin } from '../services/admin';
import ViviPublicPage from './ViviPublicPage';

vi.mock('../services/admin', () => ({ admin: vi.fn() }));
vi.mock('../config/ConfigProvider', () => ({ useConfig: () => ({ SHELL_FRONT_URL: 'https://app.example.test/' }) }));
const profile = {
  assistantId: 'platform-assistant',
  name: 'Vivi',
  handle: 'vivi',
  bio: 'Research assistant',
  public: true
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(admin).mockResolvedValue(profile);
});

it('shows the current public route and leaves it unchanged until Save', async () => {
  renderPage(<ViviPublicPage />);
  expect(await screen.findByDisplayValue('vivi')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Open public page' })).toHaveAttribute(
    'href',
    'https://app.example.test/u/vivi'
  );
  expect(screen.getByRole('button', { name: 'Save public page' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Page address'), { target: { value: 'research-vivi' } });
  expect(screen.getByText('Address after saving: https://app.example.test/u/research-vivi')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Open public page' })).toHaveAttribute(
    'href',
    'https://app.example.test/u/vivi'
  );
  expect(admin).toHaveBeenCalledTimes(1);
});
it('saves a normalized handle through the existing admin endpoint and updates the link', async () => {
  vi.mocked(admin).mockImplementation((async (_path: string, method = 'GET', body?: object) =>
    method === 'PUT' ? { ...profile, ...body } : profile) as typeof admin);
  renderPage(<ViviPublicPage />);
  await screen.findByDisplayValue('vivi');
  fireEvent.change(screen.getByLabelText('Page address'), { target: { value: ' Research-Vivi ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save public page' }));
  await waitFor(() =>
    expect(admin).toHaveBeenCalledWith('/vivi/admin/profile', 'PUT', {
      name: 'Vivi',
      handle: 'research-vivi',
      bio: 'Research assistant',
      public: true
    })
  );
  expect(await screen.findByText('Vivi’s public page was saved.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Open public page' })).toHaveAttribute(
    'href',
    'https://app.example.test/u/research-vivi'
  );
  expect(screen.getByRole('button', { name: 'Save public page' })).toBeDisabled();
});
it.each(['ab', '-vivi', 'vivi-', 'vivi--research', '../admin', 'vivi/research'])(
  'rejects invalid page handles: %s',
  async (handle) => {
    renderPage(<ViviPublicPage />);
    await screen.findByDisplayValue('vivi');
    fireEvent.change(screen.getByLabelText('Page address'), { target: { value: handle } });
    expect(screen.getByRole('button', { name: 'Save public page' })).toBeDisabled();
    expect(admin).toHaveBeenCalledTimes(1);
  }
);
it('shows a taken-address error without changing the saved public link', async () => {
  vi.mocked(admin).mockResolvedValueOnce(profile).mockRejectedValueOnce(new Error('That handle is already taken'));
  renderPage(<ViviPublicPage />);
  await screen.findByDisplayValue('vivi');
  fireEvent.change(screen.getByLabelText('Page address'), { target: { value: 'taken-handle' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save public page' }));
  expect(await screen.findByText('That handle is already taken')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Open public page' })).toHaveAttribute(
    'href',
    'https://app.example.test/u/vivi'
  );
});
it('hides the saved public page when visibility is switched off and saved', async () => {
  vi.mocked(admin).mockImplementation((async (_path: string, method = 'GET', body?: object) =>
    method === 'PUT' ? { ...profile, ...body } : profile) as typeof admin);
  renderPage(<ViviPublicPage />);
  await screen.findByDisplayValue('vivi');
  fireEvent.click(screen.getByRole('switch', { name: 'Public page visible' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save public page' }));
  await screen.findByText('Vivi’s public page was saved.');
  expect(screen.queryByRole('link', { name: 'Open public page' })).not.toBeInTheDocument();
});
it('reports a missing platform profile and can retry loading it', async () => {
  vi.mocked(admin).mockRejectedValueOnce(new Error('No platform assistant is set up yet')).mockResolvedValue(profile);
  renderPage(<ViviPublicPage />);
  expect(await screen.findByText('No platform assistant is set up yet')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry public page' }));
  expect(await screen.findByDisplayValue('vivi')).toBeInTheDocument();
});
