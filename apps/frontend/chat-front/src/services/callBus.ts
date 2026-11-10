import type { CallPerson } from '../types/call';

/**
 * How a thread's call button reaches the call engine.
 *
 * The engine lives in the host the shell mounts once for the whole app, so a call survives moving between pages. The
 * thread is rendered by a different federated module, so the two share no React tree to put a context in. A window
 * event crosses that boundary and needs nothing shared.
 */
const CALL_REQUEST = 'visin:call';
/** Sent by the host once it is listening, so a thread knows there is something to answer a call button. */
const CALLS_READY = 'visin:calls-ready';

declare global {
  interface Window {
    /** Set while the host that places calls is mounted and calls are on for this server. */
    __visinCalls?: boolean;
  }
}

export interface CallRequest {
  conversationId: string;
  /** Who is being called, so the screen can show them before the server answers. */
  peer?: CallPerson;
  /** A video call: the caller's camera comes on once the call connects. */
  camera?: boolean;
}

export function requestCall(request: CallRequest): void {
  window.dispatchEvent(new CustomEvent<CallRequest>(CALL_REQUEST, { detail: request }));
}

export function onCallRequest(handler: (request: CallRequest) => void): () => void {
  const listener = (event: Event) => handler((event as CustomEvent<CallRequest>).detail);
  window.addEventListener(CALL_REQUEST, listener);
  return () => window.removeEventListener(CALL_REQUEST, listener);
}

/** Marks calls as available (or not), and tells any thread that is already showing. */
export function setCallsReady(ready: boolean): void {
  window.__visinCalls = ready;
  window.dispatchEvent(new Event(CALLS_READY));
}

export const callsReady = (): boolean => window.__visinCalls === true;

/** Calls `onChange` when the host appears or goes. Returns how to stop. */
export function watchCallsReady(onChange: () => void): () => void {
  window.addEventListener(CALLS_READY, onChange);
  return () => window.removeEventListener(CALLS_READY, onChange);
}

/** Whether this browser can open a camera, which is what a video call and the call's camera button need. */
export const canUseCamera = (): boolean =>
  typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function';
