import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { createTheme } from '@mui/material';
import { MobileListHeader, MobileListRow } from './MobileList';
import PageBreadcrumbs from './PageBreadcrumbs';
import ConfigsTable from '../configs/ConfigsTable';
import ComparisonsTable from '../comparisons/ComparisonsTable';
import TrainingDetailHeader from '../training/TrainingDetailHeader';
import type { Comparison, Config, Training } from '../../types';

// Everything here is the phone layout: the compact media query matches.
beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    })
  });
});

afterEach(() => {
  delete (window as { matchMedia?: unknown }).matchMedia;
});

const inRouter = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('MobileListRow', () => {
  it('gives the name the full row, with meta, figures, chips and footer under it', () => {
    inRouter(
      <MobileListRow
        to="/trainings/t1"
        title="A long run name"
        meta="Epoch 99"
        figures={[{ label: 'FPS', value: '13.54' }]}
        chips={['a', 'b', 'c', 'd']}
        footer="Updated today"
      />
    );

    const row = screen.getByRole('link', { name: /A long run name/ });
    expect(row).toHaveAttribute('href', '/trainings/t1');
    expect(row).toHaveTextContent('Epoch 99');
    expect(row).toHaveTextContent('FPS');
    expect(row).toHaveTextContent('13.54');
    expect(screen.getByText('+1')).toBeInTheDocument();
    expect(row).toHaveTextContent('Updated today');
  });

  it('opens something rather than a page when given onClick', () => {
    const onClick = vi.fn();
    inRouter(<MobileListRow title="Config" onClick={onClick} />);

    fireEvent.click(screen.getByRole('button', { name: 'Config' }));
    expect(onClick).toHaveBeenCalled();
  });

  it('is selectable, and runs its actions from a menu', () => {
    const onToggle = vi.fn();
    const onDelete = vi.fn();
    inRouter(
      <MobileListRow
        title="Row"
        onToggle={onToggle}
        selected
        selectLabel="Select row"
        actionsLabel="Actions for row"
        actions={[{ label: 'Delete', onClick: onDelete, danger: true }]}
      />
    );

    expect(screen.getByRole('checkbox', { name: 'Select row' })).toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select row' }));
    expect(onToggle).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Actions for row' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalled();
  });

  it('renders a static row with no link, checkbox or menu', () => {
    inRouter(<MobileListRow title="Static" />);

    expect(screen.getByText('Static')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('MobileListHeader', () => {
  it('selects all, beside its controls', () => {
    const onChange = vi.fn();
    render(
      <MobileListHeader selectAll={{ checked: false, indeterminate: true, onChange, label: 'Select all runs' }}>
        <button>Sort</button>
      </MobileListHeader>
    );

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all runs' }));
    expect(onChange).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Sort' })).toBeInTheDocument();
  });
});

describe('PageBreadcrumbs on a phone', () => {
  it('turns the trail into one link back to the nearest parent', () => {
    inRouter(
      <PageBreadcrumbs
        items={[
          { label: 'Projects', href: '/projects' },
          { label: 'CLFTv2', href: '/projects/clftv2' },
          { label: 'Trainings', href: '/projects/clftv2?tab=trainings' },
          { label: 'A run', current: true }
        ]}
      />
    );

    const back = screen.getByRole('link', { name: 'Trainings' });
    expect(back).toHaveAttribute('href', '/projects/clftv2?tab=trainings');
    expect(screen.queryByText('Projects')).not.toBeInTheDocument();
    expect(screen.queryByText('A run')).not.toBeInTheDocument();
  });

  it('shows nothing where no step of the trail leads anywhere', () => {
    const { container } = inRouter(<PageBreadcrumbs items={[{ label: 'Here' }, { label: 'There', current: true }]} />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe('ConfigsTable on a phone', () => {
  const config = { _id: 'c1', config_name: 'swin_fusion', summary: 'A run', createdAt: '2026-03-12T21:55:00.000Z' } as Config;

  it('lists configs as rows that open their details', () => {
    const onViewDetails = vi.fn();
    render(<ConfigsTable configs={[config]} loading={false} onViewDetails={onViewDetails} />);

    fireEvent.click(screen.getByRole('button', { name: /swin_fusion/ }));
    expect(onViewDetails).toHaveBeenCalledWith(config);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('says so when there are none', () => {
    render(<ConfigsTable configs={[]} loading={false} onViewDetails={vi.fn()} />);

    expect(screen.getByText('No configs uploaded yet')).toBeInTheDocument();
  });
});

describe('ComparisonsTable on a phone', () => {
  const comparison = {
    _id: 'k1',
    uuid: 'u1',
    name: 'Window ablation',
    description: 'All windows',
    type: 'tests',
    itemIds: ['a', 'b'],
    createdAt: '2026-03-12T22:00:00.000Z'
  } as unknown as Comparison;

  const renderTable = (canDelete: boolean) => {
    const props = {
      comparisons: [comparison],
      sortBy: 'createdAt' as const,
      sortOrder: 'desc' as const,
      onSort: vi.fn(),
      onViewComparison: vi.fn(),
      onEditComparison: vi.fn(),
      onDeleteComparison: vi.fn(),
      canDelete: () => canDelete,
      formatTimestamp: () => '12.03.2026',
      getTypeColor: () => 'primary' as const,
      theme: createTheme()
    };
    render(<ComparisonsTable {...props} />);
    return props;
  };

  it('opens a comparison from its row, and edits or deletes it from the menu', () => {
    const props = renderTable(true);

    fireEvent.click(screen.getByRole('button', { name: /^Window ablation/ }));
    expect(props.onViewComparison).toHaveBeenCalledWith(comparison);
    expect(screen.getByText('2 items')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Window ablation' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    expect(props.onEditComparison).toHaveBeenCalledWith(comparison);

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Window ablation' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(props.onDeleteComparison).toHaveBeenCalledWith('k1');
  });

  it('offers no menu on comparisons the viewer cannot change', () => {
    renderTable(false);

    expect(screen.queryByRole('button', { name: /Actions for/ })).not.toBeInTheDocument();
  });
});

describe('TrainingDetailHeader on a phone', () => {
  it('keeps the title and tags, and moves refresh, edit and delete behind ⋮', () => {
    const onEdit = vi.fn();
    const training = { _id: 't1', name: 'A run', tags: ['WAYMO'], status: 'completed' } as unknown as Training;
    inRouter(
      <TrainingDetailHeader
        training={training}
        isAuthenticated
        isLoading={false}
        onRefresh={vi.fn()}
        onEdit={onEdit}
        onDeleteClick={vi.fn()}
      />
    );

    expect(screen.getByRole('heading', { name: 'A run' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'More actions for A run' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalled();
  });
});
