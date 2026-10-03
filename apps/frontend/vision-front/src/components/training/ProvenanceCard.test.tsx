import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ProvenanceCard from './ProvenanceCard';

const provenance = {
  git: { commit: 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6a7b8c9d0', branch: 'main', dirty: false, remote: 'https://github.com/acme/fusion.git' },
  command: 'python train.py --epochs 50 --token ***',
  packages: { torch: '2.5.0', visin: '0.7.0' },
  host: { hostname: 'gpu-3', platform: 'Linux-6.8', python: '3.12.1', cuda: '12.4' }
};

describe('ProvenanceCard', () => {
  it('shows the code, the command and the machine a run came from', () => {
    render(<ProvenanceCard provenance={provenance} />);
    expect(screen.getByText('a1b2c3d')).toBeInTheDocument();
    expect(screen.getByText('main')).toBeInTheDocument();
    expect(screen.getByText('https://github.com/acme/fusion.git')).toBeInTheDocument();
    expect(screen.getByText('python train.py --epochs 50 --token ***')).toBeInTheDocument();
    expect(screen.getByText('gpu-3')).toBeInTheDocument();
    expect(screen.getByText('12.4')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('warns that a dirty tree means the commit is not the code that ran', () => {
    render(<ProvenanceCard provenance={{ ...provenance, git: { ...provenance.git, dirty: true } }} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/uncommitted changes.*commit a1b2c3d alone does not give back the code/);
  });

  it('lists the packages on request', () => {
    render(<ProvenanceCard provenance={provenance} />);
    expect(screen.queryByText('torch 2.5.0')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show 2 packages' }));
    expect(screen.getByText('torch 2.5.0')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hide packages' }));
  });

  it('copes with a run that recorded only part of it', () => {
    render(<ProvenanceCard provenance={{ host: { python: '3.12.1' } }} />);
    expect(screen.getByText('3.12.1')).toBeInTheDocument();
    expect(screen.queryByText('Commit')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
