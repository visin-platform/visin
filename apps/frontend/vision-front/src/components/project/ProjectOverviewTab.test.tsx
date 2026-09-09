import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProjectOverviewTab from './ProjectOverviewTab';
import { formatCost } from '../../costing/costing';

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock
  };
});

const stats = {
  totalTrainings: 5,
  totalTime: 7384, // 2h 3m
  totalCost: 12.5,
  currency: 'EUR',
  avgEpochTime: 120
};

const dashboardStats = {
  testResultsCount: 3,
  visualizationsCount: 8,
  benchmarksCount: 2
};

describe('ProjectOverviewTab', () => {
  it('renders stats cards with formatted values', () => {
    render(
      <MemoryRouter>
        <ProjectOverviewTab stats={stats} dashboardStats={dashboardStats} isAuthenticated={true} user={{ id: 'u1', email: 'u1@test.dev', name: 'User One' }} />
      </MemoryRouter>
    );
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('2h 3m')).toBeInTheDocument();
    expect(screen.getByText(formatCost(12.5, 'EUR'))).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('shows "-" for avg epoch time when not provided', () => {
    render(
      <MemoryRouter>
        <ProjectOverviewTab
          stats={{ ...stats, avgEpochTime: 0 }}
          dashboardStats={dashboardStats}
          isAuthenticated={true}
          user={null}
        />
      </MemoryRouter>
    );
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('shows defaults of 0 when stats are missing', () => {
    render(
      <MemoryRouter>
        <ProjectOverviewTab stats={undefined} dashboardStats={undefined} isAuthenticated={true} user={null} />
      </MemoryRouter>
    );
    expect(screen.getByText('0h 0m')).toBeInTheDocument();
  });

  it('shows the unauthenticated overview message and, when a user is present, a start training CTA', () => {
    render(
      <MemoryRouter>
        <ProjectOverviewTab stats={stats} dashboardStats={dashboardStats} isAuthenticated={false} user={{ id: 'u1', email: 'u1@test.dev', name: 'User One' }} />
      </MemoryRouter>
    );
    expect(screen.getByText('Project Overview')).toBeInTheDocument();
    const cta = screen.getByText('Start New Training');
    fireEvent.click(cta);
    expect(navigateMock).toHaveBeenCalledWith('/trainings');
  });

  it('does not show the overview CTA when authenticated', () => {
    render(
      <MemoryRouter>
        <ProjectOverviewTab stats={stats} dashboardStats={dashboardStats} isAuthenticated={true} user={{ id: 'u1', email: 'u1@test.dev', name: 'User One' }} />
      </MemoryRouter>
    );
    expect(screen.queryByText('Project Overview')).not.toBeInTheDocument();
  });

  it('does not show the CTA button when unauthenticated and no user is present', () => {
    render(
      <MemoryRouter>
        <ProjectOverviewTab stats={stats} dashboardStats={dashboardStats} isAuthenticated={false} user={null} />
      </MemoryRouter>
    );
    expect(screen.queryByText('Start New Training')).not.toBeInTheDocument();
  });
});
