import { expect, test } from '@playwright/test';
test('human chat works without a provider and stays usable on mobile', async ({ page }) => {
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
    else if (url.pathname.endsWith('/messages')) {
      if (req.method() === 'POST') {
        const input = req.postDataJSON();
        const source = messages.find((message) => message._id === input.replyTo);
        messages.push({
          _id: `message${messages.length + 1}`,
          kind: 'person',
          senderName: 'Alice',
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
      } else data = messages;
    }
    return route.fulfill({ headers, json: { success: true, data } });
  });
  await page.goto('/chat');
  await page.getByText('Experiment discussion', { exact: true }).click();
  await expect(page.getByLabel('Message', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'People', exact: true }).click();
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
  await page.getByRole('button', { name: 'Reply to Alice' }).click();
  await expect(page.getByText('Replying to Alice')).toBeVisible();
  await page.getByLabel('Message', { exact: true }).fill('Here is a quoted reply');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect.poll(() => messages.at(-1)?.replyTo).toBe('message1');
  await expect(page.locator('blockquote')).toContainText('Can we compare validation peaks?');
  await expect(page.getByRole('button', { name: 'Cancel reply' })).toHaveCount(0);
  if (test.info().project.name === 'mobile') {
    await page.getByRole('button', { name: 'Conversation list' }).click();
    await page.getByText('Experiment discussion', { exact: true }).click();
    await expect(page.getByLabel('Message', { exact: true })).toBeVisible();
  }
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `/tmp/visin-chat-${test.info().project.name}.png`, fullPage: true });
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
  await page.getByRole('button', { name: 'Open full chat' }).click();
  await expect(page).toHaveURL(/\/chat\?conversation=111111111111111111111111/);
  await expect(page.getByLabel('Message', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('shared assistant consent and explicit invocation work on desktop and mobile', async ({ page }) => {
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
  let agreed = false;
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
    else if (url.pathname === '/api/chat/assistants') data = [];
    else if (url.pathname.endsWith('/assistants')) {
      if (req.method() === 'POST') agreed = req.postDataJSON().enabled;
      data = {
        enabled: agreed,
        agreed,
        lockedOff: false,
        policy: 'unanimous',
        canManage: false,
        canLock: false,
        bots: [
          { id: '222222222222222222222222', name: 'Reviewer', personality: 'Explain assumptions', available: true }
        ],
        pending: agreed ? [] : ['Alice']
      };
    } else if (url.pathname.endsWith('/messages')) {
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
  await page.getByRole('button', { name: 'Shared assistants off' }).click();
  await expect(page.getByText('Explain assumptions')).toBeVisible();
  await page.getByRole('button', { name: 'Agree to shared assistants' }).click();
  await page.getByRole('combobox', { name: 'Message audience' }).click();
  await page.getByRole('option', { name: 'Ask Reviewer' }).click();
  await page.getByLabel('Message', { exact: true }).fill('Explain this discussion');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect.poll(() => invocation).toBe('222222222222222222222222');
  await expect(page.getByRole('combobox', { name: 'Message audience' })).toContainText('People only');
  const composer = page.getByLabel('Message', { exact: true });
  await composer.fill('@Rev');
  await page.getByRole('option', { name: '@Reviewer', exact: true }).click();
  await expect(composer).toHaveValue('@Reviewer ');
  await expect(page.getByRole('combobox', { name: 'Message audience' })).toContainText('Ask Reviewer');
  invocation = undefined;
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect.poll(() => invocation).toBe('222222222222222222222222');
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
