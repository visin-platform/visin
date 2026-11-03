import { Router, type Request, type RequestHandler } from 'express';
import { z } from 'zod';
import {
  authenticateToken,
  createApiKey,
  deleteApiKey,
  fetchWithTimeout,
  BadGatewayError,
  BadRequestError,
  ForbiddenError,
  isEncryptionConfigured,
  NotFoundError,
  createBaseApp,
  createHealthCheckHandler,
  createRateLimiter,
  errorHandler,
  logger,
  STANDARD_CORS_ALLOWED_HEADERS
} from '@visin/backend-core';
import { AssistantRun, Block, Conversation, Message } from './models';
import {
  accessCache,
  checkAccess,
  endpoint,
  authorize,
  groups,
  historyFilter,
  peer,
  publicPerson,
  sharedContacts,
  type Project
} from './services/access';
import { appendMessage } from './services/messages';
import {
  MAX_DAILY_TOKEN_LIMIT,
  assistantSettings,
  assistantStatus,
  forgetProviderModels,
  isPlatformAdmin,
  providerCatalog,
  providerModelChoices,
  providerModels,
  saveAssistantSettings
} from './services/settings';
import { removeProviderKey, saveProviderKey } from './services/keys';
import { ADAPTERS, PROVIDERS, PROVIDER_IDS } from './services/providers';
import { RESERVATION } from './services/analyst';
import { backfillPrices, getPricing, savePricing, usageReport } from './services/usage';
import { refreshPrices } from './services/priceList';

const id = z.string().regex(/^[a-f\d]{24}$/i);
const createSchema = z
  .object({
    kind: z.enum(['assistant', 'direct', 'room', 'group', 'project']),
    title: z.string().trim().min(1).max(120),
    handles: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
    userIds: z.array(id).max(20).default([]),
    groupId: id.optional(),
    projectId: id.optional(),
    trainingIds: z.array(id).max(20).default([])
  })
  .strict();
const sendSchema = z
  .object({
    body: z.string().trim().min(1).max(8000),
    clientId: z.string().regex(/^[A-Za-z0-9_-]{8,100}$/),
    replyTo: id.optional()
  })
  .strict();
const settingsSchema = z
  .object({
    enabled: z.boolean(),
    provider: z.enum(PROVIDER_IDS),
    // Chosen from the provider's own list, which is checked below; empty only while turning it off.
    model: z.string().trim().max(120),
    // Tokens a person may use a day. Left out, it stays as it is; its lower bound is checked below.
    dailyTokenLimit: z.number().int().max(MAX_DAILY_TOKEN_LIMIT, 'That limit is too large').optional()
  })
  .strict();
const keySchema = z
  .object({
    // Not echoed back in any error: the messages are fixed.
    key: z
      .string()
      .trim()
      .min(8, 'That does not look like an API key')
      .max(500, 'That does not look like an API key')
      .regex(/^\S+$/, 'That does not look like an API key')
  })
  .strict();
const usageQuerySchema = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });
const pricesSchema = z
  .object({
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, 'Use a three-letter currency code, such as USD'),
    entries: z
      .array(
        z
          .object({
            provider: z.enum(PROVIDER_IDS),
            model: z.string().trim().min(1).max(120),
            // Per million tokens: a ceiling that no real price reaches, so a slipped decimal point is caught.
            inputPerMillion: z.number().min(0).max(100000),
            outputPerMillion: z.number().min(0).max(100000),
            // Sent back as received, so a fetched price stays marked as fetched until it is edited by hand.
            source: z.enum(['manual', 'fetched']).default('manual'),
            fetchedAt: z.string().datetime().nullable().default(null)
          })
          .strict()
      )
      .max(200)
  })
  .strict();
const keyParamsSchema = z.object({ provider: z.enum(PROVIDER_IDS) });
const modelsQuerySchema = z.object({ provider: z.enum(PROVIDER_IDS).optional() });
function parsed<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new BadRequestError(result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  return result.data;
}
const actorName = (req: Request): string => req.user!.name || req.user!.email?.split('@')[0] || 'You';
const paramId = (req: Request) => parsed(id, req.params.id);
/** How often an open event stream polls for new messages and run progress. */
const STREAM_POLL_MS = 2000;
/** How often an open event stream re-checks the session and conversation access. */
const STREAM_REAUTHORIZE_MS = 10000;
/** A comment line on a quiet stream, so proxies do not close it as idle. */
const STREAM_HEARTBEAT_MS = 20000;
export function createApp() {
  const writeLimit = createRateLimiter({ windowMs: 60000, max: 30, keyGenerator: (req) => req.user!.id });
  const inviteLimit = createRateLimiter({ windowMs: 3600000, max: 20, keyGenerator: (req) => req.user!.id });

  const app = createBaseApp({ corsAllowedHeaders: STANDARD_CORS_ALLOWED_HEADERS });
  app.get(
    '/health',
    createHealthCheckHandler({ serviceName: 'chat-service', description: 'Research conversations', checkMongo: true })
  );
  const router = Router();
  router.use(authenticateToken);
  router.get('/capabilities', async (req, res) => {
    const [status, canConfigure] = await Promise.all([
      assistantStatus(),
      // Only decides whether the settings are offered; the settings routes check it again.
      isPlatformAdmin(req.user!.id).catch(() => false)
    ]);
    res.json({ success: true, data: { assistant: status.ready, sharedAssistant: false, canConfigure } });
  });
  const requireAdmin: RequestHandler = async (req, _res, next) => {
    try {
      if (await isPlatformAdmin(req.user!.id)) next();
      else next(new ForbiddenError('Only an administrator can change the analyst'));
    } catch (error) {
      next(error);
    }
  };
  const settingsView = async () => {
    const { settings, missing, ready } = await assistantStatus();
    return {
      enabled: settings.enabled,
      provider: settings.provider,
      model: settings.model,
      dailyTokenLimit: settings.dailyTokenLimit,
      // What one question reserves of that limit until its answer is in, so the page can say how far it goes.
      tokenReservation: RESERVATION,
      source: settings.source,
      ready,
      missing,
      providers: await providerCatalog()
    };
  };
  router.get('/settings/assistant', requireAdmin, async (_req, res) => {
    res.json({ success: true, data: await settingsView() });
  });
  router.get('/settings/assistant/models', requireAdmin, async (req, res) => {
    const { provider = (await assistantSettings()).provider } = parsed(modelsQuerySchema, req.query);
    const choices = await providerModelChoices(provider);
    res.json({
      success: true,
      data: {
        provider,
        models: choices?.models ?? [],
        recommended: choices?.recommended ?? null,
        reachable: choices !== null
      }
    });
  });
  router.put('/settings/assistant', writeLimit, requireAdmin, async (req, res) => {
    const input = parsed(settingsSchema, req.body);
    if (input.enabled && !input.model) throw new BadRequestError('Choose a model before turning the analyst on');
    // Only what is being turned on is held to the provider's list: switching off must always work, whatever
    // an earlier choice was and whether the provider is reachable.
    if (input.enabled) {
      const { name } = PROVIDERS[input.provider];
      const offered = await providerModels(input.provider);
      if (!offered) throw new BadRequestError(`${name}'s models could not be listed. Add a valid ${name} key first.`);
      if (!offered.some((model) => model.id === input.model))
        throw new BadRequestError(`${name} does not offer ${input.model}`);
    }
    const dailyTokenLimit = input.dailyTokenLimit ?? (await assistantSettings()).dailyTokenLimit;
    // A question reserves its worst case up front, so a limit below one question would refuse every one.
    if (dailyTokenLimit < RESERVATION)
      throw new BadRequestError(
        `The daily limit must be at least ${RESERVATION.toLocaleString('en-US')} tokens: one question reserves that much`
      );
    await saveAssistantSettings({ ...input, dailyTokenLimit }, req.user!.id);
    logger.info('Assistant settings changed', { by: req.user!.id, ...input, dailyTokenLimit });
    res.json({ success: true, data: await settingsView() });
  });
  router.get('/settings/assistant/usage', requireAdmin, async (req, res) => {
    const { days } = parsed(usageQuerySchema, req.query);
    res.json({ success: true, data: await usageReport(days) });
  });
  router.put('/settings/assistant/prices', writeLimit, requireAdmin, async (req, res) => {
    const prices = parsed(pricesSchema, req.body);
    const seen = new Set<string>();
    for (const entry of prices.entries) {
      const key = `${entry.provider}:${entry.model}`;
      if (seen.has(key)) throw new BadRequestError(`${entry.model} is priced twice`);
      seen.add(key);
    }
    await savePricing(prices, req.user!.id);
    logger.info('Assistant prices changed', {
      by: req.user!.id,
      currency: prices.currency,
      models: prices.entries.length
    });
    res.json({ success: true, data: await getPricing() });
  });
  router.post('/settings/assistant/prices/backfill', inviteLimit, requireAdmin, async (req, res) => {
    const result = await backfillPrices();
    logger.info('Assistant questions priced afterwards', { by: req.user!.id, questions: result.questions });
    res.json({ success: true, data: result });
  });
  router.post('/settings/assistant/prices/refresh', inviteLimit, requireAdmin, async (req, res) => {
    res.json({ success: true, data: await refreshPrices(req.user!.id) });
  });
  router.put('/settings/assistant/keys/:provider', inviteLimit, requireAdmin, async (req, res) => {
    const { provider } = parsed(keyParamsSchema, req.params);
    const { key } = parsed(keySchema, req.body);
    const { name } = PROVIDERS[provider];
    if (!isEncryptionConfigured())
      throw new BadRequestError('API_KEY_ENCRYPTION_SECRET must be set on the server before keys can be saved here');
    // A key is only kept once the provider has accepted it: listing models is a free request that needs it.
    let offered;
    try {
      offered = await ADAPTERS[provider].listModels(key);
    } catch {
      throw new BadGatewayError(`Could not reach ${name} to check the key. Try again.`);
    }
    if (!offered) throw new BadRequestError(`${name} did not accept this key`);
    await saveProviderKey(provider, key, req.user!.id);
    forgetProviderModels(provider);
    // Who and which provider, never the key.
    logger.info('Assistant key saved', { by: req.user!.id, provider });
    res.json({ success: true, data: await settingsView() });
  });
  router.delete('/settings/assistant/keys/:provider', writeLimit, requireAdmin, async (req, res) => {
    const { provider } = parsed(keyParamsSchema, req.params);
    await removeProviderKey(provider);
    forgetProviderModels(provider);
    logger.info('Assistant key removed', { by: req.user!.id, provider });
    res.json({ success: true, data: await settingsView() });
  });
  router.get('/groups', async (req, res) => {
    res.json({ success: true, data: await groups.getMyGroups(req.user!.id) });
  });
  router.get('/projects', async (req, res) => {
    const result = await peer<{ projects: Project[] }>('VISION', '/api/projects?limit=100', req);
    res.json({ success: true, data: result.projects || [] });
  });
  router.get('/contacts', inviteLimit, async (req, res) => {
    res.json({ success: true, data: await sharedContacts(req) });
  });
  router.get('/people/:handle', inviteLimit, async (req, res) => {
    res.json({ success: true, data: await publicPerson(String(req.params.handle)) });
  });
  router.get('/conversations', async (req, res) => {
    const actor = req.user!.id;
    const memberships = await groups.getMyGroups(actor);
    const candidates = await Conversation.find({
      deletedAt: null,
      $or: [
        { participants: { $elemMatch: { userId: actor, state: { $in: ['active', 'invited'] } } } },
        { groupId: { $in: memberships.map((g) => g.groupId) }, kind: { $in: ['group', 'project'] } }
      ]
    })
      .sort({ updatedAt: -1 })
      .limit(100);
    // Checked against the documents just loaded, the groups fetched above, and each project once.
    const cache = accessCache(memberships.map((g) => g.groupId));
    const checked = await Promise.all(
      candidates.map(async (c) => {
        try {
          return await checkAccess(req, c, false, cache);
        } catch (e) {
          if (!(e instanceof NotFoundError || e instanceof ForbiddenError)) throw e;
          return undefined;
        }
      })
    );
    res.json({ success: true, data: checked.filter((c) => c !== undefined) });
  });
  router.post('/conversations', inviteLimit, async (req, res) => {
    const input = parsed(createSchema, req.body),
      actor = req.user!.id;
    if (input.groupId && input.kind !== 'group')
      throw new BadRequestError('A group binding is only for group channels');
    if (input.kind === 'group' && (input.projectId || input.trainingIds.length))
      throw new BadRequestError('Use a project discussion to attach training context');
    if (input.handles.length + input.userIds.length > 19)
      throw new BadRequestError('A room supports at most 20 people');
    const participants: {
      userId: string;
      name: string;
      state: 'active' | 'invited';
      role: 'owner' | 'member';
      joinedAt: Date | null;
    }[] = [{ userId: actor, name: actorName(req), state: 'active', role: 'owner', joinedAt: new Date() }];
    if (input.kind === 'assistant' && (input.handles.length || input.userIds.length))
      throw new BadRequestError('Assistant chats are private');
    if (input.kind === 'direct' && input.handles.length + input.userIds.length !== 1)
      throw new BadRequestError('Choose one person');
    if (input.kind === 'room' && input.handles.length + input.userIds.length === 0)
      throw new BadRequestError('Invite at least one person');
    if (!['direct', 'room'].includes(input.kind) && (input.handles.length || input.userIds.length))
      throw new BadRequestError('This channel uses its group membership');
    for (const handle of input.handles) {
      const person = await publicPerson(handle);
      if (participants.some((p) => p.userId === person.id)) throw new BadRequestError('Choose different people');
      if (
        await Block.exists({
          $or: [
            { userId: actor, blockedId: person.id },
            { userId: person.id, blockedId: actor }
          ]
        })
      )
        throw new ForbiddenError('Cannot contact this person');
      participants.push({ userId: person.id, name: person.name, state: 'invited', role: 'member', joinedAt: null });
    }
    if (input.userIds.length) {
      const contacts = await sharedContacts(req);
      for (const userId of input.userIds) {
        const person = contacts.find((contact) => contact.id === userId);
        if (!person) throw new NotFoundError('This contact is no longer in a shared group');
        if (participants.some((p) => p.userId === person.id)) throw new BadRequestError('Choose different people');
        if (
          await Block.exists({
            $or: [
              { userId: actor, blockedId: person.id },
              { userId: person.id, blockedId: actor }
            ]
          })
        )
          throw new ForbiddenError('Cannot contact this person');
        participants.push({
          userId: person.id,
          name: `Invited colleague ${person.id.slice(-6)}`,
          state: 'invited',
          role: 'member',
          joinedAt: null
        });
      }
    }
    let projectName: string | undefined;
    const trainingLabels: { id: string; name: string }[] = [];
    let groupId: string | undefined, projectId: string | undefined;
    if (input.kind === 'group') {
      if (!input.groupId) throw new BadRequestError('Choose a group');
      const membership = await groups.checkMembership(input.groupId, actor);
      if (!membership.member || !['owner', 'admin'].includes(membership.role!))
        throw new ForbiddenError('A group administrator creates channels');
      groupId = input.groupId;
    } else if (input.kind === 'project' || input.kind === 'assistant') {
      if (input.kind === 'project' && !input.projectId) throw new BadRequestError('Choose a project');
      if (input.projectId) {
        const project = await peer<Project>('VISION', `/api/projects/${input.projectId}`, req);
        projectId = project._id;
        projectName = project.name;
        if (input.kind === 'project') {
          if (project.owner.kind === 'group') {
            if (!(await groups.checkMembership(project.owner.id, actor)).member)
              throw new ForbiddenError('Project discussion is for its owning group');
            groupId = project.owner.id;
          } else if (project.owner.id !== actor) throw new ForbiddenError('Project discussion is private');
        }
        for (const training of input.trainingIds) {
          const run = await peer<{ projectId: string; name: string }>('VISION', `/api/trainings/${training}`, req);
          if (String(run.projectId) !== projectId)
            throw new BadRequestError('Selected runs must belong to the selected project');
          trainingLabels.push({ id: training, name: run.name });
        }
      } else if (input.trainingIds.length) throw new BadRequestError('Select a project for these runs');
    } else if (input.projectId || input.groupId || input.trainingIds.length)
      throw new BadRequestError('Attach protected results through a project analysis chat');
    const directKey =
      input.kind === 'direct'
        ? participants
            .map((p) => p.userId)
            .sort()
            .join(':')
        : undefined;
    const bindingKey =
      input.kind === 'project'
        ? `project:${projectId}:${groupId || actor}`
        : input.kind === 'group'
          ? `group:${groupId}:${input.title.toLowerCase()}`
          : undefined;
    let conversation;
    try {
      conversation = await Conversation.create({
        ...input,
        participants,
        createdBy: actor,
        groupId,
        projectId,
        projectName,
        trainingLabels,
        directKey,
        bindingKey
      });
    } catch (e) {
      if ((e as { code?: number }).code !== 11000) throw e;
      conversation = await Conversation.findOne(directKey ? { directKey } : { bindingKey });
      if (!conversation) throw e;
      // Whoever left or declined a direct conversation can start it again. The other
      // side's own decision stands, so a declined request cannot be repeated this way.
      const own = conversation.kind === 'direct' && conversation.participants.find((p) => p.userId === actor);
      if (own && own.state === 'left') {
        own.state = 'active';
        own.joinedAt = new Date();
        conversation.membershipVersion += 1;
        await conversation.save();
      }
      conversation = await authorize(req, conversation.id);
    }
    res.status(201).json({ success: true, data: conversation });
  });
  // A group's own channel, opened from its page by any member and made on first use. Further,
  // named channels stay an administrator's to create.
  router.post('/groups/:groupId/channel', writeLimit, async (req, res) => {
    const groupId = parsed(id, req.params.groupId),
      actor = req.user!.id;
    const group = (await groups.getMyGroups(actor)).find((g) => g.groupId === groupId);
    if (!group) throw new NotFoundError('Only members of this group can message it');
    const bindingKey = `group:${groupId}:general`;
    let conversation = await Conversation.findOne({ bindingKey, deletedAt: null });
    if (!conversation) {
      try {
        conversation = await Conversation.create({
          kind: 'group',
          title: (group.name || 'Group').slice(0, 120),
          groupId,
          bindingKey,
          createdBy: actor,
          participants: [{ userId: actor, name: actorName(req), state: 'active', role: 'member', joinedAt: new Date() }]
        });
      } catch (e) {
        if ((e as { code?: number }).code !== 11000) throw e;
        conversation = await Conversation.findOne({ bindingKey, deletedAt: null });
        if (!conversation) throw e;
      }
    }
    res.json({ success: true, data: conversation });
  });
  router.get('/conversations/:id', async (req, res) => {
    res.json({ success: true, data: await authorize(req, paramId(req)) });
  });
  router.post('/conversations/:id/membership', writeLimit, async (req, res) => {
    const action = parsed(z.enum(['accept', 'decline', 'leave', 'block']), req.body?.action);
    const c = await authorize(req, paramId(req));
    if (c.kind !== 'direct' && c.kind !== 'room') throw new BadRequestError('Manage membership in the owning group');
    const member = c.participants.find((p) => p.userId === req.user!.id)!;
    if (action === 'accept' && member.state !== 'invited') throw new BadRequestError('No pending invitation');
    if (action === 'block' && c.kind !== 'direct')
      throw new BadRequestError('Blocking applies to direct conversations');
    if (action === 'block') {
      const other = c.participants.find((p) => p.userId !== req.user!.id)!;
      await Block.updateOne(
        { userId: req.user!.id, blockedId: other.userId },
        { $setOnInsert: { userId: req.user!.id, blockedId: other.userId } },
        { upsert: true }
      );
    }
    member.state = action === 'accept' ? 'active' : action === 'block' ? 'blocked' : 'left';
    if (action === 'accept') {
      member.name = actorName(req);
      member.joinedAt = new Date();
      member.joinedSeq = c.kind === 'room' ? c.seq : 0;
    }
    c.membershipVersion += 1;
    if (action === 'accept' && !c.participants.some((p) => p.state === 'active' && p.role === 'owner'))
      member.role = 'owner';
    if (member.role === 'owner' && action !== 'accept') {
      const successor = c.participants.find((p) => p.userId !== member.userId && p.state === 'active');
      if (successor) successor.role = 'owner';
    }
    await c.save();
    res.json({ success: true, data: c });
  });
  router.post('/conversations/:id/participants', inviteLimit, async (req, res) => {
    const c = await authorize(req, paramId(req), true);
    const member = c.participants.find((p) => p.userId === req.user!.id);
    if (c.kind !== 'room' || !member || !['owner', 'admin'].includes(member.role))
      throw new ForbiddenError('Only room administrators invite people');
    const handle = parsed(z.string().trim().min(1).max(80), req.body?.handle);
    const person = await publicPerson(handle);
    const previous = c.participants.find((p) => p.userId === person.id);
    // Someone who left or was removed can be invited again; they see history from the new acceptance.
    if (previous && previous.state !== 'left') throw new BadRequestError('This account was already invited');
    if (c.participants.filter((p) => p.state === 'active' || p.state === 'invited').length >= 20)
      throw new BadRequestError('Room participant limit reached');
    if (
      await Block.exists({
        $or: [
          { userId: req.user!.id, blockedId: person.id },
          { userId: person.id, blockedId: req.user!.id }
        ]
      })
    )
      throw new ForbiddenError('Cannot invite this person');
    if (previous) {
      previous.name = person.name;
      previous.state = 'invited';
      previous.role = 'member';
      previous.joinedAt = null;
    } else
      c.participants.push({
        userId: person.id,
        name: person.name,
        state: 'invited',
        role: 'member',
        joinedAt: null,
        readSeq: 0
      });
    c.membershipVersion += 1;
    await c.save();
    res.json({ success: true, data: c });
  });
  router.post('/conversations/:id/remove-participant', writeLimit, async (req, res) => {
    const c = await authorize(req, paramId(req), true);
    const member = c.participants.find((p) => p.userId === req.user!.id);
    if (c.kind !== 'room' || member?.role !== 'owner')
      throw new ForbiddenError('Only the room owner removes participants');
    const targetId = parsed(z.string().min(1).max(80), req.body?.userId);
    const target = c.participants.find((p) => p.userId === targetId);
    if (!target || target.userId === req.user!.id) throw new BadRequestError('Choose another participant');
    target.state = 'left';
    c.membershipVersion += 1;
    await c.save();
    res.json({ success: true, data: c });
  });
  router.get('/conversations/:id/messages', async (req, res) => {
    const c = await authorize(req, paramId(req));
    const before =
      req.query.before === undefined ? undefined : parsed(z.coerce.number().int().positive(), req.query.before);
    const rows = await Message.find({
      conversationId: c.id,
      $and: [historyFilter(c, req.user!.id), ...(before ? [{ seq: { $lt: before } }] : [])]
    })
      .sort({ seq: -1 })
      .limit(50);
    res.json({ success: true, data: rows.reverse() });
  });
  router.post('/conversations/:id/messages', writeLimit, async (req, res) => {
    const c = await authorize(req, paramId(req), true),
      input = parsed(sendSchema, req.body);
    const existing = await Message.findOne({ conversationId: c.id, clientId: input.clientId, senderId: req.user!.id });
    if (existing) {
      res.json({ success: true, data: existing });
      return;
    }
    if (await Message.exists({ conversationId: c.id, clientId: input.clientId }))
      throw new BadRequestError('Message retry identifier already used');
    if (c.kind === 'direct' && c.participants.some((p) => p.state !== 'active')) {
      const claimed = await Conversation.updateOne(
        { _id: c.id, $or: [{ requestSent: false }, { requestClientId: input.clientId }] },
        { $set: { requestSent: true, requestClientId: input.clientId } }
      );
      if (!claimed.matchedCount) throw new ForbiddenError('Wait for the message request to be accepted');
    }
    if (
      input.replyTo &&
      !(await Message.exists({ _id: input.replyTo, conversationId: c.id, ...historyFilter(c, req.user!.id) }))
    )
      throw new BadRequestError('Reply is not in your visible conversation');
    if (c.kind === 'assistant' && !(await assistantStatus()).ready)
      throw new BadRequestError('The assistant is not configured. Human messaging is available.');
    const message = await appendMessage({
      conversationId: c.id,
      senderId: req.user!.id,
      senderName: actorName(req),
      kind: 'person',
      ...input,
      ...(c.kind === 'assistant'
        ? {
            assistantRequest: {
              userId: req.user!.id,
              email: req.user!.email || '',
              name: actorName(req),
              membershipVersion: c.membershipVersion
            }
          }
        : {})
    });
    const { assistantRequest: _request, assistantCancelled: _cancelled, ...view } = message.toObject();
    res.status(201).json({ success: true, data: view });
  });
  router.post('/conversations/:id/read', async (req, res) => {
    const c = await authorize(req, paramId(req));
    const seq = parsed(z.number().int().min(0).max(c.seq), req.body?.seq);
    if (['group', 'project'].includes(c.kind))
      await Conversation.updateOne(
        { _id: c.id, 'participants.userId': { $ne: req.user!.id } },
        {
          $push: {
            participants: {
              userId: req.user!.id,
              name: actorName(req),
              state: 'active',
              role: 'member',
              joinedAt: new Date(),
              joinedSeq: 0,
              readSeq: 0
            }
          }
        }
      );
    await Conversation.updateOne(
      { _id: c.id, participants: { $elemMatch: { userId: req.user!.id, state: 'active' } } },
      { $max: { 'participants.$.readSeq': seq } }
    );
    res.json({ success: true });
  });
  router.get('/conversations/:id/runs', async (req, res) => {
    const c = await authorize(req, paramId(req));
    res.json({
      success: true,
      data: await AssistantRun.find({ conversationId: c.id, userId: req.user!.id })
        .select('-email -keyId -result -evidence')
        .sort({ createdAt: -1 })
        .limit(20)
    });
  });
  router.post('/conversations/:id/findings', writeLimit, async (req, res) => {
    const c = await authorize(req, paramId(req), true);
    const input = parsed(
      z
        .object({
          messageId: id,
          title: z.string().trim().min(1).max(200),
          body: z.string().min(1).max(20000),
          recommendations: z.string().max(5000).optional()
        })
        .strict(),
      req.body
    );
    if (c.kind !== 'assistant' || !c.projectId) throw new BadRequestError('Save findings from a project analysis');
    const message = await Message.findOne({ _id: input.messageId, conversationId: c.id, kind: 'assistant' });
    if (!message) throw new NotFoundError('Assistant answer not found');
    if (message.findingId) {
      res.json({ success: true, data: { _id: message.findingId } });
      return;
    }
    // The write credential exists only for this deliberate save, never in the model's tool surface.
    const key = await createApiKey({
      userId: req.user!.id,
      userEmail: req.user!.email || '',
      userName: actorName(req),
      name: 'Visin analyst',
      scopes: ['analysis:write'],
      project: { id: c.projectId, name: c.projectName || c.title },
      expiresAt: new Date(Date.now() + 60000)
    });
    try {
      const response = await fetchWithTimeout(`${endpoint('VISION')}/api/findings`, {
        method: 'POST',
        timeoutMs: 10000,
        serviceName: 'vision-service',
        headers: { authorization: `Bearer ${key.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          project: c.projectId,
          title: input.title,
          body: input.body,
          recommendations: input.recommendations,
          trainingIds: [
            ...new Set([
              ...c.trainingIds,
              ...message.evidence.flatMap((e) => {
                const args = e.input as Record<string, unknown> | undefined;
                return [args?.training, ...(Array.isArray(args?.trainings) ? args.trainings : [])].filter(
                  (id): id is string => typeof id === 'string' && /^[a-f\d]{24}$/i.test(id)
                );
              })
            ])
          ],
          sourceId: `chat:${message.id}`
        })
      });
      if (response.status === 403) throw new ForbiddenError('Project edit permission is required to save a finding');
      if (!response.ok) {
        // A refusal says why (a removed run, a title too long); an outage is the peer's, not the request's.
        const detail = ((await response.json().catch(() => ({}))) as { message?: unknown }).message;
        if (response.status >= 500 || typeof detail !== 'string') throw new BadGatewayError('Could not save finding');
        throw new BadRequestError(detail);
      }
      const finding = ((await response.json()) as { data: { _id: string } }).data;
      await Message.updateOne({ _id: message.id }, { $set: { findingId: finding._id } });
      res.json({ success: true, data: finding });
    } finally {
      // It expires within a minute anyway; a failed cleanup must not hide the save's own outcome.
      await deleteApiKey(req.user!.id, key.summary.id).catch((error: unknown) =>
        logger.warn('Could not delete temporary finding key', {
          error: error instanceof Error ? error.message : 'Unknown failure'
        })
      );
    }
  });
  router.post('/conversations/:id/cancel', writeLimit, async (req, res) => {
    const c = await authorize(req, paramId(req), true);
    if (c.kind !== 'assistant') throw new BadRequestError('Shared assistants are disabled');
    // Only the questions still waiting or being answered, not every message the thread ever had.
    const open = await AssistantRun.find({
      conversationId: c.id,
      userId: req.user!.id,
      state: { $in: ['queued', 'running'] }
    }).select('messageId');
    await Message.updateMany(
      {
        conversationId: c.id,
        senderId: req.user!.id,
        $or: [{ assistantRequest: { $exists: true } }, { _id: { $in: open.map((run) => run.messageId) } }]
      },
      { $unset: { assistantRequest: 1 }, $set: { assistantCancelled: true } }
    );
    await AssistantRun.updateMany(
      { conversationId: c.id, userId: req.user!.id, state: { $in: ['queued', 'running'] } },
      { $set: { state: 'cancelled', finishedAt: new Date(), activity: 'Cancelled' } }
    );
    res.json({ success: true });
  });
  const streams = new Map<string, number>();
  router.get('/conversations/:id/events', async (req, res) => {
    const conversationId = paramId(req);
    let conversation = await authorize(req, conversationId);
    const userId = req.user!.id;
    if ((streams.get(userId) || 0) >= 4) throw new BadRequestError('Too many open chat streams');
    let after = parsed(z.coerce.number().int().min(0), req.headers['last-event-id'] || req.query.after || 0);
    streams.set(userId, (streams.get(userId) || 0) + 1);
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.flushHeaders();
    let stopped = false,
      loading = false,
      authorizedAt = Date.now(),
      wroteAt = 0,
      lastRuns: string | undefined;
    const timer = setInterval(() => {
      void tick();
    }, STREAM_POLL_MS);
    res.on('close', () => {
      stopped = true;
      clearInterval(timer);
      const remaining = (streams.get(userId) || 1) - 1;
      if (remaining) streams.set(userId, remaining);
      else streams.delete(userId);
    });
    const tick = async () => {
      if (stopped || loading) return;
      loading = true;
      try {
        // Access is re-checked every few polls, not every one: each check asks the session
        // store, group-service and vision-service, per open stream.
        if (Date.now() - authorizedAt >= STREAM_REAUTHORIZE_MS) {
          // authenticateToken deliberately skips an already-authenticated request. Clear the
          // cached payload so session revocation is checked again on long-lived connections.
          req.user = undefined;
          await new Promise<void>((resolve, reject) => {
            void authenticateToken(req, res, (error) => (error ? reject(error) : resolve()));
          });
          conversation = await authorize(req, conversationId);
          authorizedAt = Date.now();
        }
        const messages = await Message.find({
          conversationId,
          $and: [historyFilter(conversation, userId), { seq: { $gt: after } }]
        })
          .sort({ seq: 1 })
          .limit(50);
        const jobs =
          conversation.kind === 'assistant'
            ? await AssistantRun.find({ conversationId, userId })
                .select('-email -keyId -result -evidence')
                .sort({ createdAt: -1 })
                .limit(20)
            : [];
        const runs = JSON.stringify(jobs);
        if (messages.length) after = messages[messages.length - 1].seq;
        // Sent only when something changed; the first poll always sends, so the page has a state.
        let frame: string | undefined;
        if (messages.length || runs !== lastRuns)
          frame = `id: ${after}\nevent: state\ndata: ${JSON.stringify({ messages, runs: jobs })}\n\n`;
        else if (Date.now() - wroteAt >= STREAM_HEARTBEAT_MS) frame = ': keep-alive\n\n';
        lastRuns = runs;
        if (frame && !stopped) {
          wroteAt = Date.now();
          if (!res.write(frame)) res.end();
        }
      } catch {
        res.end();
      } finally {
        loading = false;
      }
    };
    void tick();
  });
  app.use('/api/chat', router);
  app.use(errorHandler);
  return app;
}
