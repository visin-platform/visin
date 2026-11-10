/** A short command that writes a whole question, for the questions asked most. */
export interface SlashCommand {
  name: string;
  /** What it does, shown beside it. */
  hint: string;
  /** What it becomes in the box: a question to read, change, and send. */
  text: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: 'summarize', hint: 'What the results show', text: 'Summarize what the results show, with the numbers behind it.' },
  { name: 'compare', hint: 'Best against final epoch', text: 'Compare the best and the final epoch, and say which to trust.' },
  { name: 'worst', hint: 'Where it does worst', text: 'Where does this model perform worst, and by how much?' },
  { name: 'next', hint: 'What to try next', text: 'What should I try next, given the recorded configuration?' },
  { name: 'explain', hint: 'In plain words', text: 'Explain that in simpler terms.' }
];

/**
 * The commands that fit what has been typed, when the box holds nothing but a slash and the start of a name. Anything
 * else (a sentence, a path, a slash in the middle) is not a command and gets no popup.
 */
export function matchingCommands(value: string, commands: SlashCommand[] = SLASH_COMMANDS): SlashCommand[] {
  const typed = /^\/([a-z]*)$/i.exec(value);
  if (!typed) return [];
  const start = typed[1].toLowerCase();
  return commands.filter((command) => command.name.startsWith(start));
}
