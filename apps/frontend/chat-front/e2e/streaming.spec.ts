import { expect, test } from '@playwright/test';

const CONVERSATION = '111111111111111111111111';
const QUESTION = '222222222222222222222222';
const ANSWER = '333333333333333333333333';
const RUN = '444444444444444444444444';
const TRAINING = '555555555555555555555555';

const question = {
  _id: QUESTION,
  kind: 'person',
  senderId: 'alice',
  senderName: 'Alice',
  body: 'Summarize this run',
  seq: 1,
  createdAt: new Date().toISOString(),
  evidence: []
};

test('the analyst’s answer arrives step by step, then as it is written, then as a message', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ colorScheme: info.project.name === 'desktop' ? 'dark' : 'light' });

  // A stream the test drives: nothing arrives until it says so.
  await page.addInitScript(() => {
    const streams: EventTarget[] = [];
    class FakeEventSource extends EventTarget {
      readyState = 1;
      url: string;
      constructor(url: string) {
        super();
        this.url = url;
        streams.push(this);
        setTimeout(() => this.dispatchEvent(new Event('open')), 0);
      }
      close() {
        this.readyState = 2;
      }
    }
    // Dictation the test drives: the browser's own needs a person and a microphone.
    const listeners: { onresult: ((event: unknown) => void) | null; onend: (() => void) | null }[] = [];
    class FakeSpeech {
      lang = '';
      continuous = false;
      interimResults = false;
      onresult: ((event: unknown) => void) | null = null;
      onerror: (() => void) | null = null;
      onend: (() => void) | null = null;
      constructor() {
        listeners.push(this);
      }
      start() {}
      stop() {
        this.onend?.();
      }
      abort() {}
    }
    Object.assign(window, {
      SpeechRecognition: FakeSpeech,
      hear: (transcript: string, isFinal: boolean) =>
        listeners.at(-1)!.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript }], { isFinal })] }),
      EventSource: FakeEventSource,
      emit: (type: string, data: unknown, id = '') =>
        streams.at(-1)!.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(data), lastEventId: id }))
    });
  });

  const run = (patch: object = {}) => ({
    _id: RUN,
    messageId: QUESTION,
    userId: 'alice',
    state: 'running',
    activity: 'Reading results and preparing an answer',
    canCancel: true,
    steps: [
      { tool: 'list_projects', startedAt: new Date(Date.now() - 6000).toISOString(), endedAt: new Date(Date.now() - 5000).toISOString() },
      { tool: 'get_training_curve', startedAt: new Date(Date.now() - 3000).toISOString() }
    ],
    ...patch
  });
  const answer = {
    _id: ANSWER,
    kind: 'assistant',
    senderId: 'assistant:analyst',
    senderName: 'Visin analyst',
    body: 'Validation **peaked at epoch 42** (mIoU 0.81), then slowly declined.\n\nBest checkpoint is earlier than the last one.',
    replyTo: QUESTION,
    seq: 2,
    createdAt: new Date().toISOString(),
    evidence: [
      { tool: 'list_projects', input: {}, at: new Date().toISOString() },
      { tool: 'get_training', input: { training: TRAINING }, at: new Date().toISOString() },
      { tool: 'get_training_curve', input: { training: TRAINING }, at: new Date().toISOString() }
    ]
  };
  const conversation = {
    _id: CONVERSATION,
    kind: 'assistant',
    title: 'Run analysis',
    projectId: 'p1',
    trainingIds: [TRAINING],
    trainingLabels: [{ id: TRAINING, name: 'baseline-r50' }],
    seq: 1,
    participants: [{ userId: 'alice', name: 'Alice', state: 'active', role: 'owner', readSeq: 0 }]
  };
  let messages: unknown[] = [question];
  let runs: unknown[] = [run()];

  await page.route(/^http:\/\/localhost:(5001|5012)\//, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const headers = {
      'access-control-allow-origin': req.headers().origin || 'http://localhost:3014',
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'content-type, authorization, x-request-id',
      'access-control-allow-methods': 'GET, POST, OPTIONS'
    };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (url.pathname.endsWith('/auth/verify'))
      return route.fulfill({ headers, json: { success: true, authenticated: true, user: { id: 'alice', name: 'Alice', email: 'a@test.invalid' } } });
    let data: unknown = [];
    if (url.pathname.endsWith('/capabilities')) data = { assistant: true };
    else if (url.pathname.endsWith('/conversations')) data = [conversation];
    else if (url.pathname.endsWith('/messages')) data = messages;
    else if (url.pathname.endsWith('/runs')) data = runs;
    return route.fulfill({ headers, json: { success: true, data } });
  });

  await page.goto('/chat');
  await page.getByText('Run analysis', { exact: true }).click();

  // 1. Working: what it is doing, as a list.
  await expect(page.getByText('Found the project')).toBeVisible();
  await expect(page.getByText('Reading the training curve')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop the analyst' })).toBeVisible();
  // Only for the picture: the spinner starts as a dot and takes a moment to become an arc.
  await page.waitForTimeout(600);
  await page.screenshot({ path: info.outputPath('1-steps.png') });

  // 2. Writing: the answer fills in, and the list gives way to it.
  const draft = (text: string) => page.evaluate((t) => (window as unknown as { emit: (type: string, data: unknown) => void }).emit('draft', { runId: '444444444444444444444444', messageId: '222222222222222222222222', text: t }), text);
  await draft('Validation peaked at epoch 42');
  await expect(page.getByTestId('streaming-message')).toBeVisible();
  await expect(page.getByTestId('streaming-message')).toContainText('Validation peaked at epoch 42');
  await expect(page.getByText('Found the project')).toHaveCount(0);
  await draft(answer.body);
  await expect(page.getByTestId('streaming-message')).toContainText('Best checkpoint is earlier', { timeout: 5000 });
  // The end of the answer is in view, not hidden under the composer, however long it grows.
  const bubble = page.getByTestId('streaming-message');
  await expect.poll(async () => (await bubble.boundingBox())!.y + (await bubble.boundingBox())!.height).toBeLessThanOrEqual(
    (await page.getByRole('textbox').last().boundingBox())!.y
  );
  // A caret ends the last line of the text (it blinks, so a picture may catch it either way).
  const caret = await bubble.evaluate((root) => {
    const lastBlock = root.querySelector(':scope > div:last-of-type > div > :last-child');
    const style = getComputedStyle(lastBlock!, '::after');
    return { content: style.content, display: style.display };
  });
  expect(caret).toEqual({ content: '""', display: 'inline-block' });
  await page.screenshot({ path: info.outputPath('2-writing.png') });

  // 3. Done: the message takes its place; the text is there once, with what it checked and what to ask next.
  messages = [question, answer];
  runs = [run({ state: 'completed', steps: [] })];
  await page.evaluate(
    ([m, r]) => (window as unknown as { emit: (type: string, data: unknown, id: string) => void }).emit('state', { messages: m, runs: r }, '2'),
    [[answer], runs] as const
  );
  await expect(page.getByTestId('streaming-message')).toHaveCount(0);
  await expect(page.getByText('Best checkpoint is earlier than the last one.')).toHaveCount(1);
  // The thread's own header names the run too; the answer's is the last.
  await expect(page.getByRole('link', { name: 'baseline-r50' }).last()).toBeVisible();
  await page.getByRole('button', { name: /Checked 3 sources/ }).click();
  await expect(page.getByText('Read the training curve')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Follow-up questions' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('3-answered.png') });

  // 4. The next question: a slash command writes it, and dictation can add to it.
  const composer = page.getByRole('textbox').last();
  await composer.fill('/');
  const commands = page.getByRole('listbox', { name: 'Commands' });
  await expect(commands.getByRole('option')).toHaveCount(5);
  await page.screenshot({ path: info.outputPath('4-commands.png') });
  await composer.fill('/wo');
  await composer.press('Enter');
  await expect(composer).toHaveValue(/Where does this model perform worst/);
  await page.getByRole('button', { name: 'Dictate' }).click();
  await expect(page.getByText(/Listening/)).toBeVisible();
  await page.evaluate(() => (window as unknown as { hear: (t: string, f: boolean) => void }).hear('and for the night frames', false));
  await expect(composer).toHaveValue(/perform worst, and by how much\? and for the night frames$/);
  await page.screenshot({ path: info.outputPath('5-dictating.png') });
  await page.getByRole('button', { name: 'Stop dictating' }).click();
  await expect(page.getByRole('button', { name: 'Dictate' })).toBeVisible();

  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
