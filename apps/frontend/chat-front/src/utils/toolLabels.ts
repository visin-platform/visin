const LABELS: Record<string, [doing: string, done: string]> = {
  list_projects: ['Finding the project', 'Found the project'],
  get_project: ['Opening the project', 'Read the project'],
  list_trainings: ['Listing the runs', 'Listed the runs'],
  get_training: ['Reading the run', 'Read the run'],
  get_training_curve: ['Reading the training curve', 'Read the training curve'],
  compare_trainings: ['Comparing the runs', 'Compared the runs'],
  get_test_results: ['Reading the test results', 'Read the test results'],
  get_benchmarks: ['Reading the benchmarks', 'Read the benchmarks'],
  list_findings: ['Checking saved findings', 'Checked saved findings'],
  get_finding: ['Reading a finding', 'Read a finding'],
  get_paper: ['Opening the paper', 'Opened the paper'],
  search_paper: ['Searching the paper', 'Searched the paper'],
  read_paper_pages: ['Reading the paper', 'Read the paper'],
  get_screen_context: ['Looking at the page', 'Looked at the page'],
  show_on_screen: ['Opening a page', 'Opened a page']
};

/** What the analyst is doing with a tool, in words for a person: `doing` while it works, else what it did. */
export function toolLabel(tool: string, state: 'doing' | 'done'): string {
  const known = LABELS[tool];
  if (known) return known[state === 'doing' ? 0 : 1];
  const name = tool.replaceAll('_', ' ');
  return state === 'doing' ? `Reading ${name}` : `Read ${name}`;
}
