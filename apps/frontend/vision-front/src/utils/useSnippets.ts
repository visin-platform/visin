import { datasetApiOrigin } from '../config/datasetApi';
import { visionApiOrigin } from '../config/visionApi';
import type { Dataset } from '../services/datasetService';
import type { Training } from '../types';
import { shellArgument } from './snippetQuotes';

export interface Snippet {
  title: string;
  /** what to say about it, when the code alone does not */
  note?: string;
  code: string;
}

/** A key is never filled in: it is the reader's own, made under Account → API keys. */
const KEY_PLACEHOLDER = '<an API key from Account → API keys>';

/** Read a run back in a notebook or script, pre-filled with this deployment's address and the run's id. */
export const runSnippets = (training: Pick<Training, 'uuid' | 'name'>): Snippet[] => [
  {
    title: 'Set up once',
    note: 'A user API key with read scopes, or a pipeline key for this run’s project.',
    code: ["pip install 'visin[pandas]'", `export VISIN_URL=${shellArgument(visionApiOrigin())}`, `export VISIN_TOKEN=${shellArgument(KEY_PLACEHOLDER)}`].join('\n')
  },
  {
    title: `Load ${training.name}`,
    note: 'A run’s last epoch is not its result: the summary gives each result’s best epoch beside the last.',
    code: [
      'from visin import Api',
      '',
      'api = Api()',
      `run = api.training(${JSON.stringify(training.uuid)})`,
      'summary = api.summary(run)',
      'for metric in summary.metrics:',
      '    print(metric.path, metric.best_value, "at epoch", metric.best_epoch, "last", metric.last_value)',
      '',
      'frame = api.epochs_frame(run)  # one row per epoch, as a pandas DataFrame'
    ].join('\n')
  }
];

/** Download a dataset to a training machine, pre-filled with this deployment's address and the dataset's id. */
export const datasetSnippets = (dataset: Pick<Dataset, '_id' | 'name' | 'source' | 'archive'>): Snippet[] => {
  const url = datasetApiOrigin();
  const onHub = Boolean(dataset.source);
  return [
    {
      title: 'Set up once',
      note: onHub
        ? 'This dataset is on the Hugging Face Hub: it is downloaded from there at the pinned commit, so the Hub extra is needed, and your own HF_TOKEN for a private repo.'
        : 'A token is only needed for a private dataset.',
      code: [
        onHub ? "pip install 'visin[hf]'" : 'pip install visin',
        ...(url ? [`export VISIN_DATASET_URL=${shellArgument(url)}`] : []),
        `export VISIN_TOKEN=${shellArgument(KEY_PLACEHOLDER)}`
      ].join('\n')
    },
    {
      title: 'Download it',
      note: 'Downloaded once and reused; it resumes if interrupted.',
      code: `visin download ${dataset._id}`
    },
    {
      title: 'From Python',
      code: ['from visin import Datasets', '', 'with Datasets() as datasets:', `    root = datasets.download("${dataset._id}")  # a folder`].join('\n')
    },
    {
      title: 'In a visin-fusion config',
      code: `"Dataset": {"dataset_root": "visin:${dataset._id}"}`
    }
  ];
};
