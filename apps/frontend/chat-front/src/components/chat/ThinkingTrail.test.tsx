import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { ThinkingTrail } from './ThinkingTrail';

it('says what a search looked for beside what it did, as plain text', () => {
  render(
    <ThinkingTrail
      entries={[
        { kind: 'read', tool: 'search_visin', done: true, detail: 'autonomous vehicles, driving' },
        { kind: 'read', tool: 'get_project', done: true }
      ]}
    />
  );
  expect(screen.getByText('Searched Visin')).toBeInTheDocument();
  expect(screen.getByText('“autonomous vehicles, driving”')).toBeInTheDocument();
  expect(screen.getByText('Read the project')).toBeInTheDocument();
  expect(screen.queryAllByText(/“/)).toHaveLength(1);
});
it('never reads a search\'s words as markup', () => {
  const { container } = render(
    <ThinkingTrail entries={[{ kind: 'read', tool: 'list_projects', done: false, detail: '<img src=x onerror=alert(1)>' }]} />
  );
  expect(container.querySelector('img')).toBeNull();
  expect(screen.getByText(/<img src=x/)).toBeInTheDocument();
});
