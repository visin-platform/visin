# label-front

Frontend for the Visin labeling platform: the annotation editor and job administration.

- Dev port: `3008`
- Stack: React + Vite + MUI, auth/api-client from `@visin/frontend-core`
- Talks to `label-service` (:5008) for everything job-related and to file-service
  signed URLs for image bytes; auth via the shared `access_token` cookie.

## The editor

An annotator opens a job and the next frame is already on screen. They pick a class
(`1`–`9`), draw a box or paint the mask, and press `Enter`: the frame is saved and the
next one opens. There is no save button.

| Key | |
|---|---|
| `1`–`9` | pick a class |
| `B` / `P` / `E` | box, brush, eraser |
| `[` / `]` | smaller / larger brush |
| `Shift` + paint | paint over other classes (otherwise the brush leaves them alone) |
| `Del` | delete the selected box |
| `Ctrl+Z` / `Ctrl+Shift+Z` | undo / redo |
| `Enter` | done: save, open the next frame |
| `K` | skip this frame |
| `←` / `→` | previous / next frame |
| `V` | cycle LiDAR / radar over the camera frame |
| `A` / `X` | accept / dismiss suggestions |
| `D` | suggest boxes with your model |
| `S` | segment: click the object, right-click what is not it; `Enter`, changing tools/classes, or Done keeps a ready mask |
| `Space` + drag, scroll | pan, zoom · `F` fits the frame |

- **Work is never lost.** Every change is kept on this device (IndexedDB) at once and
  sent about a second later; a closed tab or a dropped connection resumes from there.
  Done waits for what is unsent before it moves on.
- **Suggestions** from an import appear dashed on frames the annotator has not started:
  click a box to accept it, `A` accepts all.
- The editor remembers the tool, class, brush size and sensors per job.
- **A model on your own computer** (optional): the **Model** chip connects the editor to a `visin-infer` server
  running on your GPU (its own repository, `visin-inference`). Your browser talks to it directly — Visin's servers
  never do. Connected, it suggests boxes as each unlabeled frame opens (the classes it knows by name or by a class's
  *model name*; the rest are not shown) and the **Segment** tool turns a click into a mask. If it is off or
  unreachable, nothing changes: you label by hand. The address, token and threshold are kept in this browser.
- **Model class mappings belong to the job.** Managers can edit them after activation from
  **Model → Configure class mappings**, or **job page → More actions → Model class mapping**.
  Enter the detector's name for each box class (for example, `car` for `vehicle`, `person` for `human`),
  or leave it blank for matching by the job class's own name. The editor reports detections that were
  filtered out instead of silently showing an empty frame, and refreshes suggestions after saving a mapping.
- Code lives in `src/editor/`: `EditorDocument` holds the boxes, the mask and the undo
  history outside React (a stroke changes thousands of pixels per move), `EditorCanvas`
  draws and handles pointers, `autosave` and `draftStore` keep the work. `src/localModel/` is the client for the
  model server and the hook that holds its settings.

## Develop

```sh
npm install            # from the repo root
npm run dev --workspace=label-front
npm test --workspace=label-front
npm run test:e2e --workspace=label-front   # playwright
```

Copy `.env.example` to `.env` for local URLs.
