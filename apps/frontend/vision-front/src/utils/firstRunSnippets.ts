/**
 * What the first-run panel tells someone to run, with the same numbers as the
 * sample button and the docs quickstart, so all three produce the same run.
 */

/** A pipeline key ignores `project`; an unlimited key needs it. Naming it works for both. */
export const pythonSnippet = (projectRef: string): string =>
  [
    'import math',
    'import random',
    '',
    'import visin',
    '',
    `with visin.init("first run", project="${projectRef}") as run:`,
    '    for epoch in range(1, 21):',
    '        train_loss = 1.2 * math.exp(-epoch / 6) + 0.1 + random.uniform(0, 0.02)',
    '        val_loss = train_loss + 0.05 + 0.002 * epoch',
    '        val_miou = 0.3 + 0.35 * (1 - math.exp(-epoch / 5))',
    '        run.log_epoch(epoch, train={"loss": train_loss}, val={"loss": val_loss, "mean_iou": val_miou})'
  ].join('\n');

export const curlSnippet = (projectId: string): string =>
  [
    'RUN_ID=$(uuidgen)',
    '',
    '# Start the run',
    'curl -fsS "$VISIN_URL/api/trainings" \\',
    '  -H "Authorization: Bearer $VISIN_TOKEN" \\',
    '  -H "Content-Type: application/json" \\',
    `  -d '{"uuid": "'"$RUN_ID"'", "name": "first run", "status": "running", "projectId": "${projectId}"}'`,
    '',
    '# Post an epoch',
    'curl -fsS "$VISIN_URL/api/epochs/upload" \\',
    '  -H "Authorization: Bearer $VISIN_TOKEN" \\',
    '  -H "Content-Type: application/json" \\',
    `  -d '{"training_uuid": "'"$RUN_ID"'", "epoch": 1,`,
    `       "results": {"train": {"loss": 0.92}, "val": {"loss": 0.97, "mean_iou": 0.41}}}'`
  ].join('\n');
