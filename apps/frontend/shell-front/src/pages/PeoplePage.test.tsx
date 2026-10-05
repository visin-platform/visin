import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { config } = vi.hoisted(() => ({ config: {} as Record<string, string | undefined> }));

vi.mock('../config/ConfigProvider', () => ({ useConfig: () => config, getGlobalConfig: () => config }));
vi.mock('../services/exploreApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/exploreApi')>()),
  exploreApi: { directoryPeople: vi.fn(), directoryGroups: vi.fn() }
}));

import { PeoplePage } from './PeoplePage';
import { exploreApi } from '../services/exploreApi';

const api = vi.mocked(exploreApi);

const pagination = (page = 1, pages = 1, total = 2) => ({ page, limit: 24, total, pages });
const ann = { id: 'u1', handle: 'ann-lee', name: 'Ann Lee' };
const bea = { id: 'u2', handle: 'bea', name: 'Bea', picture: 'https://p.test/bea.jpg' };
const lab = { id: 'g1', handle: 'road-lab', name: 'Road lab', description: 'Segmentation' };

const renderAt = (path = '/people') =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/people" element={<PeoplePage />} />
          <Route path="/people/groups" element={<PeoplePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(config)) delete config[key];
  Object.assign(config, { AUTH_SERVICE_URL: 'https://auth.test', GROUP_SERVICE_URL: 'https://group.test' });
  api.directoryPeople.mockResolvedValue({ people: [ann, bea], pagination: pagination() });
  api.directoryGroups.mockResolvedValue({ groups: [lab], pagination: pagination(1, 1, 1) });
});

describe('PeoplePage', () => {
  it('lists everyone as plain links to their pages, and says how many there are', async () => {
    renderAt();

    expect(await screen.findByRole('link', { name: /Ann Lee/ })).toHaveAttribute('href', '/u/ann-lee');
    expect(screen.getByRole('link', { name: /Bea/ })).toHaveAttribute('href', '/u/bea');
    expect(screen.getByRole('heading', { level: 1, name: 'People' })).toBeInTheDocument();
    expect(screen.getByText('2 people')).toBeInTheDocument();
    expect(api.directoryPeople).toHaveBeenCalledWith(1, 24);
    expect(api.directoryGroups).not.toHaveBeenCalled();
  });

  it('gives the page its own title and canonical', async () => {
    renderAt();
    await screen.findByRole('link', { name: /Ann Lee/ });

    expect(document.title).toBe('People on Visin');
    expect(document.head.querySelector('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `${window.location.origin}/people`
    );
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
  });

  it('shows the groups at their own address, with no member in sight', async () => {
    renderAt('/people/groups');

    expect(await screen.findByRole('link', { name: /Road lab/ })).toHaveAttribute('href', '/g/road-lab');
    expect(screen.getByRole('heading', { level: 1, name: 'Groups' })).toBeInTheDocument();
    expect(document.title).toBe('Groups on Visin');
    expect(api.directoryPeople).not.toHaveBeenCalled();
  });

  it('moves between the two with links', async () => {
    renderAt();

    expect(await screen.findByRole('tab', { name: 'Groups' })).toHaveAttribute('href', '/people/groups');
    expect(screen.getByRole('tab', { name: 'People' })).toHaveAttribute('href', '/people');
  });

  it('pages with links a crawler can follow, and names the page in its canonical', async () => {
    api.directoryPeople.mockResolvedValue({ people: [ann], pagination: pagination(2, 3, 60) });
    renderAt('/people?page=2&utm=x');

    await screen.findByRole('link', { name: /Ann Lee/ });

    expect(api.directoryPeople).toHaveBeenCalledWith(2, 24);
    expect(screen.getByRole('link', { name: /page 3/i })).toHaveAttribute('href', '/people?page=3');
    expect(screen.getByRole('link', { name: /page 1/i })).toHaveAttribute('href', '/people');
    expect(document.title).toBe('People on Visin · page 2');
    expect(document.head.querySelector('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `${window.location.origin}/people?page=2`
    );
  });

  it('treats a page that makes no sense as the first', async () => {
    renderAt('/people?page=banana');

    await screen.findByRole('link', { name: /Ann Lee/ });
    expect(api.directoryPeople).toHaveBeenCalledWith(1, 24);
  });

  it('asks search engines to skip a page past the end', async () => {
    api.directoryPeople.mockResolvedValue({ people: [], pagination: pagination(9, 1, 2) });
    renderAt('/people?page=9');

    expect(await screen.findByText('There is nothing on this page.')).toBeInTheDocument();
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  });

  it('says so where nobody has a public page yet', async () => {
    api.directoryPeople.mockResolvedValue({ people: [], pagination: pagination(1, 0, 0) });
    renderAt();

    expect(await screen.findByText('Nobody has a public page yet.')).toBeInTheDocument();
  });

  it('offers a retry when the list cannot be loaded', async () => {
    api.directoryPeople.mockRejectedValue(new Error('down'));
    renderAt();

    expect(await screen.findByText('Could not load the people.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('lists only what is configured: with no auth service, the groups are the page', async () => {
    delete config.AUTH_SERVICE_URL;
    renderAt();

    expect(await screen.findByRole('link', { name: /Road lab/ })).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(api.directoryPeople).not.toHaveBeenCalled();
  });

  it('has nothing to list where neither service is configured', () => {
    delete config.AUTH_SERVICE_URL;
    delete config.GROUP_SERVICE_URL;
    renderAt();

    expect(screen.getByText('Nothing to list here yet.')).toBeInTheDocument();
    expect(api.directoryPeople).not.toHaveBeenCalled();
    expect(api.directoryGroups).not.toHaveBeenCalled();
  });
});
