import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
const getGlobalConfig = vi.hoisted(() => vi.fn());
vi.mock('../../config/ConfigProvider', () => ({ getGlobalConfig }));

import { EmbeddedContext } from '../../federation/EmbeddedContext';
import PaperAuthors from './PaperAuthors';
import PaperLinks from './PaperLinks';
import PaperResultsList from './PaperResultsList';

const inRouter = (ui: React.ReactElement, embedded = false) =>
  render(
    <MemoryRouter>
      <EmbeddedContext.Provider value={embedded}>{ui}</EmbeddedContext.Provider>
    </MemoryRouter>
  );

describe('PaperAuthors', () => {
  beforeEach(() => {
    getGlobalConfig.mockReset();
    getGlobalConfig.mockReturnValue({});
  });

  const authors = [
    { name: 'Ann Lee', status: 'confirmed' as const, user: { id: 'u1', handle: 'ann' } },
    { name: 'Bo Wu', status: 'pending' as const, user: { id: 'u2', handle: 'bo' } },
    { name: 'Cy Ode' },
    { name: 'Di Hidden', status: 'confirmed' as const, user: { id: 'u3' } }
  ];

  it('links a confirmed author to their page inside the shell, and marks one who has not answered', () => {
    inRouter(<PaperAuthors authors={authors} />, true);

    expect(screen.getByRole('link', { name: 'Ann Lee' })).toHaveAttribute('href', '/u/ann');
    expect(screen.queryByRole('link', { name: 'Bo Wu' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('not confirmed yet')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Cy Ode' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Di Hidden' })).not.toBeInTheDocument();
  });

  it('links a confirmed author to the shell’s page when standalone, where the shell’s address is configured', () => {
    getGlobalConfig.mockReturnValue({ SHELL_FRONT_URL: 'https://app.example.test/' });
    inRouter(<PaperAuthors authors={authors} />);

    expect(screen.getByRole('link', { name: 'Ann Lee' })).toHaveAttribute('href', 'https://app.example.test/u/ann');
    expect(screen.queryByRole('link', { name: 'Bo Wu' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Di Hidden' })).not.toBeInTheDocument();
  });

  it('shows only names where there is no shell to send people to', () => {
    inRouter(<PaperAuthors authors={authors} />);

    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.getByText(/Ann Lee/)).toBeInTheDocument();
  });
});

describe('PaperLinks', () => {
  it('opens each place the paper lives in a new tab, outside Visin', () => {
    render(<PaperLinks arxivId="2401.01234" doi="10.1000/x" url="https://example.test/p" pdfUrl="https://example.test/p.pdf" />);

    expect(screen.getByRole('link', { name: /arXiv:2401.01234/ })).toHaveAttribute('href', 'https://arxiv.org/abs/2401.01234');
    expect(screen.getByRole('link', { name: /DOI 10.1000\/x/ })).toHaveAttribute('href', 'https://doi.org/10.1000/x');
    expect(screen.getByRole('link', { name: /PDF/ })).toHaveAttribute('href', 'https://example.test/p.pdf');
    const page = screen.getByRole('link', { name: /Paper page/ });
    expect(page).toHaveAttribute('target', '_blank');
    expect(page).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('is nothing at all with nowhere to point', () => {
    const { container } = render(<PaperLinks />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('PaperResultsList', () => {
  it('links what is public, and names nothing of what is not', () => {
    inRouter(
      <PaperResultsList
        results={[
          { kind: 'project', available: true, ref: 'p1', name: 'Night seg', note: 'Table 1' },
          { kind: 'training', available: true, ref: 't1', name: 'window16', project: { id: 'p1', name: 'Night seg' } },
          { kind: 'leaderboard', available: true, ref: 'road@2', name: 'Road scenes' },
          { kind: 'project', available: false },
          { kind: 'leaderboard', available: false, ref: 'old@1' }
        ]}
      />
    );

    expect(screen.getByRole('link', { name: 'Night seg' })).toHaveAttribute('href', '/projects/p1');
    expect(screen.getByRole('link', { name: 'window16' })).toHaveAttribute('href', '/trainings/t1');
    expect(screen.getByRole('link', { name: 'Road scenes' })).toHaveAttribute('href', '/leaderboards/road/2');
    expect(screen.getByText('Table 1')).toBeInTheDocument();
    expect(screen.getByText('Run in Night seg')).toBeInTheDocument();
    expect(screen.getByText('Project no longer public')).toBeInTheDocument();
    expect(screen.getByText('Leaderboard no longer public')).toBeInTheDocument();
    expect(screen.getByText('(old@1)')).toBeInTheDocument();
  });
});
