import { expect, it } from 'vitest';
import { followUps } from './followUps';

const run = { projectId: 'p1', trainingIds: ['t1'] };

it('offers up to three questions that suit what is being analysed', () => {
  const offered = followUps(run, []);
  expect(offered).toHaveLength(3);
  expect(offered[0]).toBe('Summarize this run');
});

it('does not offer what has been asked already, whatever the case, and moves on to the next', () => {
  expect(followUps(run, ['summarize this run', '  WHERE DOES THIS MODEL PERFORM WORST?  '])).toEqual([
    'Compare best and final epoch',
    'What should I try next?',
    'Explain that in simpler terms'
  ]);
});

it('never runs out: once the page’s own are used, general ones follow', () => {
  const all = followUps(run, ['Summarize this run', 'Compare best and final epoch', 'Where does this model perform worst?', 'What should I try next?']);
  expect(all).toEqual(['Explain that in simpler terms', 'What should I check before trusting this?']);
  expect(followUps(run, [...all, 'Summarize this run', 'Compare best and final epoch', 'Where does this model perform worst?', 'What should I try next?'])).toEqual([]);
});

it('suits a comparison, a project and a general question', () => {
  expect(followUps({ projectId: 'p1', trainingIds: ['a', 'b'] }, [])[0]).toBe('Which run is best, and by how much?');
  expect(followUps({ projectId: 'p1', trainingIds: [] }, [])[0]).toBe('Summarize the best runs in this project');
  expect(followUps(undefined, [])[0]).toBe('How do I read a validation curve?');
});

it("puts the analyst's own suggestions first, and still leaves out what was already asked", () => {
  const suggested = ['Which condition is run b weakest in?', 'How do they compare at their best epochs?'];
  const offered = followUps(undefined, ['which condition is run b weakest in?'], suggested);
  expect(offered[0]).toBe('How do they compare at their best epochs?');
  expect(offered).not.toContain('Which condition is run b weakest in?');
  expect(offered).toHaveLength(3);
});
