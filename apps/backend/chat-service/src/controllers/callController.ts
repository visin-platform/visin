import { NotFoundError } from '@visin/backend-core';
import type { Request, Response } from 'express';
import * as calls from '../services/callService';
import { iceConfig, iceMode } from '../services/iceService';
import { paramId } from '../utils/request';
import { callDeviceSchema, callSignalSchema } from '../validation/callSchemas';
import { parsed } from '../validation/parse';

/** Every call route but the settings answer says 404 where calls are turned off, as if they did not exist. */
export function requireCallsEnabled(_req: Request, _res: Response, next: (error?: unknown) => void): void {
  next(calls.callsEnabled() ? undefined : new NotFoundError('Calls are turned off'));
}

/**
 * GET /calls/config: whether calls are on and how far they reach on this server, for hiding the call buttons and for
 * telling the person why a call may not connect. `relay` false means some networks will not connect.
 */
export function config(_req: Request, res: Response): void {
  const mode = iceMode();
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, data: { enabled: calls.callsEnabled(), mode, relay: mode === 'cloudflare' || mode === 'turn' } });
}

/** GET /calls/ice-servers: fresh credentials every time, so never cached. */
export async function iceServers(_req: Request, res: Response): Promise<void> {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, data: await iceConfig() });
}

export async function current(req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await calls.currentCall(req) });
}

export async function start(req: Request, res: Response): Promise<void> {
  const { deviceId } = parsed(callDeviceSchema, req.body);
  res.status(201).json({ success: true, data: await calls.startCall(req, paramId(req), deviceId) });
}

const callId = (req: Request) => String(req.params.callId);

export async function accept(req: Request, res: Response): Promise<void> {
  const { deviceId } = parsed(callDeviceSchema, req.body);
  res.json({ success: true, data: await calls.acceptCall(req, callId(req), deviceId) });
}

export async function decline(req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await calls.declineCall(req, callId(req)) });
}

export async function end(req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await calls.endCall(req, callId(req)) });
}

export async function signal(req: Request, res: Response): Promise<void> {
  const { deviceId, data } = parsed(callSignalSchema, req.body);
  await calls.relaySignal(req, callId(req), deviceId, data);
  res.status(204).send();
}
