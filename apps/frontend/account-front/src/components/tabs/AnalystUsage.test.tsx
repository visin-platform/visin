import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import AnalystTab from './AnalystTab';
import type { AnalystPrice, AnalystPriceRefresh, AnalystUsage } from '../../types/analyst';

const service = vi.hoisted(() => ({
  capabilities: vi.fn(),
  settings: vi.fn(),
  models: vi.fn(),
  usage: vi.fn(),
  savePrices: vi.fn(),
  refreshPrices: vi.fn(),
  backfillPrices: vi.fn()
}));
vi.mock('../../services/analystService', () => ({ analystService: service }));
vi.mock('../../config/ConfigProvider', () => ({ getGlobalConfig: () => ({ CHAT_SERVICE_URL: 'https://chat.test' }) }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

const sonnet: AnalystPrice = {
  provider: 'anthropic',
  model: 'claude-sonnet-5-5',
  inputPerMillion: 3,
  outputPerMillion: 15,
  source: 'manual',
  fetchedAt: null
};
const gpt4o: AnalystPrice = {
  provider: 'openai',
  model: 'gpt-4o',
  inputPerMillion: 2.5,
  outputPerMillion: 10,
  source: 'fetched',
  fetchedAt: '2026-11-01T10:00:00.000Z'
};
const tally = (
  questions: number,
  inputTokens: number,
  outputTokens: number,
  cost: number | null,
  unpricedTokens = 0,
  unpricedQuestions = unpricedTokens > 0 ? 1 : 0
) => ({
  questions,
  inputTokens,
  outputTokens,
  cost,
  unpricedQuestions,
  unpricedTokens
});

/** A model row as a test writes it: the number of prices in the period is 1 unless it says otherwise. */
type ModelRow = Omit<AnalystUsage['byModel'][number], 'pricesInPeriod'> & { pricesInPeriod?: number };

const defaultModels: ModelRow[] = [
  { provider: 'anthropic', model: 'claude-sonnet-5-5', price: sonnet, ...tally(9, 1_260_000, 120_000, 7.5) },
  { provider: 'openai', model: 'gpt-5.1', price: null, ...tally(3, 440_000, 40_000, null, 480_000, 3) }
];

const report = (overrides: Partial<Omit<AnalystUsage, 'byModel'>> & { byModel?: ModelRow[] } = {}): AnalystUsage => ({
  days: 30,
  since: '2026-10-05',
  currency: 'USD',
  totals: tally(12, 1_700_000, 160_000, 7.5, 440_000, 3),
  failedQuestions: 2,
  backfilledQuestions: 0,
  byDay: [
    { day: '2026-11-01', ...tally(5, 800_000, 80_000, 3.6) },
    { day: '2026-11-02', ...tally(7, 900_000, 80_000, 3.9, 440_000) }
  ],
  byPerson: [
    { userId: 'u2', name: 'Grace Hopper', ...tally(8, 1_000_000, 100_000, 5.2) },
    { userId: 'u1', name: 'Ada Admin', ...tally(4, 700_000, 60_000, 2.3, 480_000) }
  ],
  prices: {
    currency: 'USD',
    entries: [sonnet, gpt4o]
  },
  ...overrides,
  // Every model row has priced its questions at one price unless a test says it changed.
  byModel: (overrides.byModel ?? defaultModels).map((row) => ({ pricesInPeriod: 1, ...row }))
});

const Where = () => <div data-testid="where">{useLocation().search}</div>;
const renderUsage = (path = '/account/analyst?view=usage') =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <AnalystTab />
        <Where />
      </MemoryRouter>
    </QueryClientProvider>
  );
const byModel = () => within(screen.getByRole('table', { name: 'Usage by model' }));
const priceBox = (model: string, side: 'input' | 'output') =>
  screen.getByLabelText(`${model} ${side} price per million tokens`);

beforeEach(() => {
  vi.clearAllMocks();
  service.capabilities.mockResolvedValue({ assistant: true, canConfigure: true });
  service.settings.mockResolvedValue({
    enabled: true,
    provider: 'anthropic',
    model: 'claude-sonnet-5-5',
    dailyTokenLimit: 800000,
    tokenReservation: 160000,
    source: 'admin',
    ready: true,
    missing: [],
    providers: []
  });
  service.models.mockResolvedValue({ provider: 'anthropic', models: [], recommended: null, reachable: true });
  service.usage.mockResolvedValue(report());
  service.savePrices.mockImplementation(async (prices: object) => prices);
});

describe('moving between setup and usage', () => {
  it('opens on setup, switches by tab, and keeps the view in the address', async () => {
    renderUsage('/account/analyst');
    const tabs = await screen.findByRole('tablist', { name: 'Analyst' });
    expect(within(tabs).getByRole('tab', { name: 'Setup' })).toHaveAttribute('aria-selected', 'true');
    expect(service.usage).not.toHaveBeenCalled();
    fireEvent.click(within(tabs).getByRole('tab', { name: 'Usage and cost' }));
    expect(await screen.findByText('Estimated spend')).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('?view=usage');
    fireEvent.click(within(tabs).getByRole('tab', { name: 'Setup' }));
    expect(await screen.findByRole('list', { name: 'Setup steps' })).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('');
  });

  it('opens straight on usage from a link, and shows administrators only', async () => {
    const first = renderUsage();
    expect(await screen.findByText('Estimated spend')).toBeInTheDocument();
    first.unmount();
    service.capabilities.mockResolvedValue({ assistant: true, canConfigure: false });
    renderUsage();
    expect(await screen.findByText('Only administrators can change the analyst settings.')).toBeInTheDocument();
    expect(screen.queryByText('Estimated spend')).toBeNull();
  });
});

describe('the totals', () => {
  it('shows the estimated spend in the deployment currency, with what it leaves out', async () => {
    renderUsage();
    const totals = within(await screen.findByRole('region', { name: 'Totals' }));
    expect(totals.getByText('$7.50')).toBeInTheDocument();
    expect(totals.getByText('plus 440K tokens on 3 questions without a price')).toBeInTheDocument();
    expect(totals.getByText('12')).toBeInTheDocument();
    expect(totals.getByText('1.9M')).toBeInTheDocument();
    expect(totals.getByText('1.7M in · 160K out')).toBeInTheDocument();
    expect(totals.getByText('2')).toBeInTheDocument();
    expect(totals.getByText(/Failed or stopped questions may have used tokens/)).toBeInTheDocument();
  });

  it('formats money in whatever currency the prices are in, and keeps cents below one unit', async () => {
    service.usage.mockResolvedValue(report({ currency: 'EUR', totals: tally(1, 1000, 100, 0.0123) }));
    renderUsage();
    const spend = (await screen.findByText('Estimated spend')).parentElement!;
    expect(spend).toHaveTextContent(/0[.,]0123/);
    expect(spend).toHaveTextContent('€');
    expect(spend).not.toHaveTextContent('$');
  });

  it('says money needs prices when none are set, and shows no made-up figure', async () => {
    service.usage.mockResolvedValue(
      report({
        totals: tally(3, 440_000, 40_000, null, 480_000),
        prices: { currency: 'USD', entries: [] },
        byModel: [{ provider: 'openai', model: 'gpt-5.1', price: null, ...tally(3, 440_000, 40_000, null, 480_000) }]
      })
    );
    renderUsage();
    expect(await screen.findByText('Enter prices below to see money')).toBeInTheDocument();
    expect(screen.getByText('No prices are set yet, so only tokens are shown.')).toBeInTheDocument();
    const totals = within(screen.getByRole('region', { name: 'Totals' }));
    expect(totals.getByText('—')).toBeInTheDocument();
  });

  it('says so, and shows no tables, when nothing was asked in the period', async () => {
    service.usage.mockResolvedValue(
      report({ totals: tally(0, 0, 0, null), failedQuestions: 0, byDay: [], byModel: [], byPerson: [] })
    );
    renderUsage();
    expect(await screen.findByText('No questions have been answered in this period yet.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('keeps the report and the period buttons on screen while another period loads', async () => {
    renderUsage();
    await screen.findByText('Estimated spend');
    let release: (value: AnalystUsage) => void = () => undefined;
    service.usage.mockImplementationOnce(() => new Promise<AnalystUsage>((resolve) => (release = resolve)));
    fireEvent.click(screen.getByRole('button', { name: '7 days' }));
    expect(await screen.findByLabelText('Updating')).toBeInTheDocument();
    expect(screen.getByText('Estimated spend')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '90 days' })).toBeInTheDocument();
    release(report({ days: 7, totals: tally(1, 100, 10, 0.5) }));
    await waitFor(() => expect(screen.queryByLabelText('Updating')).toBeNull());
    expect(within(screen.getByRole('region', { name: 'Totals' })).getByText('$0.50')).toBeInTheDocument();
  });

  it('reads the report for the period chosen', async () => {
    renderUsage();
    await screen.findByText('Estimated spend');
    expect(service.usage).toHaveBeenLastCalledWith(30);
    fireEvent.click(screen.getByRole('button', { name: '7 days' }));
    await waitFor(() => expect(service.usage).toHaveBeenLastCalledWith(7));
    fireEvent.click(screen.getByRole('button', { name: '90 days' }));
    await waitFor(() => expect(service.usage).toHaveBeenLastCalledWith(90));
  });

  it('offers a retry when the report could not be read', async () => {
    service.usage.mockRejectedValueOnce(new Error('Forbidden'));
    renderUsage();
    expect(await screen.findByText('Forbidden')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Estimated spend')).toBeInTheDocument();
  });
});

describe('the breakdowns', () => {
  it('lists each model with its tokens, price boxes and cost, and flags what is unpriced', async () => {
    renderUsage();
    await screen.findByText('Estimated spend');
    const rows = byModel().getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('claude-sonnet-5-5')).toBeInTheDocument();
    expect(within(rows[0]).getByText('1,260,000 / 120,000')).toBeInTheDocument();
    expect(within(rows[0]).getByText('$7.50')).toBeInTheDocument();
    expect(priceBox('claude-sonnet-5-5', 'input')).toHaveValue('3');
    expect(priceBox('claude-sonnet-5-5', 'output')).toHaveValue('15');
    expect(within(rows[1]).getByText('gpt-5.1')).toBeInTheDocument();
    expect(within(rows[1]).getByText('—')).toBeInTheDocument();
    expect(priceBox('gpt-5.1', 'input')).toHaveValue('');
  });

  it('lists the days newest first, and the people with what they cost', async () => {
    renderUsage();
    const days = within(await screen.findByRole('table', { name: 'Usage by day' }));
    const dayRows = days.getAllByRole('row').slice(1);
    expect(dayRows[0]).toHaveTextContent(/Nov 2/);
    expect(dayRows[1]).toHaveTextContent(/Nov 1/);
    expect(dayRows[0]).toHaveTextContent('+ 440K tokens unpriced');
    const people = within(screen.getByRole('table', { name: 'Usage by person' }))
      .getAllByRole('row')
      .slice(1);
    expect(people[0]).toHaveTextContent('Grace Hopper');
    expect(people[0]).toHaveTextContent('$5.20');
    expect(people[1]).toHaveTextContent('Ada Admin');
  });
});

describe('entering prices', () => {
  it('saves a price for a model, keeping the prices of models not shown, in the currency chosen', async () => {
    renderUsage();
    await screen.findByText('Estimated spend');
    const save = screen.getByRole('button', { name: 'Save prices' });
    expect(save).toBeDisabled();
    fireEvent.change(priceBox('gpt-5.1', 'input'), { target: { value: '1.25' } });
    fireEvent.change(priceBox('gpt-5.1', 'output'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Currency'), { target: { value: 'eur' } });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() =>
      expect(service.savePrices).toHaveBeenCalledWith({
        currency: 'EUR',
        entries: [
          // Not used in this period, so not shown, and kept exactly as it was, fetched or typed.
          gpt4o,
          // Shown and left alone: it keeps its source.
          sonnet,
          {
            provider: 'openai',
            model: 'gpt-5.1',
            inputPerMillion: 1.25,
            outputPerMillion: 10,
            source: 'manual',
            fetchedAt: null
          }
        ]
      })
    );
    expect(await screen.findByText('Prices saved.')).toBeInTheDocument();
  });

  it('removes a model price by emptying both boxes', async () => {
    renderUsage();
    await screen.findByText('Estimated spend');
    fireEvent.change(priceBox('claude-sonnet-5-5', 'input'), { target: { value: '' } });
    fireEvent.change(priceBox('claude-sonnet-5-5', 'output'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save prices' }));
    await waitFor(() =>
      expect(service.savePrices).toHaveBeenCalledWith({
        currency: 'USD',
        entries: [gpt4o]
      })
    );
  });

  it('does not save a half-entered or non-numeric price, and says what is wrong', async () => {
    renderUsage();
    await screen.findByText('Estimated spend');
    const save = screen.getByRole('button', { name: 'Save prices' });
    fireEvent.change(priceBox('gpt-5.1', 'input'), { target: { value: '1.25' } });
    expect(
      screen.getByText('Give each model both an input and an output price, or leave both empty.')
    ).toBeInTheDocument();
    expect(save).toBeDisabled();
    for (const bad of ['abc', '-1', '1,5', '1e3']) {
      fireEvent.change(priceBox('gpt-5.1', 'output'), { target: { value: bad } });
      expect(save).toBeDisabled();
    }
    fireEvent.change(priceBox('gpt-5.1', 'output'), { target: { value: '10' } });
    expect(save).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Currency'), { target: { value: 'US' } });
    expect(screen.getByText('Use three letters')).toBeInTheDocument();
    expect(save).toBeDisabled();
  });

  it('says why prices were refused, and keeps what was typed', async () => {
    service.savePrices.mockRejectedValue(new Error('Use a three-letter currency code, such as USD'));
    renderUsage();
    await screen.findByText('Estimated spend');
    fireEvent.change(priceBox('gpt-5.1', 'input'), { target: { value: '1' } });
    fireEvent.change(priceBox('gpt-5.1', 'output'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save prices' }));
    expect(await screen.findByText('Use a three-letter currency code, such as USD')).toBeInTheDocument();
    expect(priceBox('gpt-5.1', 'input')).toHaveValue('1');
  });
});

describe('refreshing prices', () => {
  const refreshed = (refresh: Partial<AnalystPriceRefresh> = {}) => ({
    currency: 'USD',
    entries: [],
    refresh: { updated: ['gpt-5.1'], notFound: [], keptManual: [], fetchedAt: '2026-11-02T10:00:00.000Z', ...refresh }
  });

  it('fetches prices on a click, then shows the new ones and what it did', async () => {
    service.refreshPrices.mockResolvedValue(refreshed());
    renderUsage();
    await screen.findByText('Estimated spend');
    const fetched = {
      provider: 'openai' as const,
      model: 'gpt-5.1',
      inputPerMillion: 1.25,
      outputPerMillion: 10,
      source: 'fetched' as const,
      fetchedAt: '2026-11-02T10:00:00.000Z'
    };
    service.usage.mockResolvedValue(
      report({
        byModel: [{ provider: 'openai', model: 'gpt-5.1', price: fetched, ...tally(3, 440_000, 40_000, 0.95) }]
      })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Refresh prices' }));
    await waitFor(() => expect(service.refreshPrices).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Prices updated for 1 model: gpt-5.1.')).toBeInTheDocument();
    await waitFor(() => expect(priceBox('gpt-5.1', 'input')).toHaveValue('1.25'));
    expect(screen.getByText(/Fetched Nov 2/)).toBeInTheDocument();
  });

  it('says which models the list had no price for, and which of your own prices it kept', async () => {
    service.refreshPrices.mockResolvedValue(
      refreshed({ updated: [], notFound: ['claude-brand-new', 'gpt-x'], keptManual: ['claude-sonnet-5-5'] })
    );
    renderUsage();
    await screen.findByText('Estimated spend');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh prices' }));
    const summary = await screen.findByText(/No prices changed\./);
    expect(summary).toHaveTextContent('The price list has no price for claude-brand-new, gpt-x; enter them by hand.');
    expect(summary).toHaveTextContent('Kept the price you entered for claude-sonnet-5-5.');
  });

  it('says why a refresh failed, such as another currency, and leaves the prices on screen', async () => {
    service.refreshPrices.mockRejectedValue(new Error('The price list is in USD, and prices here are in EUR.'));
    renderUsage();
    await screen.findByText('Estimated spend');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh prices' }));
    expect(await screen.findByText('The price list is in USD, and prices here are in EUR.')).toBeInTheDocument();
    expect(priceBox('claude-sonnet-5-5', 'input')).toHaveValue('3');
  });

  it('is not offered while there are unsaved edits, so they are not lost', async () => {
    renderUsage();
    await screen.findByText('Estimated spend');
    const refresh = screen.getByRole('button', { name: 'Refresh prices' });
    expect(refresh).toBeEnabled();
    fireEvent.change(priceBox('gpt-5.1', 'input'), { target: { value: '1' } });
    expect(refresh).toBeDisabled();
    expect(screen.getByText('Save your changes before refreshing prices.')).toBeInTheDocument();
  });
});

describe('where each price came from', () => {
  it('says whether a price was typed, fetched, or is being edited', async () => {
    service.usage.mockResolvedValue(
      report({
        byModel: [
          { provider: 'anthropic', model: 'claude-sonnet-5-5', price: sonnet, ...tally(9, 1, 1, 0) },
          { provider: 'openai', model: 'gpt-4o', price: gpt4o, ...tally(3, 1, 1, 0) },
          { provider: 'openai', model: 'gpt-5.1', price: null, ...tally(1, 1, 1, null, 2) }
        ]
      })
    );
    renderUsage();
    await screen.findByText('Estimated spend');
    expect(screen.getByText('Entered by hand')).toBeInTheDocument();
    expect(screen.getByText(/Fetched Nov 1/)).toBeInTheDocument();
    fireEvent.change(priceBox('gpt-4o', 'input'), { target: { value: '2' } });
    expect(screen.getByText('Edited')).toBeInTheDocument();
    expect(screen.queryByText(/Fetched Nov 1/)).toBeNull();
  });

  it("makes an edited fetched price the administrator's own, and leaves an untouched one fetched", async () => {
    const fetchedSonnet = { ...sonnet, source: 'fetched' as const, fetchedAt: '2026-10-30T00:00:00.000Z' };
    service.usage.mockResolvedValue(
      report({
        byModel: [
          { provider: 'openai', model: 'gpt-4o', price: gpt4o, ...tally(3, 1, 1, 0) },
          { provider: 'anthropic', model: 'claude-sonnet-5-5', price: fetchedSonnet, ...tally(9, 1, 1, 0) }
        ],
        prices: { currency: 'USD', entries: [gpt4o, fetchedSonnet] }
      })
    );
    renderUsage();
    await screen.findByText('Estimated spend');
    fireEvent.change(priceBox('gpt-4o', 'input'), { target: { value: '2.2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save prices' }));
    await waitFor(() => expect(service.savePrices).toHaveBeenCalled());
    const sent = service.savePrices.mock.calls[0][0].entries as AnalystPrice[];
    expect(sent.find((entry) => entry.model === 'gpt-4o')).toMatchObject({
      inputPerMillion: 2.2,
      source: 'manual',
      fetchedAt: null
    });
    expect(sent.find((entry) => entry.model === 'claude-sonnet-5-5')).toMatchObject({
      source: 'fetched',
      fetchedAt: '2026-10-30T00:00:00.000Z'
    });
  });

  it('keeps a price retyped to the value it already had as it was, with its source, and counts it as no change', async () => {
    service.usage.mockResolvedValue(
      report({
        byModel: [
          { provider: 'openai', model: 'gpt-4o', price: gpt4o, ...tally(3, 1, 1, 0) },
          { provider: 'openai', model: 'gpt-5.1', price: null, ...tally(1, 1, 1, null, 2) }
        ],
        prices: { currency: 'USD', entries: [gpt4o] }
      })
    );
    renderUsage();
    await screen.findByText('Estimated spend');
    const save = screen.getByRole('button', { name: 'Save prices' });
    // Typing the same value back, even written differently, is not a change.
    fireEvent.change(priceBox('gpt-4o', 'input'), { target: { value: '2.50' } });
    fireEvent.change(screen.getByLabelText('Currency'), { target: { value: 'usd' } });
    expect(save).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Refresh prices' })).toBeEnabled();
    // A real change elsewhere lets it be saved, and the retyped one keeps its source.
    fireEvent.change(priceBox('gpt-5.1', 'input'), { target: { value: '1' } });
    fireEvent.change(priceBox('gpt-5.1', 'output'), { target: { value: '2' } });
    fireEvent.click(save);
    await waitFor(() => expect(service.savePrices).toHaveBeenCalled());
    const sent = service.savePrices.mock.calls[0][0].entries as AnalystPrice[];
    expect(sent.find((entry) => entry.model === 'gpt-4o')).toMatchObject({
      source: 'fetched',
      fetchedAt: gpt4o.fetchedAt
    });
    expect(sent.find((entry) => entry.model === 'gpt-5.1')).toMatchObject({ source: 'manual', fetchedAt: null });
  });

  it("shows the price table's currency in the box, not the report's, so mixed currencies are never put in it", async () => {
    service.usage.mockResolvedValue(report({ currency: 'MIXED', totals: tally(2, 1, 1, null) }));
    renderUsage();
    await screen.findByText('Estimated spend');
    expect(screen.getByLabelText('Currency')).toHaveValue('USD');
    expect(screen.getByRole('button', { name: 'Save prices' })).toBeDisabled();
  });
});

describe('prices that change over time', () => {
  it('says when the questions of a model in the period were asked at more than one price', async () => {
    service.usage.mockResolvedValue(
      report({
        byModel: [
          { provider: 'anthropic', model: 'claude-sonnet-5-5', price: sonnet, ...tally(9, 1, 1, 1), pricesInPeriod: 2 }
        ]
      })
    );
    renderUsage();
    await screen.findByText('Estimated spend');
    expect(byModel().getByText('price changed in this period')).toBeInTheDocument();
  });

  it('says nothing about it where every question was asked at the same price', async () => {
    renderUsage();
    await screen.findByText('Estimated spend');
    expect(screen.queryByText('price changed in this period')).toBeNull();
    expect(screen.getByText(/A price applies to questions asked after you set it/)).toBeInTheDocument();
  });

  it('says how many questions were priced afterwards', async () => {
    service.usage.mockResolvedValue(report({ backfilledQuestions: 2, totals: tally(12, 1_700_000, 160_000, 7.5) }));
    renderUsage();
    expect(await screen.findByText('2 priced afterwards, at the price then current')).toBeInTheDocument();
  });

  it('shows no money, and says why, where the prices in the period are in more than one currency', async () => {
    service.usage.mockResolvedValue(report({ currency: 'MIXED', totals: tally(12, 1_700_000, 160_000, null) }));
    renderUsage();
    expect(await screen.findByText(/more than one currency, so there is no total/)).toBeInTheDocument();
    const totals = within(screen.getByRole('region', { name: 'Totals' }));
    expect(totals.getByText('—')).toBeInTheDocument();
    expect(totals.queryByText(/\$|€/)).toBeNull();
  });
});

describe('pricing earlier questions', () => {
  /** A model that has a price now, with questions asked before it did. */
  const earlier = (questions = 1) =>
    report({
      byModel: [
        {
          provider: 'anthropic',
          model: 'claude-haiku-5-5',
          price: { ...sonnet, model: 'claude-haiku-5-5' },
          ...tally(questions, 26847, 2964, null, 29811, questions)
        }
      ],
      totals: tally(questions, 26847, 2964, null, 29811, questions)
    });

  it('offers to price questions asked before their model had a price, and says it is an estimate', async () => {
    service.usage.mockResolvedValue(earlier());
    renderUsage();
    const prompt = await screen.findByText(/1 earlier question was asked before its model had a price/);
    expect(prompt).toHaveTextContent("Price it at today's price?");
    expect(prompt).toHaveTextContent('That is an estimate, since the price then may have been different');
    expect(prompt).toHaveTextContent('marked as priced afterwards');
  });

  it('says it in the plural for more than one', async () => {
    service.usage.mockResolvedValue(earlier(3));
    renderUsage();
    expect(
      await screen.findByText(/3 earlier questions were asked before their model had a price/)
    ).toBeInTheDocument();
  });

  it('prices them on a click, and says how many', async () => {
    service.usage.mockResolvedValue(earlier(2));
    service.backfillPrices.mockResolvedValue({ questions: 2, models: [{ model: 'claude-haiku-5-5', questions: 2 }] });
    renderUsage();
    await screen.findByText(/2 earlier questions were asked/);
    service.usage.mockResolvedValue(report({ backfilledQuestions: 2 }));
    fireEvent.click(screen.getByRole('button', { name: 'Price earlier questions' }));
    await waitFor(() => expect(service.backfillPrices).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Priced 2 earlier questions at today's price.")).toBeInTheDocument();
    expect(screen.queryByText(/earlier questions were asked before/)).toBeNull();
  });

  it('is not offered where no model with a price has earlier questions, such as a model with no price at all', async () => {
    renderUsage();
    await screen.findByText('Estimated spend');
    // The default report has an unpriced model, but it has no price to price them at.
    expect(screen.queryByRole('button', { name: 'Price earlier questions' })).toBeNull();
  });

  it('is not pressed while there are unsaved price edits, and says why a failure happened', async () => {
    service.usage.mockResolvedValue(earlier());
    service.backfillPrices.mockRejectedValue(new Error('Not allowed'));
    renderUsage();
    const button = await screen.findByRole('button', { name: 'Price earlier questions' });
    fireEvent.change(priceBox('claude-haiku-5-5', 'input'), { target: { value: '9' } });
    expect(button).toBeDisabled();
    fireEvent.change(priceBox('claude-haiku-5-5', 'input'), { target: { value: '3' } });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(await screen.findByText('Not allowed')).toBeInTheDocument();
  });
});
