import { expect, test } from '@playwright/test';
test.use({ timezoneId: 'Europe/Tallinn', locale: 'en-US' });
test('human chat works without a provider and stays usable on mobile', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.emulateMedia({ colorScheme: test.info().project.name === 'desktop' ? 'dark' : 'light' });
  const messages: Record<string, unknown>[] = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const conversation = {
    _id: '111111111111111111111111',
    kind: 'direct',
    title: 'Experiment discussion',
    trainingIds: [],
    seq: 0,
    participants: [
      { userId: 'alice', name: 'Alice', state: 'active', role: 'owner', readSeq: 0 },
      { userId: 'bob', name: 'Bob', state: 'active', role: 'member', readSeq: 0 }
    ]
  };
  await page.route(/^http:\/\/localhost:(5001|5012)\//, async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    const headers = {
      'access-control-allow-origin': req.headers().origin || 'http://localhost:3014',
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'content-type, authorization, x-request-id',
      'access-control-allow-methods': 'GET, POST, OPTIONS'
    };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (url.pathname.endsWith('/auth/verify'))
      return route.fulfill({
        headers,
        json: { success: true, authenticated: true, user: { id: 'alice', name: 'Alice', email: 'alice@test.invalid' } }
      });
    if (url.pathname.endsWith('/events')) return route.abort();
    let data: unknown = [];
    if (url.pathname.endsWith('/capabilities')) data = { assistant: false };
    else if (url.pathname.endsWith('/conversations')) data = [conversation];
    else if (/\/messages\/[^/]+\/(reaction|unsend)$/.test(url.pathname)) {
      const messageId = url.pathname.split('/').at(-2);
      const target = messages.find((message) => message._id === messageId)!;
      target.revision = Number(target.revision || 0) + 1;
      if (url.pathname.endsWith('/reaction')) {
        const emoji = req.postDataJSON().emoji;
        target.reactions = emoji ? [{ userId: 'alice', emoji }] : [];
      } else {
        target.body = '';
        target.unsentAt = new Date().toISOString();
        target.reactions = [];
        for (const message of messages) {
          const quote = message.quote as { messageId: string; body: string; unsent?: boolean } | undefined;
          if (quote && quote.messageId === messageId) {
            quote.body = 'Message unsent';
            quote.unsent = true;
            message.revision = Number(message.revision || 0) + 1;
          }
        }
      }
      data = target;
    } else if (url.pathname.endsWith('/messages')) {
      if (req.method() === 'POST') {
        const input = req.postDataJSON();
        const source = messages.find((message) => message._id === input.replyTo);
        messages.push({
          _id: `message${messages.length + 1}`,
          kind: 'person',
          senderName: 'Alice',
          senderId: 'alice',
          body: input.body,
          replyTo: input.replyTo,
          ...(source
            ? { quote: { messageId: source._id, senderName: source.senderName, body: source.body, kind: source.kind } }
            : {}),
          seq: messages.length + 1,
          createdAt: new Date().toISOString(),
          evidence: []
        });
        data = messages.at(-1);
      } else
        data = messages.filter(
          (message) => !url.searchParams.has('before') || Number(message.seq) < Number(url.searchParams.get('before'))
        );
    }
    return route.fulfill({ headers, json: { success: true, data } });
  });
  await page.goto('/chat');
  await page.getByText('Experiment discussion', { exact: true }).click();
  await expect(page.getByLabel('Message', { exact: true })).toBeVisible();
  const field = page.getByLabel('Message', { exact: true }).locator('..');
  await expect(field.getByRole('button', { name: 'Choose emoji' })).toBeVisible();
  await page.getByRole('button', { name: 'Conversation settings' }).click();
  await page.getByRole('menuitem', { name: 'Appearance', exact: true }).click();
  const appearance = page.getByRole('dialog', { name: 'Chat appearance' });
  await appearance.getByRole('radio', { name: 'Forest' }).click();
  const selectedBubbleColor = await appearance
    .getByText('Show me something interesting.', { exact: true })
    .locator('..')
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  await expect(appearance.getByRole('button', { name: 'Done' })).toHaveCSS('background-color', selectedBubbleColor);
  await expect(appearance.getByRole('switch')).toHaveCount(0);
  await appearance.screenshot({
    path: `/tmp/visin-appearance-${test.info().project.name}.png`,
    animations: 'disabled'
  });
  await appearance.getByRole('button', { name: 'Done' }).click();
  await page.reload();
  await expect(page.getByLabel('Message', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Conversation settings' }).click();
  await page.getByRole('menuitem', { name: 'Appearance', exact: true }).click();
  await expect(appearance.getByRole('radio', { name: 'Forest' })).toHaveAttribute('aria-checked', 'true');
  await expect(appearance.getByRole('switch')).toHaveCount(0);
  await appearance.getByRole('button', { name: 'Done' }).click();
  const workspaceStyle = await page.getByRole('region', { name: 'Chat workspace' }).evaluate((element) => ({
    blur: getComputedStyle(element).getPropertyValue('--chat-blur').trim(),
    gap: getComputedStyle(element).getPropertyValue('--chat-message-gap').trim()
  }));
  expect(workspaceStyle).toEqual({ blur: 'blur(18px) saturate(140%)', gap: '10px' });
  await page.getByRole('button', { name: 'Conversation settings' }).click();
  await page.getByRole('menuitem', { name: 'People', exact: true }).click();
  const people = page.getByRole('dialog', { name: 'People', exact: true });
  await expect(people.getByRole('list', { name: 'Conversation members' })).toBeVisible();
  await expect(people.getByText('You', { exact: true })).toBeVisible();
  await expect(people.getByText('Owner', { exact: true })).toBeVisible();
  await expect(people.getByRole('button', { name: 'Block', exact: true })).toBeVisible();
  await people.screenshot({ path: `/tmp/visin-people-${test.info().project.name}.png`, animations: 'disabled' });
  await people.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByLabel('Message', { exact: true }).fill('Can we compare validation peaks?');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('Can we compare validation peaks?', { exact: true })).toBeVisible();
  await expect(page.locator('time').first()).toHaveText(/^\d{2}:\d{2}$/);
  await page.screenshot({ path: `/tmp/visin-input-regional-${test.info().project.name}.png` });
  const original = page.locator('[data-message-id="message1"]');
  if (test.info().project.name === 'desktop') {
    await page.mouse.move(0, 0);
    await expect(original.locator('.message-actions')).toHaveCSS('opacity', '0');
    await original.hover();
  }
  await expect(original.locator('.message-actions')).toHaveCSS('opacity', '1');
  await original.getByRole('button', { name: 'Copy', exact: true }).click();
  await expect(page.getByText('Message copied', { exact: true })).toBeVisible();
  await original.getByRole('button', { name: 'React to message' }).click();
  await page.getByRole('button', { name: 'React ❤️' }).click();
  await expect(original.getByRole('button', { name: '❤️: 1 reaction, including yours' })).toBeVisible();
  await original.getByRole('button', { name: 'Reply to Alice' }).click();
  await expect(page.getByText('Replying to Alice')).toBeVisible();
  await page.getByLabel('Message', { exact: true }).fill('Here is a quoted reply');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect.poll(() => messages.at(-1)?.replyTo).toBe('message1');
  await expect(page.locator('blockquote')).toContainText('Can we compare validation peaks?');
  await expect(page.getByRole('button', { name: 'Cancel reply' })).toHaveCount(0);
  await original.hover();
  await original.getByRole('button', { name: 'Message actions' }).click();
  await page.getByRole('menuitem', { name: 'Unsend', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Unsend message?' })
    .getByRole('button', { name: 'Unsend', exact: true })
    .click();
  await expect(original.getByText('Message unsent')).toBeVisible();
  await expect(page.locator('blockquote')).toContainText('Message unsent');
  await expect(page.getByText('Can we compare validation peaks?', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Conversation settings' }).click();
  await page.getByRole('menuitem', { name: 'Export as Markdown' }).click();
  const exportDialog = page.getByRole('dialog', { name: 'Export conversation', exact: true });
  await expect(exportDialog.getByRole('status')).toHaveText('2 messages ready to save as Markdown.');
  const downloadButton = exportDialog.getByRole('link', { name: 'Download Markdown' });
  const markdown = await downloadButton.evaluate(async (element) =>
    (await fetch((element as HTMLAnchorElement).href)).text()
  );
  expect(markdown).toContain('# Experiment discussion');
  expect(markdown).toContain('Here is a quoted reply');
  expect(markdown).toContain('Message unsent');
  expect(markdown).not.toContain('Can we compare validation peaks?');
  const downloaded = page.waitForEvent('download');
  await downloadButton.click();
  expect((await downloaded).suggestedFilename()).toBe('Experiment discussion.md');
  await exportDialog.getByRole('button', { name: 'Close', exact: true }).click();
  if (test.info().project.name === 'mobile') {
    await page.getByRole('button', { name: 'Conversation list' }).click();
    await page.getByText('Experiment discussion', { exact: true }).click();
    await expect(page.getByLabel('Message', { exact: true })).toBeVisible();
  }
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: `/tmp/visin-chat-${test.info().project.name}.png`,
    fullPage: true,
    animations: 'disabled'
  });
});

test('the shell loads the real chat panel and expands the selected conversation', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const conversation = {
    _id: '111111111111111111111111',
    kind: 'direct',
    title: 'Team conversation',
    trainingIds: [],
    seq: 0,
    participants: [{ userId: 'alice', name: 'Alice', state: 'active', role: 'owner', readSeq: 0 }]
  };
  await page.route(/^http:\/\/localhost:(5001|5012)\//, async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    const headers = {
      'access-control-allow-origin': req.headers().origin || 'http://localhost:3010',
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'content-type, authorization, x-request-id',
      'access-control-allow-methods': 'GET, POST, OPTIONS'
    };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (url.pathname.endsWith('/auth/verify'))
      return route.fulfill({
        headers,
        json: { success: true, authenticated: true, user: { id: 'alice', name: 'Alice', email: 'alice@test.invalid' } }
      });
    if (url.pathname.endsWith('/events')) return route.abort();
    const data = url.pathname.endsWith('/conversations')
      ? [conversation]
      : url.pathname.endsWith('/capabilities')
        ? { assistant: false }
        : [];
    return route.fulfill({ headers, json: { success: true, data } });
  });
  await page.goto('http://localhost:3010/nowhere');
  // Chat is a button in the top bar, not a place in the menu.
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Chat' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Chat', exact: true }).click();
  if (test.info().project.name === 'mobile') {
    // A phone has no room beside the page: the button opens the chat page.
    await expect(page).toHaveURL(/\/chat$/);
    await page.getByText('Team conversation', { exact: true }).click();
    await expect(page.getByLabel('Message', { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
    return;
  }
  const panel = page.getByRole('complementary', { name: 'Chat', exact: true });
  await expect(panel).toBeVisible();
  // As tall as the window, beside the bar rather than under it.
  const box = await panel.boundingBox();
  expect(box?.y).toBe(0);
  expect(Math.round(box?.height ?? 0)).toBe(page.viewportSize()?.height);
  await panel.getByText('Team conversation', { exact: true }).click();
  await expect(panel.getByLabel('Message', { exact: true })).toBeVisible();
  // A request from the chat remote changes the host route while the same conversation stays open.
  const result = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const answered = (event: Event) => {
          const detail = (event as CustomEvent).detail;
          if (detail.id !== 'screen-browser-test') return;
          window.removeEventListener('visin:screen-done', answered);
          resolve(detail);
        };
        window.addEventListener('visin:screen-done', answered);
        window.dispatchEvent(
          new CustomEvent('visin:screen', {
            detail: { id: 'screen-browser-test', place: 'trainings', params: { project: 'aaaaaaaaaaaaaaaaaaaaaaaa' } }
          })
        );
      })
  );
  expect(result).toMatchObject({ ok: true, summary: 'Opened trainings for project aaaaaaaaaaaaaaaaaaaaaaaa' });
  await expect(page).toHaveURL(/\/projects\/aaaaaaaaaaaaaaaaaaaaaaaa\?tab=trainings$/);
  await expect(panel.getByLabel('Message', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open full chat' }).click();
  await expect(page).toHaveURL(/\/chat\?conversation=111111111111111111111111/);
  await expect(page.getByLabel('Message', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('direct chats keep assistant mentions as text on desktop and mobile', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const conversation = {
    _id: '111111111111111111111111',
    kind: 'direct',
    title: 'Shared discussion',
    trainingIds: [],
    seq: 0,
    participants: [
      { userId: 'alice', name: 'Alice', state: 'active', role: 'owner', readSeq: 0 },
      { userId: 'bob', name: 'Bob', state: 'active', role: 'member', readSeq: 0 }
    ]
  };
  const messages: Record<string, unknown>[] = [];
  let invocation: unknown;
  await page.route(/^http:\/\/localhost:(5001|5012)\//, async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    const headers = {
      'access-control-allow-origin': req.headers().origin || 'http://localhost:3014',
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'content-type, authorization, x-request-id',
      'access-control-allow-methods': 'GET, POST, OPTIONS'
    };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (url.pathname.endsWith('/auth/verify'))
      return route.fulfill({
        headers,
        json: { success: true, authenticated: true, user: { id: 'alice', name: 'Alice', email: 'alice@test.invalid' } }
      });
    if (url.pathname.endsWith('/events')) return route.abort();
    let data: unknown = [];
    if (url.pathname.endsWith('/capabilities')) data = { assistant: true, sharedAssistant: true };
    else if (url.pathname.endsWith('/conversations')) data = [conversation];
    else if (url.pathname.endsWith('/messages')) {
      if (req.method() === 'POST') {
        invocation = req.postDataJSON().assistantId;
        messages.push({
          _id: 'message1',
          kind: 'person',
          senderName: 'Alice',
          body: req.postDataJSON().body,
          seq: 1,
          createdAt: new Date().toISOString(),
          evidence: []
        });
        data = messages[0];
      } else data = messages;
    }
    return route.fulfill({ headers, json: { success: true, data } });
  });
  await page.goto('/chat');
  await page.getByText('Shared discussion', { exact: true }).click();
  await expect(page.getByLabel('Message', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Shared assistants/ })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Message audience' })).toHaveCount(0);
  const composer = page.getByLabel('Message', { exact: true });
  await composer.fill('@Reviewer hello Bob');
  await expect(page.getByRole('listbox', { name: 'Mention an assistant' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('@Reviewer hello Bob', { exact: true })).toBeVisible();
  expect(invocation).toBeUndefined();
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const transport of ['polling', 'stream'])
  test(`a panel message opens Projects using ${transport} and acknowledges the call`, async ({ page }) => {
    test.skip(test.info().project.name === 'mobile', 'A phone uses full-page chat, without screen navigation.');
    const conversation = {
      _id: '111111111111111111111111',
      kind: 'assistant',
      title: 'Navigation check',
      trainingIds: [],
      seq: 0,
      participants: [{ userId: 'alice', name: 'Alice', state: 'active', role: 'owner', readSeq: 0 }]
    };
    let askingTab = '';
    let answer: { ok: boolean; summary: string } | undefined;
    let message: Record<string, unknown> | undefined;
    let polls = 0;
    await page.route(/^http:\/\/localhost:(5001|5012)\//, async (route) => {
      const req = route.request(),
        url = new URL(req.url());
      const headers = {
        'access-control-allow-origin': req.headers().origin || 'http://localhost:3010',
        'access-control-allow-credentials': 'true',
        'access-control-allow-headers': 'content-type, authorization, x-request-id',
        'access-control-allow-methods': 'GET, POST, OPTIONS'
      };
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      if (url.pathname.endsWith('/auth/verify'))
        return route.fulfill({
          headers,
          json: {
            success: true,
            authenticated: true,
            user: { id: 'alice', name: 'Alice', email: 'alice@test.invalid' }
          }
        });
      if (url.pathname.endsWith('/events')) {
        if (transport === 'polling') return route.abort();
        const calls =
          askingTab && url.searchParams.get('tab') === askingTab && !answer
            ? [{ id: 'aaaaaaaaaaaaaaaaaaaaaaaa', place: 'projects' }]
            : [];
        return route.fulfill({
          headers: { ...headers, 'content-type': 'text/event-stream' },
          body: `retry: 100\n\nevent: screen\ndata: ${JSON.stringify(calls)}\n\n`
        });
      }
      let data: unknown = [];
      if (url.pathname.endsWith('/capabilities')) data = { assistant: true };
      else if (url.pathname.endsWith('/conversations')) data = [conversation];
      else if (url.pathname.endsWith('/messages')) {
        if (req.method() === 'POST') {
          const input = req.postDataJSON();
          expect(input.screen.allowActions).toBe(true);
          askingTab = input.screen.tabId;
          message = {
            _id: 'm1',
            kind: 'person',
            senderName: 'Alice',
            body: input.body,
            seq: 1,
            createdAt: new Date().toISOString(),
            evidence: []
          };
          data = message;
        } else data = message ? [message] : [];
      } else if (url.pathname.endsWith('/runs'))
        data = askingTab
          ? [
              {
                _id: 'run1',
                state: answer ? 'completed' : 'running',
                activity: answer ? 'Completed' : 'Opening a page'
              }
            ]
          : [];
      else if (url.pathname.endsWith('/screen-calls')) {
        polls++;
        data =
          transport === 'polling' && askingTab && url.searchParams.get('tab') === askingTab && !answer
            ? [{ id: 'aaaaaaaaaaaaaaaaaaaaaaaa', place: 'projects', params: {} }]
            : [];
      } else if (url.pathname.endsWith('/screen-calls/aaaaaaaaaaaaaaaaaaaaaaaa/result')) answer = req.postDataJSON();
      return route.fulfill({ headers, json: { success: true, data } });
    });
    await page.goto('http://localhost:3010/nowhere');
    await page.getByRole('button', { name: 'Chat', exact: true }).click();
    const panel = page.getByRole('complementary', { name: 'Chat', exact: true });
    await panel.getByText('Navigation check', { exact: true }).click();
    await expect(panel.getByRole('checkbox', { name: /Allow page changes/ })).toHaveCount(0);
    await panel.getByLabel('Ask a follow-up').fill('Go to projects page');
    await panel.getByLabel('Ask a follow-up').press('Enter');
    await expect(page).toHaveURL('http://localhost:3010/projects');
    await expect.poll(() => answer?.ok).toBe(true);
    expect(polls).toBeGreaterThan(0);
    await expect(panel.getByLabel('Ask a follow-up')).toBeVisible();
    // The page changed because the analyst asked: the person is told so, and can take it back.
    await expect(page.getByRole('status').filter({ hasText: 'Analyst opened the projects' })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('analyst-cue.png') });
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page).toHaveURL('http://localhost:3010/nowhere');
    await expect(page.getByRole('status').filter({ hasText: 'Analyst opened' })).toHaveCount(0);
  });
