import type { IBoxObject } from '../models/LabelAnnotation';
import type { IJobClass } from '../models/LabelJob';
import type { RawMask } from '../utils/mask';
import type { FormatId } from '../validation/jobSchemas';

/**
 * A label format is one module that can write a job's labels out and read a
 * bundle of them back. The editor and the job never see a format: they hold
 * boxes and a class-index mask, and each module converts to and from that at the
 * edge — which is what makes a new format a single file.
 */

export interface ExportJob {
  name: string;
  classes: IJobClass[];
}

/** One frame's labels as the editor holds them: pixel boxes and a class-index mask. */
export interface FrameLabels {
  stem: string;
  /** the path inside the dataset, so formats can name the image the labels belong to */
  path: string;
  width?: number;
  height?: number;
  objects: IBoxObject[];
  mask?: RawMask;
}

export interface ExportFile {
  name: string;
  data: Buffer | string;
}

/**
 * Called once per frame as the export streams, then once at the end for files
 * that need every frame (a COCO `annotations.json`, a YOLO `data.yaml`).
 */
export interface Exporter {
  frame: (frame: FrameLabels) => ExportFile[];
  finish: () => ExportFile[];
}

export interface ImportedBox {
  /** the file's own name for the class; it is matched to a job class afterwards */
  className: string;
  /** `[x, y, width, height]` in pixels */
  bbox: [number, number, number, number];
  score?: number;
}

export interface ImportedFrame {
  stem: string;
  boxes: ImportedBox[];
  /** pixel values index `ImportedLabels.classes` from 1; 0 is unlabeled */
  mask?: RawMask;
  /** The source explicitly labels this frame as empty, rather than losing invalid or unmapped labels. */
  negative?: true;
}

export interface ImportedLabels {
  classes: string[];
  frames: ImportedFrame[];
  /**
   * Frames the file has labels for but the reader could not use because the job
   * has no frame of that name (formats with relative coordinates need its size).
   * Reported as not in the job, rather than vanishing from the count.
   */
  unsized?: string[];
  /** things the file said that could not be used, for the import report */
  warnings: string[];
}

/** The files of an uploaded archive, with any single wrapping folder already removed. */
export interface ImportSource {
  names: string[];
  read: (name: string) => Promise<Buffer>;
}

export interface ImportContext {
  /** the size of a job frame, which formats that store relative coordinates need */
  sizeOf: (stem: string) => { width: number; height: number } | undefined;
}

export interface FormatModule {
  id: FormatId;
  name: string;
  /** one line for the export dialog: what the format is for */
  description: string;
  boxes: boolean;
  masks: boolean;
  /** 0 when the archive is not this format, higher the surer it is */
  detect: (source: ImportSource) => Promise<number>;
  createExporter: (job: ExportJob) => Exporter;
  parse: (source: ImportSource, context: ImportContext) => Promise<ImportedLabels>;
}
