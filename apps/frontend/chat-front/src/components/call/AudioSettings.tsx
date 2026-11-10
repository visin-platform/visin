import { useEffect, useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import {
  canChooseSpeaker,
  devicesDisagree,
  listAudioDevices,
  preferredMicrophone,
  watchAudioDevices,
  type AudioDevice,
  type AudioDevices
} from '../../services/audioDevices';

export interface AudioSettingsProps {
  open: boolean;
  onClose: () => void;
  /** The microphone the call is on now, as the browser names it. Null until one is open. */
  microphoneId: string | null;
  onSelectMicrophone: (deviceId: string | null) => void;
  speakerId: string | null;
  onSelectSpeaker: (deviceId: string | null) => void;
}

const EMPTY: AudioDevices = { microphones: [], speakers: [] };

/** The id to show as chosen: the wanted one if it is still plugged in, else the system default. */
function shown(devices: AudioDevice[], wanted: string | null): string {
  return (
    devices.find((device) => device.id === wanted)?.id ?? devices.find((device) => device.id === 'default')?.id ?? devices[0]?.id ?? ''
  );
}

/**
 * Which microphone and speakers this call uses.
 *
 * Opened from the call screen, so a wrong device is fixed in the middle of the
 * call that has it. The list follows the hardware: a headset plugged in while
 * this is open turns up in it.
 */
export function AudioSettings({
  open,
  onClose,
  microphoneId,
  onSelectMicrophone,
  speakerId,
  onSelectSpeaker
}: AudioSettingsProps) {
  const [devices, setDevices] = useState<AudioDevices>(EMPTY);

  useEffect(() => {
    if (!open) return;
    let live = true;
    const load = () =>
      void listAudioDevices().then((found) => {
        if (live) setDevices(found);
      });
    load();
    const stop = watchAudioDevices(load);
    return () => {
      live = false;
      stop();
    };
  }, [open]);

  const microphone = shown(devices.microphones, microphoneId ?? preferredMicrophone());
  const speaker = shown(devices.speakers, speakerId);
  const disagree = devicesDisagree(devices, microphone || null, speaker || null);
  const chooseSpeaker = canChooseSpeaker();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      aria-labelledby="call-audio-title"
      // Above the call screen, which sits over MUI's dialogs on purpose.
      sx={{ zIndex: 1700 }}
    >
      <DialogTitle id="call-audio-title">Call audio</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {devices.microphones.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Your microphones show up here once the call has access to one.
          </Typography>
        ) : (
          <TextField
            select
            label="Microphone"
            value={microphone}
            onChange={(event) => onSelectMicrophone(event.target.value || null)}
            slotProps={{ select: { native: true } }}
            fullWidth
          >
            {devices.microphones.map((device) => (
              <option key={device.id} value={device.id}>
                {device.label}
              </option>
            ))}
          </TextField>
        )}

        {chooseSpeaker ? (
          devices.speakers.length > 0 && (
            <TextField
              select
              label="Speaker or headphones"
              value={speaker}
              onChange={(event) => onSelectSpeaker(event.target.value || null)}
              slotProps={{ select: { native: true } }}
              fullWidth
            >
              {devices.speakers.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.label}
                </option>
              ))}
            </TextField>
          )
        ) : (
          <Typography variant="body2" color="text.secondary">
            This browser plays calls through your device&apos;s main output. Change it in your sound settings.
          </Typography>
        )}

        {disagree && (
          <Typography variant="body2" role="note" sx={{ color: 'warning.main' }}>
            Your microphone and speakers are different devices. If the other person hears an echo, use one headset for
            both.
          </Typography>
        )}

        <Typography variant="caption" color="text.secondary">
          Hearing an echo of yourself? The other person&apos;s microphone is picking up their speakers. Headphones
          fix it.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Done</Button>
      </DialogActions>
    </Dialog>
  );
}

export default AudioSettings;
