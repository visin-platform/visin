import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AuthUser } from '@visin/frontend-core';

const service = vi.hoisted(() => ({ searchPeople: vi.fn() }));
vi.mock('../../services/paperService', () => ({ paperService: service }));

import AuthorsEditor from './AuthorsEditor';
import { newAuthorDraft, type AuthorDraft } from './authorDraft';
import { renderWithClient } from '../../test/renderWithClient';

const me = { id: 'me1', name: 'Mia Roe', email: 'm@example.test', username: 'mia' } as AuthUser;

const Harness = ({ initial, user = me, onChange }: { initial: AuthorDraft[]; user?: AuthUser | null; onChange?: (next: AuthorDraft[]) => void }) => {
  const [value, setValue] = useState(initial);
  return <AuthorsEditor value={value} user={user} onChange={(next) => { setValue(next); onChange?.(next); }} />;
};

beforeEach(() => {
  vi.resetAllMocks();
  service.searchPeople.mockResolvedValue([{ id: 'u2', handle: 'ben', name: 'Ben Builder' }]);
});

describe('AuthorsEditor', () => {
  it('links a name to an account found by what is typed, and says it waits for that person', async () => {
    const onChange = vi.fn();
    renderWithClient(<Harness initial={[newAuthorDraft({ name: 'Ben B.' })]} onChange={onChange} />);

    await userEvent.type(screen.getByLabelText('Account for author 1'), 'be');
    await userEvent.click(await screen.findByRole('option', { name: /Ben Builder/ }));

    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith([expect.objectContaining({ name: 'Ben B.', person: expect.objectContaining({ id: 'u2', handle: 'ben' }) })]));
    expect(service.searchPeople).toHaveBeenCalledWith('be');
    expect(await screen.findByText(/They will be asked to confirm/)).toBeInTheDocument();
  });

  it('says what stands for a link already confirmed, or to oneself', () => {
    renderWithClient(
      <Harness
        initial={[
          newAuthorDraft({ name: 'Mia', person: { id: 'me1', handle: 'mia', name: 'Mia Roe' } }),
          newAuthorDraft({ name: 'Ben', status: 'confirmed', person: { id: 'u2', handle: 'ben', name: 'Ben Builder' } }),
          newAuthorDraft({ name: 'Hidden', person: { id: 'u3', handle: '', name: '' } })
        ]}
      />
    );

    expect(screen.getByText('That is you: confirmed.')).toBeInTheDocument();
    expect(screen.getByText('Confirmed by them.')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Linked account')).toBeInTheDocument();
  });

  it('adds, orders and removes names, never leaving the paper with none', async () => {
    const onChange = vi.fn();
    renderWithClient(<Harness initial={[newAuthorDraft({ name: 'First' })]} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Remove author 1' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Add author' }));
    await userEvent.type(screen.getByLabelText('Author 2'), 'Second');
    await userEvent.click(screen.getByRole('button', { name: 'Move author 2 up' }));
    expect(onChange.mock.lastCall![0].map((author: AuthorDraft) => author.name)).toEqual(['Second', 'First']);

    await userEvent.click(screen.getByRole('button', { name: 'Remove author 1' }));
    expect(onChange.mock.lastCall![0].map((author: AuthorDraft) => author.name)).toEqual(['First']);
  });

  it('adds the signed-in person, into a blank row if there is one, and only once', async () => {
    const onChange = vi.fn();
    renderWithClient(<Harness initial={[newAuthorDraft()]} onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: 'Add me' }));

    expect(onChange.mock.lastCall![0]).toEqual([expect.objectContaining({ name: 'Mia Roe', status: 'confirmed', person: expect.objectContaining({ id: 'me1' }) })]);
    expect(screen.queryByRole('button', { name: 'Add me' })).not.toBeInTheDocument();
  });

  it('appends the signed-in person after names already written', async () => {
    const onChange = vi.fn();
    renderWithClient(<Harness initial={[newAuthorDraft({ name: 'First' })]} onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: 'Add me' }));

    expect(onChange.mock.lastCall![0]).toHaveLength(2);
  });

  it('has no shortcut for someone who is not signed in', () => {
    renderWithClient(<Harness initial={[newAuthorDraft()]} user={null} />);
    expect(screen.queryByRole('button', { name: 'Add me' })).not.toBeInTheDocument();
  });
});
