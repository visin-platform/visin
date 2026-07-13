import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TrainingConfigTab from './TrainingConfigTab';
import type { Config } from '../types';

Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn()
  }
});

const makeConfig = (overrides: Partial<Config> = {}): Config => ({
  _id: 'c1',
  config_uuid: 'config-uuid-1',
  summary: 'A summary',
  config_data: {},
  createdAt: '2026-01-01T10:00:00.000Z',
  updatedAt: '2026-01-02T10:00:00.000Z',
  ...overrides,
});

describe('TrainingConfigTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading spinner when configLoading is true', () => {
    const { container } = render(
      <TrainingConfigTab config={null} configLoading={true} training={{ configId: 'c1' }} />
    );
    expect(container.querySelector('.MuiCircularProgress-root')).toBeInTheDocument();
  });

  it('renders "no configuration linked" when training has no configId', () => {
    render(<TrainingConfigTab config={null} configLoading={false} training={{}} />);
    expect(screen.getByText('No configuration linked')).toBeInTheDocument();
  });

  it('renders error alert when config failed to load but configId exists', () => {
    render(<TrainingConfigTab config={null} configLoading={false} training={{ configId: 'c1' }} />);
    expect(screen.getByText(/Failed to load configuration/)).toBeInTheDocument();
    expect(screen.getByText(/c1/)).toBeInTheDocument();
  });

  it('renders config details and JSON data when config is available', () => {
    const config = makeConfig({
      config_name: 'My Config',
      config_data: { learning_rate: 0.001 }
    });
    render(<TrainingConfigTab config={config} configLoading={false} training={{ configId: 'c1' }} />);
    expect(screen.getByText('My Config')).toBeInTheDocument();
    expect(screen.getByText('A summary')).toBeInTheDocument();
    expect(screen.getByText('config-uuid-1')).toBeInTheDocument();
    expect(screen.getByText(/learning_rate/)).toBeInTheDocument();
  });

  it('copies config JSON to clipboard when the copy button is clicked', () => {
    const config = makeConfig({
      config_name: 'My Config',
      config_data: { learning_rate: 0.001 }
    });
    render(<TrainingConfigTab config={config} configLoading={false} training={{ configId: 'c1' }} />);
    fireEvent.click(screen.getByRole('button', { name: /copy json/i }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(JSON.stringify(config.config_data, null, 2));
  });

  it('handles string config_data without JSON.stringify', () => {
    const config = makeConfig({
      config_name: 'My Config',
      config_data: 'raw yaml text' as unknown as Record<string, unknown>
    });
    render(<TrainingConfigTab config={config} configLoading={false} training={{ configId: 'c1' }} />);
    expect(screen.getByText('raw yaml text')).toBeInTheDocument();
  });
});
