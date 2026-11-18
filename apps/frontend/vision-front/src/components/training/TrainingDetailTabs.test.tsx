import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import TrainingDetailTabs from './TrainingDetailTabs';

describe('TrainingDetailTabs', () => {
  it('renders every tab but Models when the run keeps no model', () => {
    render(<TrainingDetailTabs value="overview" onChange={vi.fn()} />);

    ['Overview', 'Epochs', 'Evaluations', 'Visualizations', 'System Info', 'Config', 'Benchmarks', 'Analysis'].forEach((label) => {
      expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
    });
    expect(screen.queryByRole('tab', { name: 'Models' })).not.toBeInTheDocument();
  });

  it('shows Models after Visualizations when the run keeps one', () => {
    render(<TrainingDetailTabs value="models" onChange={vi.fn()} showModels />);

    const names = screen.getAllByRole('tab').map((tab) => tab.textContent);
    expect(names.slice(3, 5)).toEqual(['Visualizations', 'Models']);
    expect(screen.getByRole('tab', { name: 'Models' })).toHaveAttribute('aria-selected', 'true');
  });

  it('offers Samples, right after Overview, on an inference run only', () => {
    const { unmount } = render(<TrainingDetailTabs value="overview" onChange={vi.fn()} inference />);
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent).slice(0, 3)).toEqual(['Overview', 'Samples', 'Progress']);
    unmount();
    render(<TrainingDetailTabs value="overview" onChange={vi.fn()} />);
    expect(screen.queryByRole('tab', { name: 'Samples' })).not.toBeInTheDocument();
  });

  it('calls the progress points of an inference run Progress, never Epochs', () => {
    render(<TrainingDetailTabs value="epochs" onChange={vi.fn()} inference />);

    expect(screen.getByRole('tab', { name: 'Progress' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('tab', { name: 'Epochs' })).not.toBeInTheDocument();
  });

  it('calls onChange with the clicked tab name', () => {
    const onChange = vi.fn();
    render(<TrainingDetailTabs value="overview" onChange={onChange} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Benchmarks' }));

    expect(onChange).toHaveBeenCalledWith(expect.anything(), 'benchmarks');
  });
});

describe('TrainingDetailTabs on a phone', () => {
  const asPhone = () =>
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query.includes('max-width'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
      }))
    );
  afterEach(() => vi.unstubAllGlobals());

  it('shows three tabs and a More menu holding the rest', () => {
    asPhone();
    render(<TrainingDetailTabs value="overview" onChange={vi.fn()} />);

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Overview', 'Epochs', 'Evaluations', 'More']);

    fireEvent.click(screen.getByRole('tab', { name: 'More' }));
    expect(within(screen.getByRole('menu')).getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Visualizations',
      'System Info',
      'Config',
      'Benchmarks',
      'Analysis'
    ]);
  });

  it('opens a tab from the menu, and names it on the menu’s own tab so the bar still says where it is', () => {
    asPhone();
    const onChange = vi.fn();
    const { rerender } = render(<TrainingDetailTabs value="overview" onChange={onChange} />);

    fireEvent.click(screen.getByRole('tab', { name: 'More' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Config' }));
    expect(onChange).toHaveBeenCalledWith(expect.anything(), 'config');

    rerender(<TrainingDetailTabs value="config" onChange={onChange} />);
    expect(screen.getByRole('tab', { name: 'Config' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('tab', { name: 'More' })).not.toBeInTheDocument();
  });

  it('does not report the menu’s tab as a page', () => {
    asPhone();
    const onChange = vi.fn();
    render(<TrainingDetailTabs value="overview" onChange={onChange} />);

    fireEvent.click(screen.getByRole('tab', { name: 'More' }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('counts Models among the tabs behind the menu when the run keeps one', () => {
    asPhone();
    render(<TrainingDetailTabs value="overview" onChange={vi.fn()} showModels />);

    fireEvent.click(screen.getByRole('tab', { name: 'More' }));

    expect(screen.getByRole('menuitem', { name: 'Models' })).toBeInTheDocument();
  });
});

