import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ConfigDetailsDialog from './ConfigDetailsDialog';
import { Config } from '../../types';

const config: Config = {
  _id: 'cfg1',
  config_uuid: 'uuid-1',
  summary: 'Config summary text',
  config_name: 'My Config',
  config_data: {
    learningRate: 0.01,
    nested: { batchSize: 32, tags: ['a', 'b'] }
  },
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z'
};

describe('ConfigDetailsDialog', () => {
  it('does not render dialog content when closed', () => {
    render(<ConfigDetailsDialog open={false} onClose={vi.fn()} config={config} />);
    expect(screen.queryByText('Config Details')).not.toBeInTheDocument();
  });

  it('renders nothing config-specific when config is null', () => {
    render(<ConfigDetailsDialog open={true} onClose={vi.fn()} config={null} />);
    expect(screen.getByText('Config Details')).toBeInTheDocument();
    expect(screen.queryByText('Config UUID:')).not.toBeInTheDocument();
  });

  it('renders config UUID, summary, name and nested config data', () => {
    render(<ConfigDetailsDialog open={true} onClose={vi.fn()} config={config} />);
    expect(screen.getByText('uuid-1')).toBeInTheDocument();
    expect(screen.getByText('Config summary text')).toBeInTheDocument();
    expect(screen.getByText('My Config')).toBeInTheDocument();
    expect(screen.getByText('0.01')).toBeInTheDocument();
    expect(screen.getByText('32')).toBeInTheDocument();
    expect(screen.getByText('[a, b]')).toBeInTheDocument();
  });

  it('omits the config name section when config_name is not set', () => {
    const noName = { ...config, config_name: undefined };
    render(<ConfigDetailsDialog open={true} onClose={vi.fn()} config={noName} />);
    expect(screen.queryByText('Config Name:')).not.toBeInTheDocument();
  });

  it('calls onClose when Close is clicked', () => {
    const onClose = vi.fn();
    render(<ConfigDetailsDialog open={true} onClose={onClose} config={config} />);
    fireEvent.click(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
