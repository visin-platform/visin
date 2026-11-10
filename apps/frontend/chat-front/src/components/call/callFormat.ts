import type { CallState } from '../../services/callEngine';

/** "3:07", or "1:02:07" past the hour. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
}

/** What the line under the name says. */
export function statusText(state: CallState, elapsed: string | null): string {
  switch (state.phase) {
    case 'outgoing':
      return state.call ? 'Ringing…' : 'Calling…';
    case 'incoming':
      return 'Calling you';
    case 'connecting':
      return 'Connecting…';
    case 'active':
      if (state.reconnecting) return 'Reconnecting…';
      return [elapsed ?? '0:00', state.sharingScreen ? 'Sharing your screen' : state.remoteSharing ? 'Sharing their screen' : null]
        .filter(Boolean)
        .join(' · ');
    case 'ended':
      return state.message ?? 'Call ended';
    default:
      return '';
  }
}

interface Size {
  width: number;
  height: number;
}

/**
 * How a camera fills the whole call screen: edge to edge, as a phone call shows it, except an
 * upright picture on a wide screen. Cropping a wide picture to an upright phone takes off the sides
 * and keeps the face; cropping an upright one to a wide laptop screen takes off the top of the head
 * and the chin, so that one is shown whole. A picture whose size is not known yet fills.
 */
export function cameraFit(picture: Size, box: Size): 'cover' | 'contain' {
  if (!picture.width || !picture.height || !box.width || !box.height) return 'cover';
  return picture.height > picture.width && box.width > box.height ? 'contain' : 'cover';
}

