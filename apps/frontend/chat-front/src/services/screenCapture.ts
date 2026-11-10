/**
 * Showing the person's screen on a call. The browser's own picker asks which tab, window or whole screen, and nothing
 * here can answer for them.
 *
 * Phones' browsers do not offer any of this, which is why the button is only shown where `canCaptureScreen` says so.
 * (They can still watch a screen someone else shows.)
 */

export const canCaptureScreen = (): boolean =>
  typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getDisplayMedia === 'function';

/** The person closing the picker is an answer, not a failure. */
export const declined = (error: unknown): boolean =>
  error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'AbortError');

/** The browser's own picker: which tab, window or screen. */
export const askWhich = (video: boolean | MediaTrackConstraints = true): Promise<MediaStream> =>
  navigator.mediaDevices.getDisplayMedia({
    video,
    audio: false,
    // Chrome leaves the current tab out of the picker unless told otherwise; Visin itself is a fair thing to show.
    selfBrowserSurface: 'include'
  } as DisplayMediaStreamOptions);
