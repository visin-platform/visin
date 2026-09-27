import { describe, expect, it } from 'vitest';
// The docs page itself, so the panel and the docs cannot drift apart unnoticed.
import quickstart from '../../../landing-front/src/docs/content/quickstart.mdx?raw';
import { curlSnippet, pythonSnippet } from './firstRunSnippets';

describe('the first-run snippets', () => {
  it('name the project, and send the quickstart numbers with visin-py', () => {
    const python = pythonSnippet('road-seg');
    expect(python).toContain('visin.init("first run", project="road-seg")');
    expect(python).toContain('run.log_epoch(epoch, train={"loss": train_loss}, val={"loss": val_loss, "mean_iou": val_miou})');
    expect(curlSnippet('p1')).toContain('"projectId": "p1"');
    expect(curlSnippet('p1')).toContain('$VISIN_URL/api/epochs/upload');
  });

  it('stay in step with the docs quickstart', () => {
    // The formula lines, as the docs' train_one_epoch writes them.
    for (const line of [
      'train_loss = 1.2 * math.exp(-epoch / 6) + 0.1 + random.uniform(0, 0.02)',
      'val_loss = train_loss + 0.05 + 0.002 * epoch',
      'val_miou = 0.3 + 0.35 * (1 - math.exp(-epoch / 5))'
    ]) {
      expect(quickstart).toContain(line);
      expect(pythonSnippet('x')).toContain(line);
    }
  });
});
