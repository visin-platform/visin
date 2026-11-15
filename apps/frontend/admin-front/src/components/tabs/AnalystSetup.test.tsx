import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderPage } from '../../test/render';
import AnalystSetup from './AnalystSetup';
import { analystService } from '../../services/analystService';
import type { AnalystSettings } from '../../types/analyst';

vi.mock('../../services/analystService', () => ({
  analystService: { settings: vi.fn(), models: vi.fn(), save: vi.fn(), saveKey: vi.fn(), removeKey: vi.fn() }
}));
vi.mock('../ViviPublicPage', () => ({ default: () => null }));

const settings = (extra: Partial<AnalystSettings> = {}) =>
  ({
    revision: 3,
    enabled: true,
    provider: 'anthropic',
    model: 'claude-opus-5-5',
    guestModel: '',
    sharedModel: '',
    dailyTokenLimit: 440000,
    toolRounds: 8,
    tokenReservation: 440000,
    tokensPerRound: 40000,
    minToolRounds: 2,
    maxToolRounds: 16,
    source: 'admin',
    ready: true,
    missing: [],
    providers: [
      { id: 'anthropic', name: 'Anthropic', keyConfigured: true, keyHint: 'abcd' },
      { id: 'openai', name: 'OpenAI', keyConfigured: true, keyHint: 'wxyz' }
    ],
    ...extra
  }) as unknown as AnalystSettings;

const listing = {
  provider: 'anthropic',
  reachable: true,
  recommended: 'claude-sonnet-5-5',
  models: [
    { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', tier: 'best' },
    { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', tier: 'balanced' },
    { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5', tier: 'fast' }
  ]
};

const choose = async (label: string, option: string) => {
  fireEvent.mouseDown(await screen.findByRole('combobox', { name: label }));
  fireEvent.click(within(await screen.findByRole('listbox')).getByRole('option', { name: option }));
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(analystService.settings).mockResolvedValue(settings());
  vi.mocked(analystService.models).mockResolvedValue(listing as never);
  vi.mocked(analystService.save).mockResolvedValue(settings() as never);
});

it('offers a cheaper model for visitors and shared conversations, defaulting to the main model, and saves the choice', async () => {
  renderPage(<AnalystSetup />);
  const visitors = await screen.findByRole('combobox', { name: 'Model for visitors' });
  expect(visitors).toHaveTextContent('Same as the main model');
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

  await choose('Model for visitors', 'Claude Haiku 5.5');
  await choose('Model for shared conversations', 'Claude Sonnet 5.5');
  expect(screen.getByText('You have unsaved changes.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(analystService.save).toHaveBeenCalled());
  expect(vi.mocked(analystService.save).mock.calls[0][0]).toMatchObject({
    revision: 3,
    model: 'claude-opus-5-5',
    guestModel: 'claude-haiku-5-5',
    sharedModel: 'claude-sonnet-5-5'
  });
});

it('shows the saved choices, keeps one the provider no longer lists, and returns to the main model when cleared', async () => {
  vi.mocked(analystService.settings).mockResolvedValue(
    settings({ guestModel: 'claude-retired-1', sharedModel: 'claude-haiku-5-5' })
  );
  renderPage(<AnalystSetup />);
  expect(await screen.findByRole('combobox', { name: 'Model for visitors' })).toHaveTextContent('claude-retired-1');
  expect(screen.getByRole('combobox', { name: 'Model for shared conversations' })).toHaveTextContent(
    'Claude Haiku 5.5'
  );
  await choose('Model for visitors', 'Same as the main model');
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(analystService.save).toHaveBeenCalled());
  expect(vi.mocked(analystService.save).mock.calls[0][0]).toMatchObject({
    guestModel: '',
    sharedModel: 'claude-haiku-5-5'
  });
});

it('drops the cheaper models when the provider changes, since they belong to the old one', async () => {
  vi.mocked(analystService.settings).mockResolvedValue(settings({ guestModel: 'claude-haiku-5-5' }));
  renderPage(<AnalystSetup />);
  await screen.findByRole('combobox', { name: 'Model for visitors' });
  fireEvent.click(screen.getByRole('button', { name: 'OpenAI' }));
  await waitFor(() =>
    expect(screen.getByRole('combobox', { name: 'Model for visitors' })).toHaveTextContent('Same as the main model')
  );
});
