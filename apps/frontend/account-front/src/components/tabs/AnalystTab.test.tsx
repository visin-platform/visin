import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import AnalystTab from './AnalystTab';
import type { AnalystModels, AnalystSettings } from '../../types/analyst';

const service = vi.hoisted(() => ({
  capabilities: vi.fn(),
  settings: vi.fn(),
  models: vi.fn(),
  save: vi.fn(),
  saveKey: vi.fn(),
  removeKey: vi.fn(),
  usage: vi.fn(),
  savePrices: vi.fn()
}));
vi.mock('../../services/analystService', () => ({ analystService: service }));
const config = vi.hoisted(() => ({ CHAT_SERVICE_URL: 'https://chat.test' as string | undefined }));
vi.mock('../../config/ConfigProvider', () => ({ getGlobalConfig: () => config }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

const anthropic = {
  id: 'anthropic' as const,
  name: 'Anthropic',
  keyConfigured: true,
  keyHint: '1234'
};
const openai = {
  id: 'openai' as const,
  name: 'OpenAI',
  keyConfigured: false,
  keyHint: null
};
const settings = (overrides: Partial<AnalystSettings> = {}): AnalystSettings => ({
  enabled: true,
  provider: 'anthropic',
  model: '',
  dailyTokenLimit: 800000,
  tokenReservation: 160000,
  toolRounds: 8,
  tokensPerRound: 40000,
  minToolRounds: 2,
  maxToolRounds: 16,
  source: 'default',
  ready: false,
  missing: [],
  providers: [anthropic, openai],
  ...overrides
});
const withProviders = (overrides: Partial<AnalystSettings>, a = {}, o = {}) =>
  settings({
    ...overrides,
    providers: [
      { ...anthropic, ...a },
      { ...openai, ...o }
    ]
  });
const lists: Record<'anthropic' | 'openai', AnalystModels> = {
  anthropic: {
    provider: 'anthropic',
    reachable: true,
    recommended: 'claude-sonnet-5-5',
    models: [
      { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', tier: 'best' },
      { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', tier: 'balanced' },
      { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5', tier: 'fast' },
      { id: 'claude-opus-5', name: 'Claude Opus 5' }
    ]
  },
  openai: {
    provider: 'openai',
    reachable: true,
    recommended: 'gpt-5.1',
    models: [
      { id: 'gpt-5.1', name: 'gpt-5.1', tier: 'best' },
      { id: 'gpt-5.1-mini', name: 'gpt-5.1-mini', tier: 'fast' }
    ]
  }
};

const renderTab = (path = '/account/analyst') =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <AnalystTab />
      </MemoryRouter>
    </QueryClientProvider>
  );
const keyField = () => screen.findByLabelText(/^(API key|Replace the key)$/);
const modelChoice = (name: RegExp) => screen.findByRole('radio', { name });
const saveButton = () => screen.getByRole('button', { name: 'Save' });
const pick = async (label: string, option: RegExp | string) => {
  fireEvent.mouseDown(await screen.findByRole('combobox', { name: label }));
  fireEvent.click(await screen.findByRole('option', { name: option }));
};

beforeEach(() => {
  vi.clearAllMocks();
  config.CHAT_SERVICE_URL = 'https://chat.test';
  service.capabilities.mockResolvedValue({ assistant: false, canConfigure: true });
  service.settings.mockResolvedValue(settings());
  service.models.mockImplementation(async (provider: 'anthropic' | 'openai') => lists[provider]);
  service.save.mockImplementation(async (update: object) => settings({ ...update, ready: true, source: 'admin' }));
});

describe('who sees it', () => {
  it('explains, rather than showing a form, to someone who is not an administrator', async () => {
    service.capabilities.mockResolvedValue({ assistant: true, canConfigure: false });
    renderTab();
    expect(await screen.findByText('Only administrators can change the analyst settings.')).toBeInTheDocument();
    expect(service.settings).not.toHaveBeenCalled();
  });

  it('says so when chat is not set up, without asking anyone anything', async () => {
    config.CHAT_SERVICE_URL = undefined;
    renderTab();
    expect(await screen.findByText('Chat is not set up for this deployment.')).toBeInTheDocument();
    expect(service.capabilities).not.toHaveBeenCalled();
  });

  it('says when chat could not be reached, and why the settings could not be read', async () => {
    service.capabilities.mockRejectedValue(new Error('offline'));
    const first = renderTab();
    expect(await screen.findByText(/Chat could not be reached/)).toBeInTheDocument();
    first.unmount();
    service.capabilities.mockResolvedValue({ assistant: false, canConfigure: true });
    service.settings.mockRejectedValue(new Error('Forbidden'));
    renderTab();
    expect(await screen.findByText('Forbidden')).toBeInTheDocument();
  });
});

describe('the setup checklist', () => {
  it('shows what is done and what is left, from what is saved', async () => {
    renderTab();
    const steps = within(await screen.findByRole('list', { name: 'Setup steps' }));
    expect(screen.getByText('Not ready yet')).toBeInTheDocument();
    expect(within(steps.getByText('A key for Anthropic').closest('li')!).getByTitle('Done')).toBeInTheDocument();
    expect(within(steps.getByText('A model chosen and saved').closest('li')!).getByTitle('To do')).toBeInTheDocument();
  });

  it('says when the analyst is answering, and when it is off', async () => {
    service.settings.mockResolvedValue(settings({ model: 'claude-sonnet-5-5', ready: true, source: 'admin' }));
    const first = renderTab();
    expect(await screen.findByText('Answering questions')).toBeInTheDocument();
    first.unmount();
    service.settings.mockResolvedValue(settings({ enabled: false, source: 'admin' }));
    renderTab();
    expect(await screen.findByText('Switched off')).toBeInTheDocument();
  });

  it('lists what only the server operator can add, and cannot keep a key without the secret', async () => {
    service.settings.mockResolvedValue(settings({ missing: ['API_KEY_ENCRYPTION_SECRET', 'MCP_INTERNAL_URL'] }));
    renderTab();
    expect(await screen.findByText('API_KEY_ENCRYPTION_SECRET')).toBeInTheDocument();
    expect(screen.getByText('MCP_INTERNAL_URL')).toBeInTheDocument();
    expect(await keyField()).toBeDisabled();
    expect(screen.getByText(/Not possible until the server has API_KEY_ENCRYPTION_SECRET/)).toBeInTheDocument();
  });
});

describe('choosing a model', () => {
  it('offers kinds of model in words, with the recommended one already chosen, so one Save turns it on', async () => {
    renderTab();
    const balanced = await modelChoice(/Balanced/);
    expect(balanced).toBeChecked();
    expect(screen.getByText('Recommended')).toBeInTheDocument();
    expect(await modelChoice(/Most capable/)).not.toBeChecked();
    expect(await modelChoice(/Fastest/)).not.toBeChecked();
    // The model's own name is there for whoever wants it, but is not what is chosen by.
    expect(screen.getByText('Claude Sonnet 5.5')).toBeInTheDocument();
    expect(screen.getByText('You have unsaved changes.')).toBeInTheDocument();
    fireEvent.click(saveButton());
    await waitFor(() =>
      expect(service.save).toHaveBeenCalledWith({
        enabled: true,
        provider: 'anthropic',
        model: 'claude-sonnet-5-5',
        dailyTokenLimit: 800000,
        toolRounds: 8
      })
    );
    expect(await screen.findByText('Saved. It applies to the next question.')).toBeInTheDocument();
  });

  it('tells an open chat on the page that the settings changed', async () => {
    const heard = vi.fn();
    window.addEventListener('visin:analyst-settings-changed', heard);
    renderTab();
    await modelChoice(/Balanced/);
    fireEvent.click(saveButton());
    await waitFor(() => expect(heard).toHaveBeenCalledTimes(1));
    window.removeEventListener('visin:analyst-settings-changed', heard);
  });

  it('chooses another kind', async () => {
    renderTab();
    fireEvent.click(await modelChoice(/Most capable/));
    fireEvent.click(saveButton());
    await waitFor(() =>
      expect(service.save).toHaveBeenCalledWith(expect.objectContaining({ model: 'claude-opus-5-5' }))
    );
  });

  it('keeps every model one click away, for whoever wants a particular one', async () => {
    renderTab();
    fireEvent.click(await screen.findByRole('button', { name: 'Show all models' }));
    await pick('Another model', /claude-opus-5$/);
    // Picking from the list leaves no kind chosen.
    expect(await modelChoice(/Balanced/)).not.toBeChecked();
    fireEvent.click(saveButton());
    await waitFor(() => expect(service.save).toHaveBeenCalledWith(expect.objectContaining({ model: 'claude-opus-5' })));
  });

  it('shows a saved model that is not one of the kinds in the full list, without replacing it', async () => {
    service.settings.mockResolvedValue(settings({ model: 'claude-retired-1', source: 'admin' }));
    renderTab();
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Another model' })).toHaveTextContent('claude-retired-1')
    );
    expect(saveButton()).toBeDisabled();
  });

  it('asks for a key before showing models, and does not ask the provider without one', async () => {
    service.settings.mockResolvedValue(withProviders({}, { keyConfigured: false, keyHint: null }));
    renderTab();
    expect(await screen.findByText('Add a key for Anthropic in step 1 to see its models.')).toBeInTheDocument();
    expect(service.models).not.toHaveBeenCalled();
    // On, with nothing to answer with: Save says what is missing instead of failing.
    fireEvent.click(screen.getByRole('switch', { name: 'Turn the analyst on for everyone' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Turn the analyst on for everyone' }));
    expect(saveButton()).toBeDisabled();
  });

  it('says when the models could not be listed', async () => {
    service.models.mockResolvedValue({ provider: 'anthropic', models: [], recommended: null, reachable: false });
    renderTab();
    expect(
      await screen.findByText(/Anthropic's models could not be listed. Check that its key is valid/)
    ).toBeInTheDocument();
  });

  it('offers the plain list where a provider has none of the usual kinds', async () => {
    service.models.mockResolvedValue({
      provider: 'anthropic',
      reachable: true,
      recommended: null,
      models: [{ id: 'claude-custom', name: 'Claude Custom' }]
    });
    renderTab();
    await pick('Model', /Claude Custom/);
    fireEvent.click(saveButton());
    await waitFor(() => expect(service.save).toHaveBeenCalledWith(expect.objectContaining({ model: 'claude-custom' })));
  });

  it('says why a save was refused, and leaves the choices as they were', async () => {
    service.save.mockRejectedValue(new Error('Anthropic does not offer claude-opus-5-5'));
    renderTab();
    fireEvent.click(await modelChoice(/Most capable/));
    fireEvent.click(saveButton());
    expect(await screen.findByText('Anthropic does not offer claude-opus-5-5')).toBeInTheDocument();
    expect(await modelChoice(/Most capable/)).toBeChecked();
  });
});

describe('switching provider', () => {
  it("offers that provider's choices, recommends its own, and needs its own key to turn on", async () => {
    service.settings.mockResolvedValue(settings({ model: 'claude-sonnet-5-5', source: 'admin' }));
    renderTab();
    await modelChoice(/Balanced/);
    fireEvent.click(screen.getByRole('button', { name: 'OpenAI' }));
    expect(await screen.findByText('Add a key for OpenAI in step 1 to see its models.')).toBeInTheDocument();
    expect(screen.getByText('Add a key for OpenAI in step 1, or switch the analyst off to save.')).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    expect(screen.getByRole('link', { name: /Get a key from OpenAI/ })).toHaveAttribute(
      'href',
      'https://platform.openai.com/api-keys'
    );
  });

  it('brings the saved model back when switching back to its provider', async () => {
    service.settings.mockResolvedValue(
      withProviders({ model: 'claude-opus-5-5', source: 'admin' }, {}, { keyConfigured: true, keyHint: '5678' })
    );
    renderTab();
    expect(await modelChoice(/Most capable/)).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'OpenAI' }));
    expect(await screen.findByRole('radio', { name: /Most capable.*gpt-5\.1/s })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Anthropic' }));
    expect(await modelChoice(/Most capable/)).toBeChecked();
    expect(saveButton()).toBeDisabled();
  });

  it('saves the other provider with its recommended model', async () => {
    service.settings.mockResolvedValue(
      withProviders({ model: 'claude-sonnet-5-5', source: 'admin' }, {}, { keyConfigured: true, keyHint: '5678' })
    );
    renderTab();
    await modelChoice(/Balanced/);
    fireEvent.click(screen.getByRole('button', { name: 'OpenAI' }));
    await screen.findByText('gpt-5.1-mini');
    fireEvent.click(saveButton());
    await waitFor(() =>
      expect(service.save).toHaveBeenCalledWith({
        enabled: true,
        provider: 'openai',
        model: 'gpt-5.1',
        dailyTokenLimit: 800000,
        toolRounds: 8
      })
    );
  });
});

describe('the daily allowance', () => {
  it('is offered in questions, with the tokens only beside them', async () => {
    service.settings.mockResolvedValue(settings({ model: 'claude-sonnet-5-5', source: 'admin' }));
    renderTab();
    const allowance = await screen.findByRole('combobox', { name: 'Questions per person per day' });
    expect(allowance).toHaveTextContent('At least 5 questions');
    await pick('Questions per person per day', /At least 20 questions/);
    fireEvent.click(saveButton());
    await waitFor(() =>
      expect(service.save).toHaveBeenCalledWith(expect.objectContaining({ dailyTokenLimit: 3200000 }))
    );
  });

  it('takes a custom number of tokens, at least what one question reserves', async () => {
    service.settings.mockResolvedValue(settings({ model: 'claude-sonnet-5-5', source: 'admin' }));
    renderTab();
    await pick('Questions per person per day', /Custom/);
    const field = await screen.findByLabelText('Tokens per person per day');
    for (const [value, message] of [
      ['150000', 'At least 160,000: one question reserves that much.'],
      ['', 'Enter a whole number of tokens.'],
      ['8e5', 'Enter a whole number of tokens.'],
      ['-1', 'Enter a whole number of tokens.']
    ] as const) {
      fireEvent.change(field, { target: { value } });
      expect(screen.getByText(message)).toBeInTheDocument();
      expect(saveButton()).toBeDisabled();
    }
    fireEvent.change(field, { target: { value: '1000000' } });
    expect(screen.getByText('At least 6 questions a day at the largest size.')).toBeInTheDocument();
    fireEvent.click(saveButton());
    await waitFor(() =>
      expect(service.save).toHaveBeenCalledWith(expect.objectContaining({ dailyTokenLimit: 1000000 }))
    );
  });

  it('shows a saved limit that is no preset as custom', async () => {
    service.settings.mockResolvedValue(
      settings({ model: 'claude-sonnet-5-5', source: 'admin', dailyTokenLimit: 1234567 })
    );
    renderTab();
    expect(await screen.findByLabelText('Tokens per person per day')).toHaveValue('1234567');
    expect(screen.queryByText(/Nothing is saved yet/)).toBeNull();
  });
});

describe('provider keys', () => {
  it("shows only a saved key's last characters, or that there is none", async () => {
    const first = renderTab();
    expect(await screen.findByText('Saved here · ends in 1234')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove saved key' })).toBeInTheDocument();
    first.unmount();
    service.settings.mockResolvedValue(withProviders({}, { keyConfigured: false, keyHint: null }));
    renderTab();
    // Beside each provider in the list, and as the status of the key being edited.
    expect(await screen.findAllByText('No key yet')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: 'Remove saved key' })).toBeNull();
  });

  it('saves a pasted key, clears the box, lists the models it makes available, and keeps other edits', async () => {
    service.settings.mockResolvedValue(withProviders({ enabled: false }, { keyConfigured: false, keyHint: null }));
    service.saveKey.mockResolvedValue(withProviders({ enabled: false }, { keyHint: '1234' }));
    renderTab();
    const field = await keyField();
    // Never shown as typed.
    expect(field).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Save key' })).toBeDisabled();
    fireEvent.click(screen.getByRole('switch', { name: 'Turn the analyst on for everyone' }));
    fireEvent.change(field, { target: { value: '  sk-pasted-key-1234  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }));
    await waitFor(() => expect(service.saveKey).toHaveBeenCalledWith('anthropic', 'sk-pasted-key-1234'));
    expect(await screen.findByText('Saved here · ends in 1234')).toBeInTheDocument();
    expect(await screen.findByLabelText('Replace the key')).toHaveValue('');
    expect(screen.getByRole('switch', { name: 'Turn the analyst on for everyone' })).toBeChecked();
    // The key's models arrive, with the recommended one chosen: Save is all that is left.
    expect(await modelChoice(/Balanced/)).toBeChecked();
    expect(saveButton()).toBeEnabled();
  });

  it('removes a saved key', async () => {
    service.removeKey.mockResolvedValue(withProviders({}, { keyConfigured: false, keyHint: null }));
    renderTab();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove saved key' }));
    await waitFor(() => expect(service.removeKey).toHaveBeenCalledWith('anthropic'));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Remove saved key' })).toBeNull());
    expect(screen.getAllByText('No key yet')).toHaveLength(3);
  });

  it('says why a key was refused', async () => {
    service.saveKey.mockRejectedValue(new Error('Anthropic did not accept this key'));
    renderTab();
    fireEvent.change(await keyField(), { target: { value: 'sk-wrong-key-0000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }));
    expect(await screen.findByText('Anthropic did not accept this key')).toBeInTheDocument();
  });

  it("keeps each provider's key separate, and clears a half-typed one on switching", async () => {
    service.saveKey.mockResolvedValue(settings());
    renderTab();
    fireEvent.change(await keyField(), { target: { value: 'sk-half-typed' } });
    fireEvent.click(screen.getByRole('button', { name: 'OpenAI' }));
    expect(await keyField()).toHaveValue('');
    expect(screen.getByText('OpenAI key:')).toBeInTheDocument();
    fireEvent.change(await keyField(), { target: { value: 'sk-openai-key-77' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }));
    await waitFor(() => expect(service.saveKey).toHaveBeenCalledWith('openai', 'sk-openai-key-77'));
  });
});

describe('tool-round settings', () => {
  it('saves the round limit and updates the reservation shown in the allowance', async () => {
    service.settings.mockResolvedValue(
      settings({ model: 'claude-sonnet-5-5', source: 'admin', tokenReservation: 440000 })
    );
    renderTab();
    const rounds = await screen.findByLabelText('Tool rounds per answer');
    expect(rounds).toHaveValue(8);
    fireEvent.change(rounds, { target: { value: '12' } });
    expect(screen.getByText(/sets aside up to 600,000 tokens/)).toBeInTheDocument();
    fireEvent.click(saveButton());
    await waitFor(() =>
      expect(service.save).toHaveBeenCalledWith(expect.objectContaining({ toolRounds: 12, dailyTokenLimit: 800000 }))
    );
  });

  it('rejects fractional or out-of-range rounds and a daily allowance below the new reservation', async () => {
    service.settings.mockResolvedValue(
      settings({ model: 'claude-sonnet-5-5', source: 'admin', tokenReservation: 440000, dailyTokenLimit: 440000 })
    );
    renderTab();
    const rounds = await screen.findByLabelText('Tool rounds per answer');
    for (const value of ['1', '17', '3.5', '']) {
      fireEvent.change(rounds, { target: { value } });
      expect(rounds).toHaveAttribute('aria-invalid', 'true');
      expect(saveButton()).toBeDisabled();
    }
    fireEvent.change(rounds, { target: { value: '12' } });
    expect(screen.getByText('At least 600,000: one question reserves that much.')).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });
});
