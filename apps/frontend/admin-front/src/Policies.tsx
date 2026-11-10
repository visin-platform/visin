import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControlLabel,
  MenuItem,
  Snackbar,
  Stack,
  Switch,
  TextField,
  Typography
} from '@mui/material';
import PersonLink from './components/PersonLink';
import { useUserNames } from './hooks/useUserNames';
import { formatDateTime } from './utils/dateTime';
import { CheckCircle, RadioButtonUnchecked } from '@mui/icons-material';
import { Panel } from '@visin/frontend-core';
import { admin } from './services/admin';

export type Settings = {
  enabled: boolean;
  dailyRequestLimit: number;
  dailyTokenLimit: number;
  guestEnabled: boolean;
  guestSessionRequests: number;
  guestNetworkRequests: number;
  guestGlobalRequests: number;
  guestDailyBudgetMicros: number;
  guestMonthlyBudgetMicros: number;
};
type UserSettings = Partial<Pick<Settings, 'enabled' | 'dailyRequestLimit' | 'dailyTokenLimit'>>;
interface HistoryEntry {
  actorId: string;
  at: string;
  reason: string;
  before?: Partial<Settings>;
}
/** Which of the deployment's guest settings exist (never their values). */
interface GuestSetup {
  botCheck: boolean;
  networkSecret: boolean;
  trustedProxy: boolean;
  visionService: boolean;
}
interface GlobalPolicy {
  id: 'global';
  revision: number;
  settings: Settings;
  guestSetup?: GuestSetup;
  history: HistoryEntry[];
}
interface UserPolicy {
  id: string;
  revision: number;
  settings: UserSettings;
  inherited: Settings;
  effective: Settings;
  history: HistoryEntry[];
}
type Policy = GlobalPolicy | UserPolicy;

const OBJECT_ID = /^[a-f\d]{24}$/i;
const policyPath = (id: string) => `/vivi/admin/policies${id === 'global' ? '' : `/${id}`}`;
/** Spend ceilings are stored in millionths of a US dollar and edited in dollars. */
const toUsd = (micros: number) => micros / 1_000_000;
const toMicros = (usd: number) => Math.round(usd * 1_000_000);

export default function Policies() {
  const initial = useSearchParams()[0].get('userId') || '';
  const [input, setInput] = useState(initial);
  const [user, setUser] = useState(initial);
  const id = user || 'global';
  const [saved, setSaved] = useState(false);
  const query = useQuery({ queryKey: ['admin-policy', id], queryFn: () => admin<Policy>(policyPath(id)) });
  const invalid = Boolean(input.trim()) && !OBJECT_ID.test(input.trim());
  return (
    // A form of single fields reads badly stretched across a wide page.
    <Stack spacing={3} sx={{ maxWidth: 720 }}>
      <Typography>
        The global policy applies to everyone. A user policy changes only the settings it sets; the rest follow the
        global policy, and turning Vivi off globally turns it off for every account.
      </Typography>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        component="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!invalid) setUser(input.trim());
        }}
      >
        <TextField
          label="User ID (empty for global)"
          value={input}
          error={invalid}
          helperText={invalid ? 'A user ID is 24 hexadecimal characters' : ' '}
          onChange={(e) => setInput(e.target.value)}
        />
        <Button type="submit" disabled={invalid}>
          Load policy
        </Button>
      </Stack>
      {query.isPending ? (
        <CircularProgress aria-label="Loading policy" />
      ) : query.isError ? (
        <Alert severity="error">{query.error.message}</Alert>
      ) : query.data.id === 'global' ? (
        <GlobalEditor
          key={`global:${query.data.revision}`}
          policy={query.data as GlobalPolicy}
          onSaved={() => setSaved(true)}
        />
      ) : (
        <UserEditor
          key={`${query.data.id}:${query.data.revision}`}
          policy={query.data as UserPolicy}
          onSaved={() => setSaved(true)}
        />
      )}
      {/* A saved policy replaces its form with the new revision, so the confirmation lives out here. */}
      <Snackbar
        open={saved}
        autoHideDuration={4000}
        onClose={() => setSaved(false)}
        message="Policy saved. It applies to new questions straight away."
      />
    </Stack>
  );
}

function useSavePolicy(policy: Policy, onSaved: () => void) {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (body: { settings: Partial<Settings>; reason: string }) =>
      admin<Policy>(policyPath(policy.id), 'PUT', { revision: policy.revision, ...body }),
    onSuccess: (saved) => {
      cache.setQueryData(['admin-policy', policy.id], saved);
      onSaved();
    }
  });
}

function GlobalEditor({ policy, onSaved }: { policy: GlobalPolicy; onSaved: () => void }) {
  const [settings, setSettings] = useState(policy.settings);
  const [reason, setReason] = useState('');
  const save = useSavePolicy(policy, onSaved);
  const set = (patch: Partial<Settings>) => setSettings({ ...settings, ...patch });
  const counts: [keyof Settings, string][] = [
    ['dailyRequestLimit', 'Questions per user per UTC day'],
    ['dailyTokenLimit', 'Tokens per user per UTC day'],
    ['guestSessionRequests', 'Guest questions per session per day'],
    ['guestNetworkRequests', 'Guest questions per network per day'],
    ['guestGlobalRequests', 'All guest questions per day']
  ];
  const ceilings: [keyof Settings, string][] = [
    ['guestDailyBudgetMicros', 'Guest daily spend ceiling (USD)'],
    ['guestMonthlyBudgetMicros', 'Guest monthly spend ceiling (USD)']
  ];
  return (
    <Stack spacing={2}>
      <Typography variant="h6">Global Vivi policy · revision {policy.revision}</Typography>
      <FormControlLabel
        label="Vivi access enabled"
        control={<Switch checked={settings.enabled} onChange={(e) => set({ enabled: e.target.checked })} />}
      />
      <FormControlLabel
        label="Anonymous Vivi enabled"
        control={<Switch checked={settings.guestEnabled} onChange={(e) => set({ guestEnabled: e.target.checked })} />}
      />
      <GuestChecklist setup={policy.guestSetup} settings={settings} />
      {counts.map(([key, label]) => (
        <TextField
          key={key}
          type="number"
          label={label}
          value={settings[key]}
          onChange={(e) => set({ [key]: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })}
          slotProps={{ htmlInput: { min: 0, step: 1 } }}
        />
      ))}
      {ceilings.map(([key, label]) => (
        <TextField
          key={key}
          type="number"
          label={label}
          value={toUsd(settings[key] as number)}
          onChange={(e) => set({ [key]: toMicros(Math.max(0, Number(e.target.value) || 0)) })}
          slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
        />
      ))}
      <SaveBar
        reason={reason}
        setReason={setReason}
        save={() => save.mutate({ settings, reason })}
        discard={() => {
          setSettings(policy.settings);
          setReason('');
          save.reset();
        }}
        state={save}
        unchanged={JSON.stringify(settings) === JSON.stringify(policy.settings)}
        blocked={
          settings.guestEnabled && guestMissing(policy.guestSetup, settings).length
            ? `Anonymous Vivi cannot be saved as on yet. Still to do: ${guestMissing(policy.guestSetup, settings).join(', ')}.`
            : undefined
        }
      />
      <History
        history={policy.history}
        restore={(before) => {
          setSettings({ ...policy.settings, ...before });
          setReason('Restore earlier settings');
        }}
      />
    </Stack>
  );
}

function UserEditor({ policy, onSaved }: { policy: UserPolicy; onSaved: () => void }) {
  const [settings, setSettings] = useState<UserSettings>(policy.settings);
  const [reason, setReason] = useState('');
  const save = useSavePolicy(policy, onSaved);
  const nameOf = useUserNames([policy.id]);
  const limit = (key: 'dailyRequestLimit' | 'dailyTokenLimit', label: string) => (
    <TextField
      type="number"
      label={label}
      value={settings[key] ?? ''}
      placeholder={String(policy.inherited[key])}
      helperText={settings[key] === undefined ? `Follows global: ${policy.inherited[key].toLocaleString()}` : ' '}
      onChange={(e) => {
        const next = { ...settings };
        if (e.target.value === '') delete next[key];
        else next[key] = Math.max(0, Math.trunc(Number(e.target.value) || 0));
        setSettings(next);
      }}
      slotProps={{ htmlInput: { min: 0, step: 1 }, inputLabel: { shrink: true } }}
    />
  );
  return (
    <Stack spacing={2}>
      <Typography variant="h6">
        Vivi policy for <PersonLink id={policy.id} label={nameOf(policy.id)} /> · revision {policy.revision}
      </Typography>
      {!policy.inherited.enabled && (
        <Alert severity="warning">Vivi is off in the global policy, so it is off for this account too.</Alert>
      )}
      <TextField
        select
        label="Vivi access"
        value={settings.enabled === undefined ? 'inherit' : settings.enabled ? 'on' : 'off'}
        onChange={(e) => {
          const next = { ...settings };
          if (e.target.value === 'inherit') delete next.enabled;
          else next.enabled = e.target.value === 'on';
          setSettings(next);
        }}
      >
        <MenuItem value="inherit">Follow global ({policy.inherited.enabled ? 'on' : 'off'})</MenuItem>
        <MenuItem value="on">On</MenuItem>
        <MenuItem value="off">Off for this account</MenuItem>
      </TextField>
      {limit('dailyRequestLimit', 'Questions per UTC day')}
      {limit('dailyTokenLimit', 'Tokens per UTC day')}
      <Typography variant="body2" color="text.secondary">
        In force now: {policy.effective.enabled ? 'on' : 'off'}, {policy.effective.dailyRequestLimit.toLocaleString()}{' '}
        questions and {policy.effective.dailyTokenLimit.toLocaleString()} tokens per day. Changing a limit does not reset
        what was already used today.
      </Typography>
      <SaveBar
        reason={reason}
        setReason={setReason}
        save={() => save.mutate({ settings, reason })}
        discard={() => {
          setSettings(policy.settings);
          setReason('');
          save.reset();
        }}
        state={save}
        unchanged={JSON.stringify(settings) === JSON.stringify(policy.settings)}
      />
      <History
        history={policy.history}
        restore={(before) => {
          setSettings({ enabled: before.enabled, dailyRequestLimit: before.dailyRequestLimit, dailyTokenLimit: before.dailyTokenLimit });
          setReason('Restore earlier settings');
        }}
      />
    </Stack>
  );
}

/**
 * Nothing is sent while a switch or a number is being changed: the form only holds the change until it is saved. So
 * the bar says so, and stays in view at the bottom of the screen while there is something unsaved (the form is long),
 * with an optional note for the history, Save, and Discard.
 */
function SaveBar(props: {
  reason: string;
  setReason: (reason: string) => void;
  save: () => void;
  discard: () => void;
  state: { isPending: boolean; isError: boolean; isSuccess: boolean; error: Error | null };
  unchanged: boolean;
  /** Why Save is unavailable beyond having nothing to save, said next to the button. */
  blocked?: string;
}) {
  if (props.unchanged && !props.state.isError) return null;
  return (
    <Panel
      component="section"
      aria-label="Unsaved changes"
      sx={{ position: 'sticky', bottom: 16, zIndex: 2, p: 2, boxShadow: 6, borderColor: 'primary.main' }}
    >
      <Stack spacing={1.5}>
        <Typography sx={{ fontWeight: 700 }}>
          {props.unchanged ? 'This change was not saved' : 'Unsaved changes: nothing is applied until you save'}
        </Typography>
        {props.state.isError && <Alert severity="error">{props.state.error?.message}</Alert>}
        {props.blocked && <Alert severity="warning">{props.blocked}</Alert>}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' } }}>
          <TextField
            size="small"
            label="Note (optional)"
            placeholder="Why this change? Shown in the change history"
            value={props.reason}
            onChange={(e) => props.setReason(e.target.value)}
            sx={{ flex: 1 }}
          />
          <Button onClick={props.discard} disabled={props.state.isPending}>
            Discard
          </Button>
          <Button
            variant="contained"
            disabled={props.state.isPending || props.unchanged || Boolean(props.blocked)}
            onClick={props.save}
          >
            {props.state.isPending ? 'Saving…' : 'Save policy'}
          </Button>
        </Stack>
      </Stack>
    </Panel>
  );
}

function History({ history, restore }: { history: HistoryEntry[]; restore: (before: Partial<Settings>) => void }) {
  const nameOf = useUserNames(history.map((h) => h.actorId));
  return (
    <>
      <Typography variant="h6">Change history</Typography>
      {!history.length && <Typography color="text.secondary">No changes recorded yet.</Typography>}
      {[...history].reverse().map((h) => (
        <Stack key={`${h.at}:${h.actorId}`} direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <Typography>
            {formatDateTime(h.at)} · {nameOf(h.actorId)}{h.reason ? ` · ${h.reason}` : ''}
          </Typography>
          {h.before && <Button onClick={() => restore(h.before!)}>Prepare rollback</Button>}
        </Stack>
      ))}
    </>
  );
}

const SETUP_ITEMS: { key: keyof GuestSetup; label: string; how: string }[] = [
  { key: 'botCheck', label: 'Bot check keys', how: 'TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY in the chat service' },
  { key: 'networkSecret', label: 'Network secret', how: 'GUEST_NETWORK_SECRET, at least 32 characters, in the chat service' },
  { key: 'trustedProxy', label: 'Trusted proxy', how: 'GUEST_TRUSTED_PROXY in the chat service' },
  { key: 'visionService', label: 'Vision service address', how: 'VISION_SERVICE_URL in the chat service' }
];

/** What still stands between this form and anonymous Vivi: the deployment's settings, and the two ceilings below. */
function guestMissing(setup: GuestSetup | undefined, settings: Settings): string[] {
  return [
    ...SETUP_ITEMS.filter((item) => setup && !setup[item.key]).map((item) => item.label),
    ...(settings.guestDailyBudgetMicros > 0 ? [] : ['Daily spend ceiling']),
    ...(settings.guestMonthlyBudgetMicros > 0 ? [] : ['Monthly spend ceiling'])
  ];
}

function GuestChecklist({ setup, settings }: { setup?: GuestSetup; settings: Settings }) {
  const missing = guestMissing(setup, settings);
  const items = [
    ...SETUP_ITEMS.map((item) => ({ label: item.label, done: !setup || setup[item.key], how: item.how })),
    { label: 'Daily spend ceiling above zero', done: settings.guestDailyBudgetMicros > 0, how: 'Set it below, in USD' },
    { label: 'Monthly spend ceiling above zero', done: settings.guestMonthlyBudgetMicros > 0, how: 'Set it below, in USD' }
  ];
  return (
    <Alert severity={missing.length ? 'warning' : 'success'} icon={false}>
      <Typography sx={{ fontWeight: 600, mb: 0.5 }}>
        {missing.length ? 'Before anonymous Vivi can be turned on' : 'Anonymous Vivi can be turned on'}
      </Typography>
      <Typography variant="body2" sx={{ mb: 1 }}>
        Visitors can ask about the public name and description of a public project: no private tools or uploads. The
        worst-case cost of a question is reserved, and kept even when it fails.
      </Typography>
      <Box component="ul" aria-label="Anonymous Vivi requirements" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {items.map((item) => (
          <Box component="li" key={item.label} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', py: 0.25 }}>
            {item.done ? (
              <CheckCircle fontSize="small" color="success" titleAccess="Done" />
            ) : (
              <RadioButtonUnchecked fontSize="small" titleAccess="Still to do" />
            )}
            <Typography variant="body2">
              {item.label}
              {!item.done && (
                <Typography component="span" variant="body2" color="text.secondary">
                  {' '}
                  — {item.how}
                </Typography>
              )}
            </Typography>
          </Box>
        ))}
      </Box>
    </Alert>
  );
}
