# TODO

A review of Visin together with its two Python consumers, `visin-py` (the client library) and `visin-fusion` (the
segmentation pipeline), as of 2026-10-02. The goal it is written against: **a researcher who does not write code can
start, follow, compare and reuse experiments from the browser**, with Visin as the experiment orchestrator and Hugging
Face doing the heavy storage.

Sizes: S (an hour or two), M (a day), L (several days), XL (a week or more). Each item says where the problem is and
when it counts as done.

---

## 0. Bugs

Fixed on 2026-10-02 across `visin`, `visin-py` and `visin-fusion`. The descriptions below preserve the original findings.
Regression, coverage, type, build and browser checks pass; the Python dataset client now checks both service contracts.

Deployment requires releasing and pinning the updated `@visin/backend-core`. Before switching test-result reads,
backfill existing rows with `migrations/2026-10-test-result-parents.mjs` (local and gitignored, per repository policy).
It is dry-run by default; pass `--apply` with `MONGODB_URI` set. Dry run, apply, repeat apply and orphan handling
were verified on an isolated database; deployment data has not been changed.

- [x] **Benchmarks silently lose fields.** (S) *Confirmed: built a `Benchmark` document locally and printed it.*
  `vision-service/src/models/Benchmark.ts` declares `system_info` and each `results[]` item field by field, and
  Mongoose's strict mode drops everything else. Lost today: `batch_size` (in visin-py's own README example and in
  vision-front's `types/benchmark.ts`), `torch_version` (sent by visin-fusion's benchmark stage), and `os`,
  `python_version`, `cpu`, `cuda_version`, `gpu_count`, `gpu_names` from `visin.system_info()`. Any custom
  measurement (`latency_p95_ms`, `energy_j`) disappears too. This contradicts the platform's own rule that results
  are open blobs. The comment in `validation/benchmarkSchemas.ts` documents the stripping as intended.
  *Done when* `results[]` and `system_info` are `Mixed` (keep the known fields as typed reads), a test posts an
  unknown field and reads it back, and the benchmarks page shows unknown numeric fields as extra columns.

- [x] **A pipeline key cannot download any dataset, public ones included.** (S) *Confirmed by reading; not run
  against a live server.* visin-py's `Datasets` sends `VISIN_TOKEN` when it is set
  (`visin-py/src/visin/datasets.py`). On a training machine that is a pipeline key (limited to one project).
  dataset-service mounts `apiKeyAuth('dataset')` first (`dataset-service/src/index.ts`), and backend-core refuses a
  project-limited key outside `vision`/`analysis` with a 403 (`libs/backend-core/src/apiKeys/middleware.ts`,
  `PROJECT_DOMAINS`). That 403 happens before `optionalAuth`, so even a public dataset is refused. visin-fusion's
  `"dataset_root": "visin:zod"` hits it whenever the job has `VISIN_TOKEN` set, which its docs tell you to set.
  *Done when* both sides are fixed: a pipeline key may read public datasets and the datasets of its own project's
  owner (server), and visin-py retries a dataset read without the token on that specific 403 (client). Add a
  visin-py test and a dataset-service integration test.

- [x] **visin-fusion sends tokens to a hard-coded domain.** (S) `visin-fusion/visin_fusion/integrations/visin.py`
  sets `VISIN_URL=https://vision-api.visin.eu` when `VISIN_TOKEN` is set but `VISIN_URL` is not, and
  `data/visin_datasets.py` does the same for `VISIN_DATASET_URL`. Someone running their own Visin who forgets
  `VISIN_URL` sends their pipeline key to another deployment. The platform's rule (CLAUDE.md, "Public URLs come
  from config only") and visin-py's ("No default server address") both forbid this.
  *Done when* there is no fallback. A missing URL is a clear configuration error at stage start, and the docs show
  the env file.

- [x] **Listing test results gets slower as the server grows, and eventually fails.** (M) *By reading.*
  `testResultService.getTestResults` loads the `epoch_uuid` of **every epoch of every visible run** and puts them
  in one `$in`, even when the caller filtered by `training_uuid`. Public projects make this every epoch on the
  server. Each list call costs more as runs accumulate, and the query hits MongoDB's 16 MB limit at a few hundred
  thousand epochs. `TestResult` has no `trainingId`/`projectId` of its own, so every read has to go through epochs.
  *Done when* `TestResult` stores `trainingId` and `projectId` at write time (a one-off backfill goes in
  `/migrations`), reads filter on them, and an integration test covers a project filter.

- [x] **`POST /epochs/batch` can save part of a batch and then report 409.** (S) `createEpochsBatch` uses an ordered
  `insertMany`. A duplicate `epoch_uuid` in the middle keeps the epochs before it, drops the ones after it, and
  answers 409, which clients treat as "already there". Use `ordered: false` and answer with what was inserted and
  what already existed.

- [x] **Runs killed hard stay "running" forever.** (M) visin-py marks a run failed on exceptions and SIGTERM, but
  OOM kills, SIGKILL, node crashes and SLURM walltime kills leave `status: running`. Nothing on the server notices.
  For someone who doesn't read logs, this is the most misleading state the UI can show.
  *Done when* a run stores `lastSeenAt` (refreshed by every epoch, plus a small heartbeat from visin-py's sender
  thread). A sweeper marks runs `stalled` after N minutes of silence (N set per project), and the UI shows
  "stalled — last heard 2 h ago". `stalled` needs adding to the `Training.status` enum and the spec.

- [x] **Configs and benchmarks are stored twice when a request is retried.** (S) The server always generates
  `config_uuid` (`configService.ts`) and benchmarks have no id, so visin-py can't make these writes idempotent
  (documented as a known gap in `visin-py/_internal/reports.py`). Accept a caller-supplied `config_uuid` and a new
  `benchmark_uuid` (unique, 409 on repeat), as epochs and test results already do. Then visin-py sends them.

- [x] **A replayed visualization becomes a second copy.** (S) `upload-url` reserves a new `visualization_uuid` per
  call. A visin-py op replayed from the spool after a lost answer uploads the frame again. Let the client propose
  the uuid (visin-py can derive it from run, epoch and file name), and have the server answer 409 for an existing
  one.

- [x] **A run's `datasetId` is a free-text label, not a reference.** (M) Training stores whatever string the
  script sends. visin-fusion sends the dataset's name (`"zod"`), not the Visin dataset id, so a run can't link to
  its dataset, a dataset can't list the runs trained on it, and a typo is a different dataset.
  *Done when* the run stores `dataset: { source: 'visin' | 'hf' | 'other', id?, name, revision? }`, resolved at
  write time when it names a Visin dataset. visin-fusion records the dataset it actually downloaded
  (`visin:zod` → id + archive version).

- [x] **dataset-service has no OpenAPI spec.** (M) visin-py's contract tests cover only vision-service, so
  `Datasets` is the untested half of the client. That's how the pipeline-key 403 above went unnoticed. Write
  `dataset-service/docs/openapi.yml` the way vision- and auth-service have theirs, publish it at `/docs/api`, and add
  it to visin-py's `tests/contract/`.

---

## 1. Hugging Face as the storage layer

The professor's idea fits how Visin is already built. Visin keeps the *record* (which run, which data, which
config, which scores); bytes that are big, versioned and downloadable live on the Hugging Face Hub. Visin stores a
**pinned reference** to them, never a copy.

Principles, so this stays consistent:

- **One reference type everywhere:** `ArtifactRef = { provider: 'hf' | 'visin' | 'url', repo, revision, path?,
  kind: 'model' | 'dataset' }`. `revision` is a **commit hash**, never `main`, so a run from last year still points
  at the exact bytes it used.
- **Visin never holds a user's HF write token on the server for training-time uploads.** Uploads happen where the
  checkpoint already is (the GPU machine), through visin-py with the user's own `HF_TOKEN`. The server only needs a
  token to *read* private repos for display (optional, per user, encrypted at rest, revocable in account
  settings).
- **Keep Visin's own storage as a fallback, don't remove it.** Visin is self-hosted, and not everything may go to
  HF: dataset licences (Waymo's terms, for one, restrict redistribution), images of people, unpublished work,
  institutes that require data to stay on their servers. The provider is a choice per project, defaulting to
  `visin`.
- **Check HF's current storage limits and pricing for private repos** before committing a lab's data to it. Public
  repos are the cheap path; large private ones may not be.

### 1a. Models on the Hub (start here: highest value, least server work)

- [ ] **visin-py: `run.log_model(path, repo="org/name", epoch=…)`.** (M) Behind a `visin[hf]` extra
  (`huggingface_hub`). Uploads the checkpoint (as `safetensors` when possible), writes a model card, and records an
  `ArtifactRef` on the run and epoch. With no `HF_TOKEN` or `repo`, it records the local path only and changes
  nothing else, like every other visin-py report.
  *Done when* a run's page shows "Model: org/name @ 3f2a1c9" with a link, and the call can't raise into training.
- [ ] **Model cards generated from Visin.** (M) Visin already has what a good card needs: dataset, config, best
  epoch, per-class test scores, benchmark FPS/params. Write it as HF `model-index` metadata, so the Hub shows the
  scores and the model can be found by them. Add a "Publish to Hugging Face" button on a run for the case where the
  checkpoint was uploaded but the card is stale.
- [ ] **visin-fusion: load from the Hub.** (M) `Predictor.from_pretrained("hf://org/clftv2-zod")` and
  `visin-fusion predict --checkpoint hf://…`. Checkpoints already carry `model_info`, which is exactly the
  `config.json` a Hub repo needs. `huggingface_hub.PyTorchModelHubMixin` on the fusion models gives
  `push_to_hub`/`from_pretrained` almost for free. This also closes visin-fusion's own open TODO, "Publish trained
  weights".
- [ ] **Training stage pushes the best checkpoint.** (S, after the two above) A visin-fusion config option
  `General.hub_repo`. At the end of training, the best-by-validation checkpoint goes to the Hub, through
  `run.log_model`.
- [ ] **A model registry page in Visin.** (L) Every run that has a Hub model, per project: name, dataset, best
  score, size, FPS, link. Filter by dataset and by metric. This is the page a non-coder opens to answer "which model
  should I use?"

### 1b. Datasets on the Hub

- [ ] **A dataset can live on HF instead of in a zip.** (L) `Dataset.source = { provider: 'hf', repo, revision }`
  alongside today's zip `archive`. Visin shows the card, size, splits and file list, read from the Hub API. Nothing
  is copied.
- [ ] **`visin download` and visin-fusion's `visin:` prefix resolve HF datasets.** (M) `visin.Datasets.download`
  calls `snapshot_download(repo, revision=…)` for an HF-backed dataset, into the same `VISIN_DATA_DIR` layout with
  the same marker file. visin-fusion configs keep working unchanged (`"dataset_root": "visin:zod"`), and
  `"hf:org/zod-png@rev"` works directly.
- [ ] **"Publish this dataset to Hugging Face".** (M) For a Visin-hosted dataset whose licence allows it. Done by a
  visin-py command run on the user's machine (`visin dataset push <id> --repo org/name`), not by the server, for
  the token reason above. Afterwards the Visin dataset switches to the HF source.
- [ ] **Browsing and labeling HF datasets.** (L, decide later) The labeling workbench needs per-image URLs and
  thumbnails. Options: (a) import from an HF repo instead of a zip upload, keeping thumbnails and images only as a
  cache that can be evicted; (b) serve images straight from the Hub's file URLs, which works for public repos only
  unless the server proxies a token. Start with (a). It reuses the whole import pipeline, and only the download
  step changes.
- [ ] **Label job export → dataset version.** (M) The CSV/JSONL export of a label job becomes a new dataset
  revision (on Visin or HF), which a training can then name. This closes the loop label → train → compare without
  anyone writing a script.

### 1c. Inference

- [ ] **"Try this model" on a run or registry page.** (L) Upload an image (plus LiDAR projection), see the predicted
  mask. Visin's own servers have no GPU and shouldn't need one. Route it to a runner (section 2), or, for public
  models, generate a Gradio **Space** from the model card. A Space is a working demo that can be shared with
  people who have no Visin account.

---

## 2. Visin as the experiment orchestrator (the non-coder part)

Today every run starts with someone typing a command on a GPU machine. A researcher who doesn't code can read
results in Visin but can't make one. This section is the biggest change, and the one that turns Visin from a
tracker into an orchestrator.

- [ ] **Runners.** (XL) `visin runner` (in visin-py) runs on a GPU workstation or a SLURM login node, signs in with
  a new runner key, and asks Visin for queued launches. A launch it accepts becomes `visin-fusion run -c <config>`
  (or `sbatch` with the config), reporting back through the normal visin-py path.
  - Security is the design constraint: **a runner executes only recipes registered on that machine** (a recipe is
    an allow-listed entry point plus a JSON Schema for its parameters), and never a command string from the
    server. The parameters are validated against the schema on both ends.
  - Visin sees runners as online or offline, with their GPUs and queue length.
- [ ] **"New run" form generated from the pipeline's schema.** (L) visin-fusion already exports its config as
  JSON Schema (`visin-fusion schema`). A recipe uploads its schema. Visin renders the form (model, mode, dataset
  picker, epochs, learning rate…) with the presets as starting points, and fills in defaults.
- [ ] **Clone and tweak.** (M, after runners) The config of every run is already stored (`/configs`). A "Run again
  with changes" button on a run opens that form pre-filled. Researchers mostly work this way: change one thing,
  compare.
- [ ] **Sweeps.** (L) Choose 1–3 parameters and their values in the form. Visin queues the grid, tags the runs
  with a sweep id, and opens a comparison of the sweep when it ends. Comparisons and the LaTeX export already
  exist.
- [ ] **Cancel and retry from the UI.** (M) A queued launch can be cancelled. A running one can be asked to stop:
  the runner sends SIGTERM, and visin-py already marks it failed with a reason. A failed one can be retried with
  the same config.
- [ ] **Notifications.** (M) Email (and optionally a webhook) when a run finishes, fails or stalls. Include the best
  score and a link, so people find out without polling the page.
- [ ] **MCP: let an assistant launch a run.** (S, after runners) A `launch_run(recipe, params)` tool behind its own
  scope, off by default and confirmed per call. "Train CLFTv2 on ZOD with window 16 and compare it to last week's
  run" becomes a sentence.

---

## 3. API additions

New endpoints and fields that the sections above need, plus a few that make the libraries simpler. Every one
updates `docs/openapi.yml`, the generated schemas and visin-py's contract tests (CLAUDE.md, "API docs").

- [ ] `ArtifactRef` on `Training`, `Epoch` and `Dataset`. `POST /trainings/{id}/artifacts` and
  `GET /trainings/{id}/artifacts`.
- [ ] `GET /models`: the registry (runs that have a model artifact), filterable by project, dataset and metric, and
  sortable by best score using the taxonomy's `direction`.
- [x] `Training.lastSeenAt`, a `stalled` status, and `POST /trainings/{id}/heartbeat`. Pipeline keys can call it;
  it's cheap and idempotent.
- [ ] `Training.provenance`: git commit, branch, dirty flag, command line, package versions, host. visin-py fills it
  in automatically at `init` (most of this is already gathered for `system_info`). Needed for reproducibility
  without the researcher remembering to write it down.
- [ ] `GET /trainings/{id}/summary`: best epoch per metric (taxonomy direction), final status, dataset, model
  artifact, config id. One call, for the libraries, the MCP server and the "try it" page. The MCP server already
  computes most of this.
- [ ] `/launches`, `/runners`, `/recipes` for section 2. Launches are project-scoped, with the same `contribute`
  rule as writing a run.
- [x] Caller-supplied `config_uuid`, `benchmark_uuid` and `visualization_uuid` (section 0).
- [x] `GET /test-results?trainingId=` without the epoch round-trip, once `TestResult` stores it (section 0).
- [ ] Export a comparison as CSV and XLSX from the API, not only from the browser (`vision-front`'s
  `utils/csvExport.ts`). Researchers take tables to Excel and to their supervisors.

---

## 4. Library integration (visin-py and visin-fusion)

- [ ] **One credential setup.** (M) A researcher now meets `VISIN_URL`, `VISIN_DATASET_URL`, `VISIN_TOKEN`,
  pipeline keys versus user API keys, and soon `HF_TOKEN`. `visin login` exists. Make it the only setup step: it
  asks for the Visin address, discovers the dataset-service address from the server (a new
  `GET /api/.well-known/visin` with service URLs), stores both, and says which key type it got and what that key
  can do.
- [ ] **Copy-paste snippets in the UI.** (S) `FirstRunPanel` covers the first run. Add a "Use this" button on a run
  (Python to load its epochs into pandas), on a dataset (`visin download <id>`), and on a model
  (`Predictor.from_pretrained("hf://…")`). Each snippet is pre-filled with the real ids.
- [ ] **visin-fusion records what it actually used.** (S) Dataset id and revision (section 0), model artifact
  (1a), and the resolved config, not only the preset name.
- [ ] **visin-py `Api` reads what the UI shows.** (M) Findings, comparisons, the project taxonomy (so analysis code
  knows each metric's direction), and the summary endpoint above. Notebooks then need no hand-written REST calls.
- [ ] **Version handshake.** (S) visin-py sends its version (`User-Agent` is enough). The server answers with the
  oldest client it supports, and `visin check` warns about a client that is too old instead of failing on a
  stripped field.

---

## 5. Smaller UX items for non-coders

- [ ] **Explain empty and odd states in words.** "No test results yet: the test stage hasn't run for this run"
  instead of an empty table. "Stalled" (section 0) rather than a forever spinner.
- [ ] **A "best run" badge per project and dataset**, chosen by the taxonomy's metric direction. Show it on the
  project dashboard.
- [ ] **Run notes.** (S) A free-text note on a run (separate from findings), editable in the UI: "this one used
  the relabelled night set". Findings stay for conclusions.
- [ ] **Glossary tooltips** on metric names (mIoU, AP, FPS, FLOPs), defined once in the taxonomy and shown
  wherever the metric is.
