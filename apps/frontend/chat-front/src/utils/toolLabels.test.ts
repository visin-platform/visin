import { expect, it } from 'vitest';
import { toolLabel } from './toolLabels';

it('says what the analyst is doing, and what it did, in words for a person', () => {
  expect(toolLabel('get_training_curve', 'doing')).toBe('Reading the training curve');
  expect(toolLabel('get_training_curve', 'done')).toBe('Read the training curve');
  expect(toolLabel('show_on_screen', 'doing')).toBe('Opening a page');
  expect(toolLabel('list_projects', 'done')).toBe('Found the project');
});

it('has words for every tool the analyst can use', () => {
  for (const tool of [
    'list_projects', 'get_project', 'list_trainings', 'get_training', 'get_training_curve', 'compare_trainings',
    'get_test_results', 'get_benchmarks', 'list_findings', 'get_finding', 'get_paper', 'search_paper', 'read_paper_pages', 'get_screen_context', 'show_on_screen'
  ]) {
    expect(toolLabel(tool, 'doing')).not.toMatch(/_/);
    expect(toolLabel(tool, 'done')).not.toMatch(/_/);
    expect(toolLabel(tool, 'doing')).not.toBe(toolLabel(tool, 'done'));
  }
});

it('reads an unknown tool from its name rather than showing it raw', () => {
  expect(toolLabel('get_new_thing', 'doing')).toBe('Reading get new thing');
  expect(toolLabel('get_new_thing', 'done')).toBe('Read get new thing');
});
