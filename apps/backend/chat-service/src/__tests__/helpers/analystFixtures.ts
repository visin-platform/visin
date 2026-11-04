import './mocks';
import { encryptSecret, fetchWithTimeout } from '@visin/backend-core';
import mongoose from 'mongoose';
import { vi, type Mock } from 'vitest';
import { Pricing } from '../../models/Pricing';
import { ProviderKey } from '../../models/ProviderKey';
import { Settings } from '../../models/Settings';
import { resetAssistantSettingsCache } from '../../services/settings';
import { base } from './testServer';

export async function saveKey(provider: 'anthropic' | 'openai', key: string) {
  await ProviderKey.updateOne(
    { owner: 'deployment', provider },
    { $set: { ...encryptSecret(key), hint: key.slice(-4) } },
    { upsert: true }
  );
  resetAssistantSettingsCache();
}

export const saveKeys = async () => {
  await saveKey('anthropic', 'anthropic-key');
  await saveKey('openai', 'openai-key');
};

export async function enableAnalyst(model = 'test', provider: 'anthropic' | 'openai' = 'anthropic') {
  await saveKeys();
  await Settings.updateOne({ _id: 'assistant' }, { $set: { enabled: true, provider, model } }, { upsert: true });
  resetAssistantSettingsCache();
}

export const project = { _id: '111111111111111111111111', name: 'Lab', owner: { kind: 'user', id: 'alice' } };

export const vision = (post: () => Response) =>
  (fetchWithTimeout as Mock).mockImplementation(async function (_url: string, init?: { method?: string }) {
    return init?.method === 'POST' ? post() : new Response(JSON.stringify({ data: project }));
  });

export const ADMIN = '444444444444444444444444';

export const makeAdmin = (id = ADMIN) =>
  mongoose.connection.collection('users').insertOne({ _id: new mongoose.Types.ObjectId(id), roles: ['admin'] });

export const provider = (lists: { anthropic?: string[]; openai?: { id: string; created: number }[] }) =>
  (fetchWithTimeout as Mock).mockImplementation(async function (url: string) {
    if (String(url).startsWith('https://api.anthropic.com/v1/models') && lists.anthropic)
      return new Response(
        JSON.stringify({ data: lists.anthropic.map((id) => ({ id, display_name: id.toUpperCase() })) })
      );
    if (String(url).startsWith('https://api.openai.com/v1/models') && lists.openai)
      return new Response(JSON.stringify({ data: lists.openai }));
    return new Response('down', { status: 503 });
  });

export const restoreFetch = async () =>
  (fetchWithTimeout as Mock).mockImplementation(
    (await vi.importActual<typeof import('@visin/backend-core')>('@visin/backend-core')).fetchWithTimeout
  );

export const putSettings = (user: string, body: unknown) =>
  fetch(`${base}/api/chat/settings/assistant`, {
    method: 'PUT',
    headers: { 'x-test-user': user, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });

export const getPricingForTest = async () => (await Pricing.findById('pricing').lean()) as { entries: object[] };
