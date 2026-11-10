import { expect, test } from '@playwright/test';

for (const kind of ['direct', 'assistant', 'group'] as const) {
  test(`attaches a photo in a ${kind} chat and records voice in human chat`, async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: async () => ({ getTracks: () => [{ stop() {}, addEventListener() {} }] })
        }
      });
      class Recorder {
        static isTypeSupported(type: string) {
          return type === 'audio/mp4';
        }
        state = 'inactive';
        ondataavailable?: (event: { data: Blob }) => void;
        onstop?: () => void;
        start() {
          this.state = 'recording';
        }
        stop() {
          this.state = 'inactive';
          this.ondataavailable?.({ data: new Blob(['xxxxftypvoice'], { type: 'audio/mp4' }) });
          queueMicrotask(() => this.onstop?.());
        }
      }
      Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: Recorder });
    });
    const id = '111111111111111111111111';
    const conversation = {
      _id: id,
      kind,
      ...(kind === 'group' ? { groupId: 'lab' } : {}),
      title: 'Media chat',
      trainingIds: [],
      seq: 0,
      participants: [
        { userId: 'alice', name: 'Alice', state: 'active', role: 'owner', readSeq: 0 },
        { userId: 'bob', name: 'Bob', state: 'active', role: 'member', readSeq: 0 }
      ]
    };
    const messages: Record<string, unknown>[] = [];
    const uploaded: string[] = [];
    await page.route('**/mock-upload/**', async (route) => {
      uploaded.push(route.request().url());
      await route.fulfill({ status: 200, json: { complete: true } });
    });
    await page.route(/^http:\/\/localhost:(5001|5012)\//, async (route) => {
      const req = route.request();
      const path = new URL(req.url()).pathname;
      const headers = {
        'access-control-allow-origin': 'http://localhost:3014',
        'access-control-allow-credentials': 'true',
        'access-control-allow-headers': 'content-type, authorization, x-request-id',
        'access-control-allow-methods': 'GET, POST, OPTIONS'
      };
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      if (path.endsWith('/auth/verify'))
        return route.fulfill({
          headers,
          json: {
            success: true,
            authenticated: true,
            user: { id: 'alice', name: 'Alice', email: 'alice@example.test' }
          }
        });
      if (path.endsWith('/events')) return route.abort();
      let data: unknown = [];
      if (path.endsWith('/capabilities')) data = { assistant: true, attachments: true };
      else if (path.endsWith('/conversations')) data = [conversation];
      else if (path.endsWith('/attachments')) {
        const input = req.postDataJSON();
        data = { fileId: `chat/${id}/${input.name}`, uploadUrl: `http://localhost:3014/mock-upload/${input.name}` };
      } else if (path.endsWith('/attachment-urls')) {
        data = {
          urls: Object.fromEntries(
            req
              .postDataJSON()
              .fileIds.map((fileId: string) => [
                fileId,
                fileId.endsWith('.png')
                  ? 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
                  : 'data:audio/mp4;base64,eHh4eGZ0eXA='
              ])
          ),
          expiresMs: Date.now() + 3600000
        };
      } else if (path.endsWith('/messages')) {
        if (req.method() === 'POST') {
          const input = req.postDataJSON();
          messages.push({
            ...input,
            _id: `message${messages.length}`,
            conversationId: id,
            senderId: 'alice',
            senderName: 'Alice',
            kind: 'person',
            seq: messages.length + 1,
            createdAt: new Date().toISOString(),
            evidence: [],
            attachments: input.attachments?.map((file: { mime: string }) => ({
              ...file,
              size: 20,
              kind: file.mime.startsWith('audio/') ? 'audio' : 'image'
            }))
          });
          data = messages.at(-1);
          if (kind === 'assistant')
            messages.push({
              _id: `answer${messages.length}`,
              conversationId: id,
              kind: 'assistant',
              senderName: 'Vivi',
              senderId: 'assistant:vivi',
              body: 'I see the image you uploaded.',
              seq: messages.length + 1,
              createdAt: new Date().toISOString(),
              evidence: []
            });
        } else data = messages;
      }
      return route.fulfill({ headers, json: { success: true, data } });
    });
    await page.goto('/chat');
    await page.getByText('Media chat', { exact: true }).click();
    await expect(page.getByRole('button', { name: 'Attach files' })).toBeVisible();
    await page
      .getByLabel('Choose attachments')
      .setInputFiles({ name: 'result.png', mimeType: 'image/png', buffer: Buffer.from('photo') });
    await expect(page.getByRole('button', { name: 'Send message' })).toBeEnabled();
    await page.getByRole('button', { name: 'Send message' }).click();
    await page.getByRole('button', { name: 'View result.png' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Close image' }).click();
    if (kind === 'assistant') {
      expect(uploaded).toHaveLength(1);
      expect(messages).toHaveLength(2);
      await expect(page.getByText('I see the image you uploaded.', { exact: true })).toBeVisible();
      await page.screenshot({ path: `/tmp/visin-assistant-attachments-${test.info().project.name}.png` });
      return;
    }
    const header = page.getByRole('group', { name: 'Conversation header' });
    await expect(header.getByRole('button', { name: 'Call Media chat', exact: true })).toBeVisible();
    await expect(header.getByRole('button', { name: 'Video call Media chat', exact: true })).toBeVisible();
    await header.getByRole('button', { name: 'Record voice message' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Recording' })).toBeVisible();
    // A tap shorter than 500 ms is deliberately discarded by the recorder.
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: 'Finish', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Send message' })).toBeEnabled();
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByLabel('Voice message: voice.m4a')).toBeVisible();
    expect(uploaded).toHaveLength(2);
    expect(messages).toHaveLength(2);
    await page.screenshot({ path: `/tmp/visin-media-${test.info().project.name}.png` });
  });
}
