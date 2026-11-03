import { expect, test } from '@playwright/test';
test('human chat works without a provider and stays usable on mobile', async ({ page }) => {
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
        messages.push({
          _id: 'message1',
          kind: 'person',
          senderName: 'Alice',
          body: input.body,
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
  await page.getByText('Experiment discussion', { exact: true }).click();
  await expect(page.getByLabel('Message', { exact: true })).toBeVisible();
  await page.getByLabel('Message', { exact: true }).fill('Can we compare validation peaks?');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('Can we compare validation peaks?', { exact: true })).toBeVisible();
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
