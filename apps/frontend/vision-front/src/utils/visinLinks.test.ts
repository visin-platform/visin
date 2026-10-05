import { describe, expect, it } from 'vitest';
import { parseVisinLink, resultPath } from './visinLinks';

describe('parseVisinLink', () => {
  it.each([
    ['https://visin.example.test/projects/night-seg', { kind: 'project', ref: 'night-seg' }],
    ['https://visin.example.test/projects/night-seg/trainings?tab=runs#top', { kind: 'project', ref: 'night-seg' }],
    ['/projects/507f1f77bcf86cd799439011', { kind: 'project', ref: '507f1f77bcf86cd799439011' }],
    ['https://visin.example.test/trainings/abc123', { kind: 'training', ref: 'abc123' }],
    ['https://visin.example.test/leaderboards/road-test/2', { kind: 'leaderboard', ref: 'road-test@2' }],
    ['https://visin.example.test/leaderboards/road-test/2/e1', { kind: 'leaderboard', ref: 'road-test@2' }],
    ['https://visin.example.test/suites/road-test/3', { kind: 'leaderboard', ref: 'road-test@3' }],
    ['  /projects/with%20space  ', { kind: 'project', ref: 'with space' }],
    ['/projects/100%', { kind: 'project', ref: '100%' }]
  ])('reads %s', (input, expected) => {
    expect(parseVisinLink(input)).toEqual(expected);
  });

  it.each([
    '',
    '   ',
    'https://visin.example.test/',
    'https://visin.example.test/projects',
    'https://visin.example.test/trainings/compare',
    'https://visin.example.test/leaderboards/road-test',
    'https://visin.example.test/leaderboards/road-test/latest',
    'https://visin.example.test/datasets/d1',
    'https://',
    'night-seg'
  ])('does not take %j for a result', (input) => {
    expect(parseVisinLink(input)).toBeNull();
  });
});

describe('resultPath', () => {
  it('leads to where each kind lives in the app', () => {
    expect(resultPath({ kind: 'project', ref: 'p 1' })).toBe('/projects/p%201');
    expect(resultPath({ kind: 'training', ref: 't1' })).toBe('/trainings/t1');
    expect(resultPath({ kind: 'leaderboard', ref: 'road-test@2' })).toBe('/leaderboards/road-test/2');
  });

  it('leads nowhere without something to point at', () => {
    expect(resultPath({ kind: 'project' })).toBeNull();
    expect(resultPath({ kind: 'leaderboard', ref: 'nonsense' })).toBeNull();
  });
});
