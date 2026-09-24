import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EmptyState, ListRow, PageHeader, Panel, ResponsiveActions, RowIcon, SectionHeading } from '.';

const onPhone = () =>
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

afterEach(() => {
  delete (window as { matchMedia?: unknown }).matchMedia;
});

const inRouter = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('PageHeader', () => {
  it('titles the page, says what it is for, and offers its main action as a button', () => {
    const onClick = vi.fn();
    inRouter(
      <PageHeader title="Projects" subtitle="What projects are." actions={<span>refresh</span>} primaryAction={{ label: 'New project', onClick }} />
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
    expect(screen.getByText('What projects are.')).toBeInTheDocument();
    expect(screen.getByText('refresh')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    expect(onClick).toHaveBeenCalled();
  });

  it('links a main action that leads to a route', () => {
    inRouter(<PageHeader title="Jobs" primaryAction={{ label: 'New job', to: '/jobs/new' }} />);

    expect(screen.getByRole('link', { name: 'New job' })).toHaveAttribute('href', '/jobs/new');
  });

  it('leaves the heading to the layout when given no title', () => {
    inRouter(<PageHeader subtitle="Only a line." />);

    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.getByText('Only a line.')).toBeInTheDocument();
  });

  it('on a phone, keeps a title the app bar shows for screen readers only, and floats the main action', () => {
    onPhone();
    inRouter(<PageHeader title="Projects" hideTitleOnPhone primaryAction={{ label: 'New project', onClick: vi.fn() }} />);

    // Present for assistive technology, clipped out of sight.
    expect(screen.getByRole('heading', { level: 1, name: 'Projects' })).toHaveStyle({ position: 'absolute' });
    expect(screen.getByRole('button', { name: 'New project' })).toHaveClass('MuiFab-root');
  });

  it('on a phone, still shows a title the app bar does not', () => {
    onPhone();
    inRouter(<PageHeader title="A project" />);

    expect(screen.getByRole('heading', { level: 1, name: 'A project' })).not.toHaveStyle({ position: 'absolute' });
  });
});

describe('ListRow', () => {
  it('is one tap target leading to its route', () => {
    inRouter(
      <Panel>
        <ListRow to="/projects/1" leading={<RowIcon color="#4F46E5">i</RowIcon>} title="Project one" secondary="Private" />
      </Panel>
    );

    expect(screen.getByRole('link', { name: /Project one/ })).toHaveAttribute('href', '/projects/1');
    expect(screen.getByText('Private')).toBeInTheDocument();
  });

  it('keeps trailing controls outside the tap target', () => {
    const onClick = vi.fn();
    inRouter(<ListRow onClick={onClick} title="Row" trailing={<button>menu</button>} />);

    const row = screen.getByRole('button', { name: 'Row' });
    expect(row).not.toContainElement(screen.getByRole('button', { name: 'menu' }));
    fireEvent.click(row);
    expect(onClick).toHaveBeenCalled();
  });

  it('links a page elsewhere as a plain anchor, and renders a static row without one', () => {
    inRouter(
      <>
        <ListRow href="https://example.test/x" title="Elsewhere" />
        <ListRow title="Static" />
      </>
    );

    expect(screen.getByRole('link', { name: 'Elsewhere' })).toHaveAttribute('href', 'https://example.test/x');
    expect(screen.queryByRole('button', { name: 'Static' })).not.toBeInTheDocument();
  });
});

describe('SectionHeading and EmptyState', () => {
  it('captions a group with its action beside it', () => {
    render(<SectionHeading id="s" action={<a href="#all">See all</a>}>Recent</SectionHeading>);

    expect(screen.getByRole('heading', { level: 2, name: 'Recent' })).toHaveAttribute('id', 's');
    expect(screen.getByRole('link', { name: 'See all' })).toBeInTheDocument();
  });

  it('says what would be here and how to add the first', () => {
    render(<EmptyState icon={<i />} title="Nothing yet" description="Add one." action={<button>Add</button>} />);

    expect(screen.getByText('Nothing yet')).toBeInTheDocument();
    expect(screen.getByText('Add one.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });
});

describe('ResponsiveActions', () => {
  const actions = (onDelete = vi.fn()) => [
    { label: 'Start labeling', primary: true, to: '/jobs/1/work' },
    { label: 'Edit', onClick: vi.fn() },
    { label: 'Delete', danger: true, onClick: onDelete }
  ];

  it('draws every action as a button on desktop', () => {
    inRouter(<ResponsiveActions actions={actions()} />);

    expect(screen.getByRole('link', { name: 'Start labeling' })).toHaveAttribute('href', '/jobs/1/work');
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument();
  });

  it('on a phone, keeps the leading ones and moves the rest into a menu', () => {
    onPhone();
    const onDelete = vi.fn();
    inRouter(<ResponsiveActions actions={actions(onDelete)} keepOnPhone={1} menuLabel="More for job" />);

    expect(screen.getByRole('link', { name: 'Start labeling' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'More for job' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalled();
  });

  it('can send chores behind the menu on desktop too', () => {
    inRouter(<ResponsiveActions actions={actions()} keepOnDesktop={1} />);

    expect(screen.getByRole('link', { name: 'Start labeling' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeInTheDocument();
  });

  it('renders nothing with no actions', () => {
    const { container } = inRouter(<ResponsiveActions actions={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
