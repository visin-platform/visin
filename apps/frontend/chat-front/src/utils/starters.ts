/** A question worth asking about where the person is, offered in an empty chat: short to read, whole to send. */
export interface Starter {
  label: string;
  question: string;
}

const ID = '[^/?#]+';
const GENERAL: Starter[] = [
  { label: 'Projects on Visin', question: 'What projects are on Visin?' },
  { label: 'Datasets', question: 'Which datasets does Visin have, and what are they for?' },
  { label: 'Papers', question: 'Which papers on Visin cite recorded results?' },
  { label: 'My latest results', question: 'What changed in my projects recently?' }
];

const on = (path: string, pattern: string) => new RegExp(`^${pattern}$`).test(path);

/**
 * Questions that fit the page beside the chat, taken from its address alone: nothing is read and no model is asked.
 * What a question means ("this run") is settled by the server, which reads the page as the person asking.
 */
export function startersFor(location: string): Starter[] {
  const path = location.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  if (on(path, '/trainings/compare'))
    return [
      { label: 'Which is best?', question: 'Which of these runs is best, and by how much?' },
      { label: 'Where they differ', question: 'Where do these runs differ most?' },
      { label: 'What to try next', question: 'What should I try next, given how these runs compare?' }
    ];
  if (on(path, `/trainings/${ID}`))
    return [
      { label: 'How is this run doing?', question: 'How is this run doing?' },
      { label: 'Did it overfit?', question: 'Did this run overfit? Compare its best and last validation epochs.' },
      { label: 'Compare with the best', question: 'Compare this run with the best run in its project.' },
      { label: 'Where is it weakest?', question: 'Where is this run weakest?' }
    ];
  if (on(path, `/projects/${ID}`))
    return [
      { label: 'Summarise this project', question: 'Summarise this project: what it studies and where it stands.' },
      { label: 'Best run so far', question: 'Which run in this project is best so far, and why?' },
      { label: 'What to try next', question: 'What should I try next in this project?' }
    ];
  if (on(path, `/papers/${ID}`) && path !== '/papers/new')
    return [
      { label: 'Summarise this paper', question: 'Summarise this paper.' },
      { label: 'Results it cites', question: 'Which results does this paper cite on Visin?' },
      { label: 'Do the numbers match?', question: 'Do the numbers in this paper match the recorded runs it cites?' }
    ];
  if (on(path, `/datasets/${ID}`))
    return [
      { label: 'What is in it?', question: 'What is in this dataset?' },
      { label: 'Which runs used it?', question: 'Which runs on Visin used this dataset?' }
    ];
  if (on(path, `/(suites|leaderboards)/${ID}/\\d+(/(compare|judges))?`))
    return [
      { label: 'Who leads?', question: 'Who leads this leaderboard, and by how much?' },
      { label: 'Where are models weakest?', question: 'Which conditions are the models on this leaderboard weakest in?' }
    ];
  if (on(path, `/evaluations/${ID}`))
    return [
      { label: 'Where is it weakest?', question: 'Where is this model weakest on its suite?' },
      { label: 'How does it rank?', question: 'How does this result rank on its suite, and against what?' }
    ];
  if (on(path, '/papers'))
    return [
      { label: 'Papers on Visin', question: 'Which papers are on Visin, and what do they study?' },
      { label: 'Papers with recorded results', question: 'Which papers cite results recorded on Visin?' }
    ];
  if (on(path, '/datasets'))
    return [{ label: 'Which datasets?', question: 'Which datasets does Visin have, and what are they for?' }];
  return GENERAL;
}
