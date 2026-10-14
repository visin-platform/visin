import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ProvenanceCard from './ProvenanceCard';

const provenance = {
  git: { commit: 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0', branch: 'main', dirty: false, remote: 'https://github.com/acme/fusion.git' },
  command: 'python train.py --epochs 50 --token ***',
  packages: { torch: '2.5.0', visin: '0.7.0' },
  host: { hostname: 'gpu-3', platform: 'Linux-6.8', python: '3.12.1', cuda: '12.4' }
};

describe('ProvenanceCard', () => {
  it('shows the code and the machine in a line, with the commit linked to its repository', () => {
    render(<ProvenanceCard provenance={provenance} />);

    expect(screen.getByRole('link', { name: 'a1b2c3d' })).toHaveAttribute(
      'href',
      'https://github.com/acme/fusion/commit/a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0'
    );
    expect(screen.getByText('main')).toBeInTheDocument();
    expect(screen.getByText('gpu-3')).toBeInTheDocument();
    expect(screen.getByText('3.12.1')).toBeInTheDocument();
    expect(screen.getByText('12.4')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps the command and the package list behind one disclosure', async () => {
    render(<ProvenanceCard provenance={provenance} />);
    expect(screen.queryByText('python train.py --epochs 50 --token ***')).not.toBeInTheDocument();
    expect(screen.queryByText('torch 2.5.0')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Command and 2 packages' }));
    expect(screen.getByText('python train.py --epochs 50 --token ***')).toBeInTheDocument();
    expect(screen.getByText('torch 2.5.0')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Hide command and packages' }));
    await waitFor(() => expect(screen.queryByText('torch 2.5.0')).not.toBeInTheDocument());
  });

  it('shows the hash as text when the repository host is not one it can link to', () => {
    render(
      <ProvenanceCard
        provenance={{ ...provenance, git: { ...provenance.git, remote: 'git@git.internal.example:acme/fusion.git' } }}
      />
    );

    expect(screen.getByText('a1b2c3d')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('notes local changes quietly beside the commit, and does not raise an alert for them', () => {
    render(<ProvenanceCard provenance={{ ...provenance, git: { ...provenance.git, dirty: true } }} />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('local changes')).toBeInTheDocument();
  });

  it('says nothing about local changes for a clean tree', () => {
    render(<ProvenanceCard provenance={provenance} />);

    expect(screen.queryByText('local changes')).not.toBeInTheDocument();
  });

  it('offers just the command when no packages were recorded', () => {
    render(<ProvenanceCard provenance={{ command: 'python train.py' }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Command' }));
    expect(screen.getByText('python train.py')).toBeInTheDocument();
  });

  it('copes with a run that recorded only part of it', () => {
    render(<ProvenanceCard provenance={{ host: { python: '3.12.1' } }} />);
    expect(screen.getByText('3.12.1')).toBeInTheDocument();
    expect(screen.queryByText('Commit')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
