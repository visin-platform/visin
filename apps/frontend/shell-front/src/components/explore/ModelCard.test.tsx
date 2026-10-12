import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ModelCard } from './ModelCard';
import type { ExploreModel } from '../../services/exploreApi';

const base: ExploreModel = {
  model: { _id: 'm1', provider: 'visin', format: 'pth', status: 'ready', addedAt: '2026-10-12T00:00:00Z' },
  training: { _id: 't1', name: 'Iseauto run' },
  project: { _id: 'p1', name: 'Road models' }
};
const card = (model: Partial<ExploreModel['model']>, project = base.project) => render(
  <MemoryRouter><ModelCard row={{ ...base, project, model: { ...base.model, ...model } }} /></MemoryRouter>
);

describe('public model cards', () => {
  it('states when a ready checkpoint has no declared licence', () => {
    card({});
    expect(screen.getByRole('link', { name: 'pth checkpoint' })).toHaveAttribute('href', '/trainings/t1');
    expect(screen.getByText('Road models')).toBeInTheDocument();
    expect(screen.getByText(/Licence not stated/)).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('shows the licence name or id, and uses the reported filename', () => {
    const view = card({ filename: 'weights.onnx', format: 'onnx', license: { id: 'cc-by-4.0', name: 'CC BY 4.0' } });
    expect(screen.getByRole('link', { name: 'weights.onnx' })).toBeInTheDocument();
    expect(screen.getByText(/Visin · .onnx · CC BY 4.0/)).toBeInTheDocument();
    view.unmount();
    card({ license: { id: 'custom-licence' } });
    expect(screen.getByText(/custom-licence/)).toBeInTheDocument();
  });

  it('reports failed verification and an older checkpoint with no status as pending', () => {
    const view = card({ status: 'failed' });
    expect(screen.getByText(/Failed verification/)).toBeInTheDocument();
    view.unmount();
    card({ status: undefined });
    expect(screen.getByText(/Being verified/)).toBeInTheDocument();
  });

  it('names a Hub link even when a legacy response omits its revision or repo', () => {
    const view = card({ provider: 'hf', repo: 'team/clft', revision: undefined });
    expect(screen.getByRole('link', { name: 'team/clft' })).toBeInTheDocument();
    expect(screen.getByText('Hugging Face')).toBeInTheDocument();
    view.unmount();
    render(<MemoryRouter><ModelCard row={{ ...base, project: undefined, model: { ...base.model, provider: 'hf' } }} /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Hub model' })).toBeInTheDocument();
    expect(screen.queryByText('Road models')).not.toBeInTheDocument();
  });
});
