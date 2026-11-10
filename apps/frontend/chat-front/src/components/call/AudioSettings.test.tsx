import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/audioDevices', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/audioDevices')>()),
  listAudioDevices: vi.fn(),
  canChooseSpeaker: vi.fn(),
  watchAudioDevices: vi.fn(() => () => undefined)
}));

import { canChooseSpeaker, listAudioDevices, watchAudioDevices, type AudioDevices } from '../../services/audioDevices';
import { AudioSettings, type AudioSettingsProps } from './AudioSettings';

const SAME_HARDWARE: AudioDevices = {
  microphones: [
    { id: 'default', label: 'Default - Headset', groupId: 'headset' },
    { id: 'webcam', label: 'Webcam', groupId: 'cam' }
  ],
  speakers: [
    { id: 'default', label: 'Default - Headset', groupId: 'headset' },
    { id: 'monitor', label: 'Monitor speakers', groupId: 'monitor' }
  ]
};

function renderSettings(props: Partial<AudioSettingsProps> = {}) {
  const handlers = { onClose: vi.fn(), onSelectMicrophone: vi.fn(), onSelectSpeaker: vi.fn() };
  render(<AudioSettings open microphoneId={null} speakerId={null} {...handlers} {...props} />);
  return handlers;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listAudioDevices).mockResolvedValue(SAME_HARDWARE);
  vi.mocked(canChooseSpeaker).mockReturnValue(true);
});

describe('AudioSettings', () => {
  it('draws nothing while closed', () => {
    render(
      <AudioSettings
        open={false}
        onClose={vi.fn()}
        microphoneId={null}
        onSelectMicrophone={vi.fn()}
        speakerId={null}
        onSelectSpeaker={vi.fn()}
      />
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('lists the microphones and the speakers, with the one in use selected', async () => {
    renderSettings({ microphoneId: 'webcam', speakerId: 'monitor' });

    const mic = await screen.findByLabelText('Microphone');
    expect(mic).toHaveValue('webcam');
    expect(screen.getByLabelText('Speaker or headphones')).toHaveValue('monitor');
  });

  it('falls back to the system default for a device that is gone', async () => {
    renderSettings({ microphoneId: 'unplugged' });
    expect(await screen.findByLabelText('Microphone')).toHaveValue('default');
  });

  it('passes on a new microphone and a new speaker', async () => {
    const on = renderSettings();

    await userEvent.selectOptions(await screen.findByLabelText('Microphone'), 'webcam');
    await userEvent.selectOptions(screen.getByLabelText('Speaker or headphones'), 'monitor');

    expect(on.onSelectMicrophone).toHaveBeenCalledWith('webcam');
    expect(on.onSelectSpeaker).toHaveBeenCalledWith('monitor');
  });

  it('warns when the microphone and the speakers are different hardware', async () => {
    renderSettings({ microphoneId: 'webcam', speakerId: 'default' });
    expect(await screen.findByRole('note')).toHaveTextContent(/different devices/i);
  });

  it('does not warn when both are one headset', async () => {
    renderSettings();
    await screen.findByLabelText('Microphone');
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('says the output follows the system where the browser cannot choose it', async () => {
    vi.mocked(canChooseSpeaker).mockReturnValue(false);
    renderSettings();

    await screen.findByLabelText('Microphone');
    expect(screen.queryByLabelText('Speaker or headphones')).not.toBeInTheDocument();
    expect(screen.getByText(/main output/i)).toBeInTheDocument();
  });

  it('explains an empty list instead of showing an empty control', async () => {
    vi.mocked(listAudioDevices).mockResolvedValue({ microphones: [], speakers: [] });
    renderSettings();

    expect(await screen.findByText(/show up here/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Microphone')).not.toBeInTheDocument();
  });

  it('follows a headset being plugged in while it is open', async () => {
    let changed = () => undefined as void;
    vi.mocked(watchAudioDevices).mockImplementation((onChange) => {
      changed = onChange as () => void;
      return () => undefined;
    });
    vi.mocked(listAudioDevices).mockResolvedValueOnce({ microphones: [], speakers: [] });
    renderSettings();
    await screen.findByText(/show up here/i);

    await act(async () => changed());

    await waitFor(() => expect(screen.getByLabelText('Microphone')).toBeInTheDocument());
  });
});
