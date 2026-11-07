import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControlLabel,
  Link,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography
} from '@mui/material';
import { CheckCircle, OpenInNew, RadioButtonUnchecked } from '@mui/icons-material';
import { Panel } from '@visin/frontend-core';
import {
  useAnalystModels,
  useAnalystSettings,
  useRemoveProviderKey,
  useSaveAnalystSettings,
  useSaveProviderKey
} from '../../hooks/useAnalyst';
import type { AnalystModelTier, AnalystProviderId } from '../../types/analyst';

/** What each server setting is for, so an administrator knows what to ask whoever runs the server. */
const SERVER_SETTING: Record<string, string> = {
  API_KEY_ENCRYPTION_SECRET: 'the secret that encrypts saved keys',
  MCP_INTERNAL_URL: "the address of Visin's MCP service"
};

/** Where each provider hands out keys, for an administrator who has none yet. */
const KEY_PAGES: Record<AnalystProviderId, string> = {
  anthropic: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys'
};

/** Model kinds in words, since model names mean nothing to most people choosing one. */
const TIERS: { tier: AnalystModelTier; title: string; description: string }[] = [
  {
    tier: 'balanced',
    title: 'Balanced',
    description: 'Strong analysis at a moderate cost. A good choice for most teams.'
  },
  {
    tier: 'best',
    title: 'Most capable',
    description: 'The deepest analysis. Slower, and costs the most per question.'
  },
  { tier: 'fast', title: 'Fastest', description: 'Quick, inexpensive answers for simpler questions.' }
];

/** Daily allowances in questions, the unit people think in; tokens are only offered under Custom. */
const ALLOWANCES = [5, 20, 50];

/** What has been changed on this page and not yet saved; anything left out is as the service has it. */
interface Draft {
  toolRounds?: string;
  enabled?: boolean;
  provider?: AnalystProviderId;
  model?: string;
  /** A preset's token count, or 'custom'. */
  allowance?: string;
  /** As typed under Custom: it may be empty, or not a number, until it is fixed. */
  customTokens?: string;
}

const tokens = (value: number): string => value.toLocaleString('en-US');

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : 'Something went wrong');

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <Panel aria-label={title}>
      <Stack spacing={2} sx={{ p: { xs: 2, sm: 3 } }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Box
            aria-hidden
            sx={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
              fontWeight: 700,
              fontSize: '0.875rem',
              bgcolor: 'primary.main',
              color: 'primary.contrastText'
            }}
          >
            {number}
          </Box>
          <Typography variant="h6" component="h2">
            {title}
          </Typography>
        </Stack>
        {children}
      </Stack>
    </Panel>
  );
}

function Check({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <ListItem disableGutters sx={{ py: 0.25 }}>
      <ListItemIcon sx={{ minWidth: 32 }}>
        {done ? (
          <CheckCircle fontSize="small" color="success" titleAccess="Done" />
        ) : (
          <RadioButtonUnchecked fontSize="small" color="disabled" titleAccess="To do" />
        )}
      </ListItemIcon>
      <ListItemText primary={children} slotProps={{ primary: { variant: 'body2' } }} />
    </ListItem>
  );
}

/**
 * The chat analyst's setup, for platform administrators (the Setup view of the Analyst section): which provider, its key, which model, how much each
 * person may use a day, and whether it is on.
 *
 * Written for someone who knows none of the vocabulary. Models are offered as kinds (most capable, balanced,
 * fastest) with the provider's current model for each, one recommended and already chosen; every model is still
 * one click away. The allowance is in questions a day, with tokens only under Custom. The key is pasted once,
 * checked with the provider, kept encrypted by the service and never shown again.
 */
const AnalystSetup: React.FC = () => {
  const settings = useAnalystSettings(true);
  const [draft, setDraft] = useState<Draft>({});
  const [newKey, setNewKey] = useState('');
  const [showAll, setShowAll] = useState(false);

  const saveSettings = useSaveAnalystSettings();
  const saveKey = useSaveProviderKey();
  const removeKey = useRemoveProviderKey();

  const current = settings.data;
  const provider = draft.provider ?? current?.provider ?? 'anthropic';
  const info = current?.providers.find((candidate) => candidate.id === provider);
  // Only a provider with a key can list its models: asking for the others would only come back empty.
  const models = useAnalystModels(provider, Boolean(info?.keyConfigured));

  if (settings.isPending || !current) {
    return settings.isError ? (
      <Alert severity="error">{messageOf(settings.error)}</Alert>
    ) : (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress aria-label="Loading settings" />
      </Box>
    );
  }

  const listed = info?.keyConfigured === true && models.data?.reachable === true;
  const offered = listed ? (models.data?.models ?? []) : [];
  const recommended = listed ? (models.data?.recommended ?? null) : null;
  const enabled = draft.enabled ?? current.enabled;
  // A model belongs to its provider: the saved one returns with its own provider; otherwise the recommended one
  // is chosen, so turning the analyst on needs no knowledge of model names.
  const savedModel = provider === current.provider ? current.model : '';
  const model = draft.model ?? (savedModel || recommended || '');
  const choices = TIERS.flatMap(({ tier, title, description }) => {
    const choice = offered.find((candidate) => candidate.tier === tier);
    return choice ? [{ ...choice, tier, title, description }] : [];
  });
  const inChoices = choices.some((choice) => choice.id === model);
  // A model outside the plain choices (picked from the full list, or one the provider no longer lists) is shown there.
  const listOpen = showAll || Boolean(model && !inChoices);
  const allOptions =
    model && !offered.some((option) => option.id === model) ? [{ id: model, name: model }, ...offered] : offered;

  const toolRoundsText = draft.toolRounds ?? String(current.toolRounds);
  const toolRounds = Number(toolRoundsText);
  const roundsError =
    !/^\d+$/.test(toolRoundsText) || toolRounds < current.minToolRounds || toolRounds > current.maxToolRounds;
  const reservation = current.tokenReservation + (toolRounds - current.toolRounds) * current.tokensPerRound;
  const savedPreset = ALLOWANCES.find((questions) => questions * reservation === current.dailyTokenLimit);
  const allowance = draft.allowance ?? (savedPreset ? String(savedPreset * reservation) : 'custom');
  const customText = draft.customTokens ?? String(current.dailyTokenLimit);
  const customLimit = /^\d+$/.test(customText.trim()) ? Number(customText.trim()) : NaN;
  const limit = allowance === 'custom' ? customLimit : Number(allowance);
  // A question reserves its worst case up front, so a limit below one question would refuse every one.
  const limitError =
    allowance !== 'custom'
      ? ''
      : Number.isNaN(customLimit)
        ? 'Enter a whole number of tokens.'
        : customLimit < reservation
          ? `At least ${tokens(reservation)}: one question reserves that much.`
          : '';

  const changed =
    toolRounds !== current.toolRounds ||
    enabled !== current.enabled ||
    provider !== current.provider ||
    model !== current.model ||
    (!limitError && limit !== current.dailyTokenLimit);
  // Turning it on needs something to answer with; switching it off can always be saved.
  const blocker = !enabled
    ? ''
    : !info?.keyConfigured
      ? `Add a key for ${info?.name ?? 'the provider'} in step 1, or switch the analyst off to save.`
      : !model
        ? 'Choose a model in step 2, or switch the analyst off to save.'
        : '';
  const cannotEncrypt = current.missing.includes('API_KEY_ENCRYPTION_SECRET');
  const keyStatus = !info
    ? ''
    : info.keyConfigured
      ? `Saved here${info.keyHint ? ` · ends in ${info.keyHint}` : ''}`
      : 'No key yet';
  const keyBusy = saveKey.isPending || removeKey.isPending;
  const error = saveSettings.error ?? saveKey.error ?? removeKey.error;
  const savedInfo = current.providers.find((candidate) => candidate.id === current.provider);

  const chooseProvider = (next: AnalystProviderId | null) => {
    if (!next || next === provider) return;
    setDraft((previous) => ({ ...previous, provider: next, model: undefined }));
    setNewKey('');
    setShowAll(false);
    saveKey.reset();
    removeKey.reset();
  };
  const save = () =>
    saveSettings.mutate(
      { enabled, provider, model, dailyTokenLimit: limit, toolRounds },
      {
        onSuccess: () => {
          setDraft({});
          setShowAll(false);
        }
      }
    );

  return (
    <>
      <Stack spacing={3}>
        <Panel aria-label="Setup">
          <Box sx={{ p: { xs: 2, sm: 3 } }}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 1 }}>
              <Typography variant="h6" component="h2">
                Setup
              </Typography>
              {current.ready ? (
                <Chip size="small" color="success" label="Answering questions" />
              ) : current.enabled ? (
                <Chip size="small" color="warning" label="Not ready yet" />
              ) : (
                <Chip size="small" label="Switched off" />
              )}
            </Stack>
            <List dense disablePadding aria-label="Setup steps">
              <Check done={Boolean(savedInfo?.keyConfigured)}>A key for {savedInfo?.name ?? 'the provider'}</Check>
              <Check done={Boolean(current.model)}>A model chosen and saved</Check>
              <Check done={current.enabled}>Switched on for everyone</Check>
              {current.missing.map((name) => (
                <Check key={name} done={false}>
                  The server&apos;s operator adds <code>{name}</code>, {SERVER_SETTING[name] ?? 'a required setting'}
                </Check>
              ))}
            </List>
          </Box>
        </Panel>

        <Step number={1} title="Provider and key">
          <ToggleButtonGroup
            exclusive
            value={provider}
            onChange={(_event, next: AnalystProviderId | null) => chooseProvider(next)}
            aria-label="Provider"
            sx={{ flexWrap: 'wrap' }}
          >
            {current.providers.map((candidate) => (
              <ToggleButton
                key={candidate.id}
                value={candidate.id}
                aria-label={candidate.name}
                sx={{ px: 2.5, py: 1, textTransform: 'none', flexDirection: 'column', alignItems: 'flex-start' }}
              >
                <Typography sx={{ fontWeight: 700 }}>{candidate.name}</Typography>
                <Typography variant="caption" color={candidate.keyConfigured ? 'success.main' : 'text.secondary'}>
                  {candidate.keyConfigured ? 'Key added' : 'No key yet'}
                </Typography>
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          <Stack spacing={1} role="group" aria-label={`${info?.name ?? 'Provider'} key`}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
              <Typography variant="body2" color="text.secondary">
                {info?.name} key: <strong>{keyStatus}</strong>
              </Typography>
              <Link href={KEY_PAGES[provider]} target="_blank" rel="noopener noreferrer" variant="body2">
                Get a key from {info?.name}
                <OpenInNew sx={{ fontSize: 14, ml: 0.5, verticalAlign: 'text-top' }} />
              </Link>
            </Stack>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', maxWidth: 560 }}>
              <TextField
                size="small"
                fullWidth
                type="password"
                label={info?.keyConfigured ? 'Replace the key' : 'API key'}
                value={newKey}
                onChange={(event) => setNewKey(event.target.value)}
                disabled={cannotEncrypt || keyBusy}
                autoComplete="off"
                slotProps={{ htmlInput: { 'data-lpignore': 'true', maxLength: 500 } }}
                helperText={
                  cannotEncrypt
                    ? 'Not possible until the server has API_KEY_ENCRYPTION_SECRET.'
                    : 'Checked with the provider, then kept encrypted. It is never shown again.'
                }
              />
              <Button
                variant="outlined"
                disabled={!newKey.trim() || cannotEncrypt || keyBusy}
                onClick={() => saveKey.mutate({ provider, key: newKey.trim() }, { onSuccess: () => setNewKey('') })}
                sx={{ minWidth: 96, height: 40, flexShrink: 0 }}
              >
                {saveKey.isPending ? 'Checking…' : 'Save key'}
              </Button>
            </Stack>
            {info?.keyConfigured && (
              <Button
                size="small"
                color="error"
                disabled={keyBusy}
                onClick={() => removeKey.mutate(provider)}
                sx={{ alignSelf: 'flex-start' }}
              >
                Remove saved key
              </Button>
            )}
          </Stack>
        </Step>

        <Step number={2} title="Model">
          {!info?.keyConfigured ? (
            <Alert severity="info">Add a key for {info?.name ?? 'the provider'} in step 1 to see its models.</Alert>
          ) : models.isFetching && !models.data ? (
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <CircularProgress size={18} aria-label="Loading the models" />
              <Typography variant="body2" color="text.secondary">
                Loading {info.name}&apos;s models…
              </Typography>
            </Stack>
          ) : !listed ? (
            <Alert severity="warning">
              {info.name}&apos;s models could not be listed. Check that its key is valid, or try again later.
            </Alert>
          ) : (
            <>
              {choices.length > 0 && (
                <RadioGroup
                  aria-label="Model"
                  value={inChoices ? model : ''}
                  onChange={(event) => setDraft((previous) => ({ ...previous, model: event.target.value }))}
                >
                  <Stack spacing={1}>
                    {choices.map((choice) => (
                      <Box
                        key={choice.id}
                        sx={{
                          border: 1,
                          borderRadius: 2,
                          borderColor: model === choice.id ? 'primary.main' : 'divider',
                          px: 1.5,
                          py: 0.5
                        }}
                      >
                        <FormControlLabel
                          value={choice.id}
                          control={<Radio />}
                          sx={{ width: '100%', m: 0, alignItems: 'flex-start', py: 0.5 }}
                          label={
                            <Box sx={{ pt: 0.75 }}>
                              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                                <Typography sx={{ fontWeight: 700 }}>{choice.title}</Typography>
                                {choice.id === recommended && <Chip size="small" color="primary" label="Recommended" />}
                              </Stack>
                              <Typography variant="body2" color="text.secondary">
                                {choice.description}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {choice.name}
                              </Typography>
                            </Box>
                          }
                        />
                      </Box>
                    ))}
                  </Stack>
                </RadioGroup>
              )}
              {listOpen || choices.length === 0 ? (
                <TextField
                  select
                  label={choices.length ? 'Another model' : 'Model'}
                  value={inChoices ? '' : model}
                  onChange={(event) => setDraft((previous) => ({ ...previous, model: event.target.value }))}
                  slotProps={{
                    select: {
                      displayEmpty: true,
                      // One line once chosen: the name, or the placeholder.
                      renderValue: (value) =>
                        allOptions.find((option) => option.id === value)?.name ??
                        (allOptions.length ? 'Choose a model' : 'No models available')
                    },
                    inputLabel: { shrink: true }
                  }}
                  sx={{ maxWidth: 420 }}
                  helperText="Every model the key can use, newest first."
                >
                  <MenuItem value="" disabled>
                    {allOptions.length ? 'Choose a model' : 'No models available'}
                  </MenuItem>
                  {allOptions.map((option) => (
                    <MenuItem key={option.id} value={option.id}>
                      <ListItemText
                        primary={option.name}
                        secondary={option.name === option.id ? undefined : option.id}
                      />
                    </MenuItem>
                  ))}
                </TextField>
              ) : (
                <Button size="small" onClick={() => setShowAll(true)} sx={{ alignSelf: 'flex-start' }}>
                  Show all models
                </Button>
              )}
            </>
          )}
        </Step>

        <Step number={3} title="Analysis limits">
          <TextField
            label="Tool rounds per answer"
            type="number"
            value={toolRoundsText}
            onChange={(event) => setDraft((previous) => ({ ...previous, toolRounds: event.target.value }))}
            error={roundsError}
            helperText={`Choose ${current.minToolRounds}–${current.maxToolRounds}. More rounds allow more lookups and can increase cost. One round is reserved for the final answer; page-only navigation has a separate allowance.`}
            slotProps={{ htmlInput: { min: current.minToolRounds, max: current.maxToolRounds, step: 1 } }}
            sx={{ maxWidth: 420 }}
          />
          <TextField
            select
            label="Questions per person per day"
            value={allowance}
            onChange={(event) => setDraft((previous) => ({ ...previous, allowance: event.target.value }))}
            slotProps={{
              select: {
                renderValue: (value) =>
                  value === 'custom' ? 'Custom' : `At least ${Number(value) / reservation} questions`
              }
            }}
            sx={{ maxWidth: 420 }}
            helperText={`Each question sets aside up to ${tokens(reservation)} tokens while it is answered and gives back what it did not use, so most people get more questions than this.`}
          >
            {ALLOWANCES.map((questions) => (
              <MenuItem key={questions} value={String(questions * reservation)}>
                <ListItemText
                  primary={`At least ${questions} questions`}
                  secondary={`${tokens(questions * reservation)} tokens`}
                />
              </MenuItem>
            ))}
            <MenuItem value="custom">
              <ListItemText primary="Custom" secondary="A number of tokens" />
            </MenuItem>
          </TextField>
          {allowance === 'custom' && (
            <TextField
              label="Tokens per person per day"
              value={customText}
              onChange={(event) => setDraft((previous) => ({ ...previous, customTokens: event.target.value }))}
              error={Boolean(limitError)}
              slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 13 } }}
              sx={{ maxWidth: 420 }}
              helperText={
                limitError || `At least ${Math.floor(customLimit / reservation)} questions a day at the largest size.`
              }
            />
          )}
        </Step>

        <Panel aria-label="Save">
          <Stack spacing={2} sx={{ p: { xs: 2, sm: 3 } }}>
            <FormControlLabel
              control={
                <Switch
                  checked={enabled}
                  onChange={(event) => setDraft((previous) => ({ ...previous, enabled: event.target.checked }))}
                />
              }
              label="Turn the analyst on for everyone"
            />
            {error && <Alert severity="error">{messageOf(error)}</Alert>}
            {saveSettings.isSuccess && !changed && (
              <Alert severity="success">Saved. It applies to the next question.</Alert>
            )}
            {changed && blocker && <Alert severity="info">{blocker}</Alert>}
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <Button
                variant="contained"
                disabled={!changed || Boolean(limitError) || roundsError || Boolean(blocker) || saveSettings.isPending}
                onClick={save}
              >
                Save
              </Button>
              {changed && !blocker && !limitError && !roundsError && (
                <Typography variant="body2" color="text.secondary">
                  You have unsaved changes.
                </Typography>
              )}
            </Stack>
            <Typography variant="caption" color="text.secondary">
              {current.source === 'default' ? 'Nothing is saved yet: these are the defaults. ' : ''}
              Questions and the results they read are sent to the provider. Keys never leave the server.
            </Typography>
          </Stack>
        </Panel>
      </Stack>
    </>
  );
};

export default AnalystSetup;
