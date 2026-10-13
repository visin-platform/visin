import type { Writable } from 'node:stream';
import { ILabelJob } from '../models/LabelJob';
import { LabelTask } from '../models/LabelTask';
import { LabelAnnotation, ILabelAnnotation, AnnotationStatus } from '../models/LabelAnnotation';
import * as files from '../clients/fileServiceClient';
import { getFormat } from '../formats';
import type { FrameLabels } from '../formats';
import { decodePng } from '../utils/png';
import { ZipWriter } from '../utils/zip';
import type { FormatId } from '../validation/jobSchemas';

/**
 * Stream a job's labels to `out` as a zip in one of the supported formats.
 *
 * One frame at a time: its mask is fetched, converted and written before the
 * next is read, so a 50,000-frame export holds one mask in memory, not all of
 * them. `done` exports what annotators finished; `all` includes frames still in
 * progress. A frame finished with nothing drawn is exported with no objects, which
 * is the negative example a detector needs.
 */
export const streamExport = async (
  job: ILabelJob,
  format: FormatId,
  include: 'done' | 'all',
  out: Writable
): Promise<{ frames: number }> => {
  const exporter = getFormat(format).createExporter({ name: job.name, classes: job.classes });
  const zip = new ZipWriter(out);

  const statuses: AnnotationStatus[] = include === 'all' ? ['done', 'draft'] : ['done'];
  const annotations: ILabelAnnotation[] = await LabelAnnotation.find<ILabelAnnotation>({
    jobId: job._id,
    status: { $in: statuses }
  }).sort({ updatedAt: 1 });
  // Redundant labels: the most recently finished one wins, so an export has one
  // label set per frame and the order is stable between runs.
  const byTask = new Map<string, ILabelAnnotation>();
  for (const annotation of annotations) {
    const key = annotation.taskId.toString();
    const current = byTask.get(key);
    if (!current || current.status !== 'done' || annotation.status === 'done') byTask.set(key, annotation);
  }

  let frames = 0;
  const cursor = LabelTask.find({ jobId: job._id }).sort({ order: 1 }).cursor();
  for await (const task of cursor) {
    const annotation = byTask.get(task._id.toString());
    if (!annotation) continue;
    if (annotation.status !== 'done' && annotation.objects.length === 0 && !annotation.mask) continue;

    let mask: FrameLabels['mask'];
    if (annotation.mask) {
      const png = decodePng(await files.getFile(annotation.mask.fileId));
      mask = { width: png.width, height: png.height, data: Uint8Array.from(png.data) };
    }
    const frame: FrameLabels = {
      stem: task.frame.stem,
      path: task.frame.path,
      width: task.frame.width,
      height: task.frame.height,
      objects: annotation.objects.map((object) => ({
        id: object.id,
        classKey: object.classKey,
        bbox: [...object.bbox] as typeof object.bbox,
        source: object.source,
        ...(object.score !== undefined ? { score: object.score } : {})
      })),
      ...(mask ? { mask } : {})
    };
    for (const file of exporter.frame(frame)) {
      await zip.add(file.name, file.data);
    }
    frames += 1;
  }
  for (const file of exporter.finish()) {
    await zip.add(file.name, file.data);
  }
  await zip.finish();
  return { frames };
};
