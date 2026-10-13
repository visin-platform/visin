import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ModelDialog from './ModelDialog';
import type { LocalModel } from '../localModel/useLocalModel';

const makeModel = (overrides: Partial<LocalModel> = {}): LocalModel => ({
  settings: { url: '', token: undefined, autoDetect: true, minScore: 0.35 },
  status: 'off',
  info: null,
  error: null,
  canDetect: false,
  canSegment: false,
  connect: vi.fn(async () => true),
  disconnect: vi.fn(),
  update: vi.fn(),
  detect: vi.fn(),
  segment: vi.fn(),
  ...overrides
});

const open = (model: LocalModel, onClose = vi.fn()) => {
  render(<ModelDialog open model={model} onClose={onClose} />);
  return onClose;
};

beforeEach(() => vi.clearAllMocks());

describe('ModelDialog', () => {
  it('shows the command that starts the server, naming this site as the one allowed', () => {
    open(makeModel());

    expect(screen.getByTestId('model-command')).toHaveTextContent(`visin-infer serve --allow-origin ${window.location.origin}`);
    expect(screen.getByLabelText('Address')).toHaveValue('http://localhost:8000');
  });

  it('copies the command', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    open(makeModel());

    fireEvent.click(screen.getByRole('button', { name: 'copy command' }));

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('visin-infer serve'));
  });

  it('connects with the address and token typed', () => {
    const model = makeModel();
    open(model);

    fireEvent.change(screen.getByLabelText('Address'), { target: { value: 'localhost:9000' } });
    fireEvent.change(screen.getByLabelText(/Token/), { target: { value: ' secret ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    expect(model.connect).toHaveBeenCalledWith({ url: 'localhost:9000', token: 'secret' });
  });

  it('sends no token when the field is empty, and cannot connect with no address', () => {
    const model = makeModel();
    open(model);

    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(model.connect).toHaveBeenCalledWith({ url: 'http://localhost:8000', token: undefined });

    fireEvent.change(screen.getByLabelText('Address'), { target: { value: '  ' } });
    expect(screen.getByRole('button', { name: 'Connect' })).toBeDisabled();
  });

  it('says what it connected to, and offers the settings that matter then', () => {
    const model = makeModel({
      status: 'connected',
      settings: { url: 'http://localhost:8000', token: 'abc', autoDetect: true, minScore: 0.35 },
      info: { name: 'visin-infer', version: '0.1.0', device: 'RTX 4070', classes: ['a', 'b'], supports: { detect: true, segment: true } }
    });
    open(model);

    expect(screen.getByText(/Connected · RTX 4070 · detects 2 classes · click-to-segment on/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Token/)).toHaveValue('abc');

    fireEvent.click(screen.getByRole('switch', { name: 'Suggest boxes when a frame opens' }));
    expect(model.update).toHaveBeenCalledWith({ autoDetect: false });

    fireEvent.change(screen.getByLabelText('Show boxes at least this sure'), { target: { value: '1.5' } });
    expect(model.update).toHaveBeenCalledWith({ minScore: 1 });
    fireEvent.change(screen.getByLabelText('Show boxes at least this sure'), { target: { value: '0.5' } });
    expect(model.update).toHaveBeenCalledWith({ minScore: 0.5 });

    expect(screen.getByRole('button', { name: 'Reconnect' })).toBeInTheDocument();
  });

  it('shows why it could not connect', () => {
    open(
      makeModel({
        status: 'unreachable',
        settings: { url: 'http://localhost:8000', token: undefined, autoDetect: true, minScore: 0.35 },
        error: 'Could not reach the model server at http://localhost:8000'
      })
    );

    expect(screen.getByText(/Could not reach the model server/)).toBeInTheDocument();
    expect(screen.queryByText('Suggest boxes when a frame opens')).not.toBeInTheDocument();
  });

  it('shows progress while connecting, disconnects, and closes', () => {
    const model = makeModel({ status: 'connecting', settings: { url: 'http://localhost:8000', token: undefined, autoDetect: true, minScore: 0.35 } });
    const onClose = open(model);

    expect(screen.getByRole('button', { name: 'Connecting…' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(model.disconnect).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows no connection details for a model that does not detect', () => {
    open(
      makeModel({
        status: 'connected',
        settings: { url: 'http://localhost:8000', token: undefined, autoDetect: true, minScore: 0.35 },
        info: { name: 'visin-infer', version: '0.1.0', device: 'CPU', classes: [], supports: { detect: false, segment: false } }
      })
    );

    expect(screen.getByText(/^Connected · CPU$/)).toBeInTheDocument();
  });
});
