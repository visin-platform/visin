import { expect, it } from 'vitest';
import { SLASH_COMMANDS, matchingCommands } from './slashCommands';

const names = (value: string) => matchingCommands(value).map((command) => command.name);

it('offers every command for a lone slash, and narrows as a name is typed', () => {
  expect(names('/')).toEqual(SLASH_COMMANDS.map((command) => command.name));
  expect(names('/s')).toEqual(['summarize']);
  expect(names('/N')).toEqual(['next']);
  expect(names('/summarize')).toEqual(['summarize']);
});

it('offers nothing once what is typed cannot be a command', () => {
  for (const value of ['', 'hello', 'a /s', '/summarize this', '/ s', '/summarize\n', '//', '/path/to', '/zzz', '/1']) {
    expect(names(value)).toEqual([]);
  }
});

it('writes a whole question for each command, and every command is a real, complete one', () => {
  for (const command of SLASH_COMMANDS) {
    expect(command.text.length).toBeGreaterThan(20);
    expect(command.text.endsWith('.') || command.text.endsWith('?')).toBe(true);
    expect(command.hint).toBeTruthy();
  }
  expect(new Set(SLASH_COMMANDS.map((command) => command.name)).size).toBe(SLASH_COMMANDS.length);
});
