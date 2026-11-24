import { fetchWithTimeout } from '@visin/backend-core';
import { vi } from 'vitest';
import { ADAPTERS, imageContent } from '../../services/providers';
import { MAX_IMAGE_INPUT_BYTES } from '../../services/imageInput';
vi.mock('@visin/backend-core', async () => ({
  ...(await vi.importActual<typeof import('@visin/backend-core')>('@visin/backend-core')),
  fetchWithTimeout: vi.fn()
}));
const fetchPeer = vi.mocked(fetchWithTimeout);
const base = { apiKey: 'key', model: 'configured', system: 's', tools: [], signal: new AbortController().signal };
const response = (provider: string) =>
  new Response(
    JSON.stringify(
      provider === 'anthropic'
        ? {
            content: [{ type: 'text', text: 'A red square.' }],
            stop_reason: 'end_turn',
            usage: { input_tokens: 100, output_tokens: 10 }
          }
        : {
            choices: [{ message: { content: 'A red square.' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 100, completion_tokens: 10 }
          }
    )
  );
beforeEach(() => {
  fetchPeer.mockReset();
});
it.each(['openai', 'anthropic'] as const)(
  'preserves %s image bytes separately from the text ceiling',
  async (provider) => {
    const data = Buffer.alloc(60_000, 1).toString('base64');
    fetchPeer.mockResolvedValueOnce(response(provider));
    expect(
      (
        await ADAPTERS[provider].send({
          ...base,
          messages: [
            {
              role: 'user',
              content: imageContent(provider, 'Describe it.', [{ name: 'photo.png', mime: 'image/png', data }])
            }
          ]
        })
      ).text
    ).toBe('A red square.');
    const body = JSON.parse(String(fetchPeer.mock.calls[0][1]?.body));
    const image = body.messages.at(-1).content.at(-1);
    if (provider === 'anthropic') expect(image.source).toEqual({ type: 'base64', media_type: 'image/png', data });
    else expect(image.image_url).toEqual({ url: `data:image/png;base64,${data}`, detail: 'low' });
  }
);
it.each(['openai', 'anthropic'] as const)(
  'rejects too many and oversized images before calling %s',
  async (provider) => {
    const send = (images: { name: string; mime: string; data: string }[]) =>
      ADAPTERS[provider].send({
        ...base,
        messages: [{ role: 'user', content: imageContent(provider, 'Describe.', images) }]
      });
    await expect(send(Array(6).fill({ name: 'photo', mime: 'image/jpeg', data: 'YQ==' }))).rejects.toThrow('five');
    await expect(
      send([{ name: 'large', mime: 'image/jpeg', data: Buffer.alloc(MAX_IMAGE_INPUT_BYTES + 1).toString('base64') }])
    ).rejects.toThrow('too large');
    await expect(send([{ name: 'broken', mime: 'image/jpeg', data: '%not-base64%' }])).rejects.toThrow(
      'could not be read'
    );
    expect(fetchPeer).not.toHaveBeenCalled();
  }
);
it.each(['openai', 'anthropic'] as const)(
  'reports a model image-input refusal from %s without silently retrying as text',
  async (provider) => {
    fetchPeer.mockResolvedValueOnce(new Response('', { status: 400 }));
    await expect(
      ADAPTERS[provider].send({
        ...base,
        messages: [
          {
            role: 'user',
            content: imageContent(provider, 'Describe.', [{ name: 'photo', mime: 'image/jpeg', data: 'YQ==' }])
          }
        ]
      })
    ).rejects.toThrow('model with image input');
    expect(fetchPeer).toHaveBeenCalledTimes(1);
  }
);
