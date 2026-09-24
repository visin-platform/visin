import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ColorModeSetting, useActivePalette, useChartColors, VisinThemeProvider } from '.';
import { chartSeries, COLOR_MODE_STORAGE_KEY, schemes, VISIN_COLORS } from '../../theme';

const prefersDark = (dark: boolean) =>
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: dark && query.includes('dark'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    })
  });

function PaperColour() {
  return <output>{useActivePalette().background.paper}</output>;
}

function ChartColours() {
  const { series, slot, adapt } = useChartColors();
  return (
    <ul>
      <li>{series[0]}</li>
      <li>{slot(9)}</li>
      <li>{adapt(chartSeries.light[2].toUpperCase())}</li>
      <li>{adapt('#123456')}</li>
    </ul>
  );
}

const renderSetting = () =>
  render(
    <VisinThemeProvider>
      <ColorModeSetting />
      <PaperColour />
    </VisinThemeProvider>
  );

beforeEach(() => {
  localStorage.clear();
  // Only the meta: the head also holds Emotion's style tags.
  document.querySelector('meta[name="theme-color"]')?.remove();
  const meta = document.createElement('meta');
  meta.name = 'theme-color';
  meta.content = '#000000';
  document.head.appendChild(meta);
  document.documentElement.removeAttribute('data-color-scheme');
  prefersDark(false);
});

afterEach(() => {
  delete (window as { matchMedia?: unknown }).matchMedia;
});

const themeColor = () => document.querySelector('meta[name="theme-color"]')?.getAttribute('content');

describe('ColorModeSetting', () => {
  it('starts on Auto, following the system', async () => {
    renderSetting();

    expect(screen.getByRole('button', { name: 'Auto' })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-color-scheme', 'light'));
    expect(themeColor()).toBe(VISIN_COLORS.themeColor);
  });

  it('follows a dark system on Auto', async () => {
    prefersDark(true);
    renderSetting();

    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-color-scheme', 'dark'));
    expect(themeColor()).toBe(VISIN_COLORS.themeColorDark);
  });

  it('switches the whole page to dark, and remembers it under the key index.html reads', async () => {
    renderSetting();

    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));

    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-color-scheme', 'dark'));
    expect(localStorage.getItem(COLOR_MODE_STORAGE_KEY)).toBe('dark');
    expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');
    expect(themeColor()).toBe(VISIN_COLORS.themeColorDark);
    // The real value of the scheme showing, for charts and SVG.
    expect(screen.getByRole('status')).toHaveTextContent(schemes.dark.surface.paper);
  });

  it('can go without its own label, inside a row that names it', () => {
    render(
      <VisinThemeProvider>
        <ColorModeSetting label={null} dense />
      </VisinThemeProvider>
    );

    expect(screen.queryByText('Appearance')).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Appearance' })).toBeInTheDocument();
  });
});

describe('useChartColors', () => {
  const colours = () => screen.getAllByRole('listitem').map((item) => item.textContent);

  it('gives the light steps in light, wrapping past the eighth slot', async () => {
    render(
      <VisinThemeProvider>
        <ChartColours />
      </VisinThemeProvider>
    );

    await waitFor(() => expect(document.documentElement).toHaveAttribute('data-color-scheme', 'light'));
    expect(colours()).toEqual([chartSeries.light[0], chartSeries.light[1], chartSeries.light[2], '#123456']);
  });

  it('steps a stored series colour to its dark counterpart, and leaves a chosen one alone', async () => {
    prefersDark(true);
    render(
      <VisinThemeProvider>
        <ChartColours />
      </VisinThemeProvider>
    );

    await waitFor(() => expect(colours()[0]).toBe(chartSeries.dark[0]));
    expect(colours()).toEqual([chartSeries.dark[0], chartSeries.dark[1], chartSeries.dark[2], '#123456']);
  });
});
