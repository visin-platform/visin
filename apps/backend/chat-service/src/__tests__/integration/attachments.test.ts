import '../helpers/mocks';
import { fetchWithTimeout } from '@visin/backend-core';
import { type Mock } from 'vitest';
import { Message } from '../../models/Message';
import { attachmentSummary } from '../../services/attachments';
import { base, create, request, setupChatTests } from '../helpers/testServer';

setupChatTests();

/** file-service, faked at the HTTP boundary: what it has stored, and what it was asked. */
const stored = new Map<string, number>();
const asked: { url: string; body?: Record<string, unknown> }[] = [];
const file = fetchWithTimeout as Mock;

beforeEach(() => {
  stored.clear();
  asked.length = 0;
  process.env.FILE_SERVICE_API_KEY = 'file-key';
  process.env.FILE_SERVICE_URL = 'http://files.example.test';
  file.mockImplementation(async (url: string, init?: { body?: string }) => {
    const body = init?.body ? JSON.parse(init.body) : undefined;
    asked.push({ url, body });
    if (url.endsWith('/internal/upload-url'))
      return new Response(JSON.stringify({ success: true, data: { uploadUrl: `http://files.example.test/files/upload/${body.fileId}?token=t` } }));
    if (url.includes('/internal/meta/')) {
      const id = url.split('/internal/meta/')[1];
      return stored.has(id) ? new Response(JSON.stringify({ data: { size: stored.get(id) } })) : new Response('{}', { status: 404 });
    }
    if (url.endsWith('/internal/download-urls'))
      return new Response(
        JSON.stringify({ data: { urls: Object.fromEntries(body.fileIds.map((id: string) => [id, `http://files.example.test/d/${id}`])), expiresMs: 1 } })
      );
    return new Response(JSON.stringify({ data: { _id: '111111111111111111111111', owner: { kind: 'user', id: 'alice' } } }));
  });
});
afterEach(() => {
  delete process.env.FILE_SERVICE_API_KEY;
  delete process.env.FILE_SERVICE_URL;
});

/** A direct message both people are in. */
async function dm() {
  const id = await create();
  await request(`/conversations/${id}/membership`, 'bob', { action: 'accept' });
  return id;
}
const ticket = (conversation: string, input: object, user = 'alice') => request<{ fileId: string; uploadUrl: string }>(`/conversations/${conversation}/attachments`, user, input);
/** Asks for an address and "uploads" there. */
async function upload(conversation: string, name = 'curve.png', mime = 'image/png', size = 2048) {
  const result = await ticket(conversation, { name, mime, size });
  expect(result.status).toBe(201);
  stored.set(result.body.data.fileId, size);
  return { fileId: result.body.data.fileId, name, mime };
}
const send = (conversation: string, input: object, user = 'alice', clientId = `files-${Math.random().toString(36).slice(2, 12)}`) =>
  request<{ _id: string; body: string; attachments?: { fileId: string; kind: string; size: number }[] }>(`/conversations/${conversation}/messages`, user, { clientId, ...input });

describe('whether files can be sent', () => {
  it('says so, and only where the server has somewhere to keep them', async () => {
    expect((await request<{ attachments: boolean }>('/capabilities')).body.data.attachments).toBe(true);
    delete process.env.FILE_SERVICE_API_KEY;
    expect((await request<{ attachments: boolean }>('/capabilities')).body.data.attachments).toBe(false);
    const id = await dm();
    expect((await ticket(id, { name: 'a.png', mime: 'image/png', size: 10 })).status).toBe(404);
  });
});

describe('an upload address', () => {
  it('is for this conversation’s own folder, sized to the file, and short-lived', async () => {
    const id = await dm();
    const result = await ticket(id, { name: 'curve.png', mime: 'image/png', size: 4096 });
    expect(result.status).toBe(201);
    expect(result.body.data.fileId).toMatch(new RegExp(`^chat/${id}/[0-9a-f-]{36}\\.png$`));
    expect(result.body.data.uploadUrl).toContain('/files/upload/');
    const minted = asked.find((call) => call.url.endsWith('/internal/upload-url'))!;
    expect(minted.body).toMatchObject({ fileId: result.body.data.fileId, mimetype: 'image/png', maxBytes: 4096, expiresInMinutes: 15 });
  });

  it.each([
    ['a type file-service does not keep', { name: 'notes.exe', mime: 'application/octet-stream', size: 10 }],
    ['a name and a type that disagree', { name: 'curve.png', mime: 'application/pdf', size: 10 }],
    ['a model checkpoint', { name: 'model.pth', mime: 'application/octet-stream', size: 10 }],
    ['a file over the limit', { name: 'big.png', mime: 'image/png', size: 26 * 1024 ** 2 }],
    ['a name with a path in it', { name: '../../etc/passwd.png', mime: 'image/png', size: 10 }],
    ['an empty file', { name: 'a.png', mime: 'image/png', size: 0 }]
  ])('is refused for %s', async (_case, input) => {
    const id = await dm();
    expect((await ticket(id, input)).status).toBe(400);
    expect(asked.some((call) => call.url.endsWith('/internal/upload-url'))).toBe(false);
  });

  it('is given in the analyst’s thread, which looks at pictures, and refused to someone outside the conversation', async () => {
    const analyst = await create('assistant', []);
    expect((await ticket(analyst, { name: 'a.png', mime: 'image/png', size: 10 })).status).toBe(201);
    const id = await dm();
    expect((await ticket(id, { name: 'a.png', mime: 'image/png', size: 10 }, 'mallory')).status).toBe(404);
  });

  it('takes the kinds of files people share about a run', async () => {
    const id = await dm();
    for (const [name, mime] of [['frame.jpg', 'image/jpeg'], ['clip.mp4', 'video/mp4'], ['report.pdf', 'application/pdf'], ['logs.zip', 'application/zip'], ['anim.gif', 'image/gif']])
      expect((await ticket(id, { name, mime, size: 100 })).status).toBe(201);
  });
});

describe('a message with files', () => {
  it('is stored with each file described from what was stored, and needs no text', async () => {
    const id = await dm();
    const picture = await upload(id, 'curve.png', 'image/png', 2048);
    const pdf = await upload(id, 'report.pdf', 'application/pdf', 9000);
    stored.set(pdf.fileId, 8123); // what file-service holds wins over what the browser said
    const result = await send(id, { body: '', attachments: [picture, pdf] });
    expect(result.status).toBe(201);
    expect(result.body.data.body).toBe('');
    expect(result.body.data.attachments).toEqual([
      { ...picture, size: 2048, kind: 'image' },
      { ...pdf, size: 8123, kind: 'file' }
    ]);
  });

  it('needs text or a file', async () => {
    const id = await dm();
    expect((await send(id, { body: '   ' })).status).toBe(400);
    expect((await send(id, { body: 'Just text' })).status).toBe(201);
  });

  it('cannot name a file that has not finished uploading', async () => {
    const id = await dm();
    const result = await ticket(id, { name: 'a.png', mime: 'image/png', size: 10 });
    const sent = await send(id, { body: 'see', attachments: [{ fileId: result.body.data.fileId, name: 'a.png', mime: 'image/png' }] });
    expect(sent.status).toBe(409);
    expect(sent.body.message).toContain('has not finished uploading');
  });

  it('cannot name another conversation’s file, or reach outside its folder', async () => {
    const mine = await dm();
    const other = await create('room', ['bob']);
    const theirs = await upload(other);
    expect((await send(mine, { body: 'x', attachments: [theirs] })).status).toBe(403);
    const sneaky = { fileId: `chat/${mine}/../${other}/x.png`, name: 'x.png', mime: 'image/png' };
    stored.set(sneaky.fileId, 10);
    expect((await send(mine, { body: 'x', attachments: [sneaky] })).status).toBe(403);
  });

  it('cannot put a file in two messages, even at the same moment', async () => {
    const id = await dm();
    const picture = await upload(id);
    expect((await send(id, { body: 'first', attachments: [picture] })).status).toBe(201);
    expect((await send(id, { body: 'again', attachments: [picture] })).status).toBe(409);
    const another = await upload(id, 'b.png');
    const both = await Promise.all([send(id, { body: '1', attachments: [another] }), send(id, { body: '2', attachments: [another] })]);
    expect(both.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await Message.countDocuments({ 'attachments.fileId': another.fileId })).toBe(1);
  });

  it('is bounded: five files at most, each named once', async () => {
    const id = await dm();
    const six = await Promise.all(Array.from({ length: 6 }, (_, i) => upload(id, `f${i}.png`)));
    expect((await send(id, { body: 'x', attachments: six })).status).toBe(400);
    expect((await send(id, { body: 'x', attachments: [six[0], six[0]] })).status).toBe(400);
  });

  it('is retried as the same message, not refused as a reused file', async () => {
    const id = await dm();
    const picture = await upload(id);
    const first = await send(id, { body: 'x', attachments: [picture] }, 'alice', 'retry-files-1');
    const again = await send(id, { body: 'x', attachments: [picture] }, 'alice', 'retry-files-1');
    expect(again.status).toBe(200);
    expect(again.body.data._id).toBe(first.body.data._id);
  });

  it('is described in the conversation list by what it carries', async () => {
    const id = await dm();
    await send(id, { body: '', attachments: [await upload(id)] });
    const list = await request<{ _id: string; latestMessage?: { body: string } }[]>('/conversations', 'bob');
    expect(list.body.data.find((c) => c._id === id)?.latestMessage?.body).toBe('Sent a photo');
  });
});

describe('reading files', () => {
  it('signs addresses for files of messages this person can see, and leaves the rest out', async () => {
    const id = await dm();
    const picture = await upload(id);
    await send(id, { body: '', attachments: [picture] });
    const unsent = await upload(id, 'unsent.png');
    const result = await request<{ urls: Record<string, string> }>(`/conversations/${id}/attachment-urls`, 'bob', {
      fileIds: [picture.fileId, unsent.fileId, 'chat/elsewhere/x.png']
    });
    expect(result.status).toBe(200);
    expect(Object.keys(result.body.data.urls)).toEqual([picture.fileId]);
    expect((await request(`/conversations/${id}/attachment-urls`, 'mallory', { fileIds: [picture.fileId] })).status).toBe(404);
  });

  it('does not show someone who joined a room the files shared before they did', async () => {
    const room = await create('room', ['bob']);
    await request(`/conversations/${room}/membership`, 'bob', { action: 'accept' });
    const early = await upload(room, 'early.png');
    await send(room, { body: 'before carol', attachments: [early] });
    await request(`/conversations/${room}/participants`, 'alice', { handle: 'carol' });
    await request(`/conversations/${room}/membership`, 'carol', { action: 'accept' });
    const result = await request<{ urls: Record<string, string> }>(`/conversations/${room}/attachment-urls`, 'carol', { fileIds: [early.fileId] });
    expect(result.body.data.urls).toEqual({});
    expect((await request<{ urls: Record<string, string> }>(`/conversations/${room}/attachment-urls`, 'bob', { fileIds: [early.fileId] })).body.data.urls).toHaveProperty(early.fileId);
  });

  it('is a gateway error, not a crash, when file-service fails, and asks for at most fifty at once', async () => {
    const id = await dm();
    const picture = await upload(id);
    await send(id, { body: '', attachments: [picture] });
    file.mockImplementation(async (url: string) => (url.endsWith('/internal/download-urls') ? new Response('no', { status: 500 }) : new Response('{}', { status: 404 })));
    expect((await request(`/conversations/${id}/attachment-urls`, 'bob', { fileIds: [picture.fileId] })).status).toBe(502);
    expect((await request(`/conversations/${id}/attachment-urls`, 'bob', { fileIds: Array.from({ length: 51 }, (_, i) => `x${i}`) })).status).toBe(400);
    void base;
  });
});

describe('attachmentSummary', () => {
  it('says what a message of files carries', () => {
    expect(attachmentSummary([{ kind: 'image' }])).toBe('Sent a photo');
    expect(attachmentSummary([{ kind: 'video' }])).toBe('Sent a video');
    expect(attachmentSummary([{ kind: 'file' }])).toBe('Sent a file');
    expect(attachmentSummary([{ kind: 'image' }, { kind: 'file' }])).toBe('Sent 2 files');
    expect(attachmentSummary([])).toBe('');
    expect(attachmentSummary(undefined)).toBe('');
  });
});
