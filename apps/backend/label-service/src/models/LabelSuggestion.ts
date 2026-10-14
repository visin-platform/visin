import { Schema, model, Document, Types } from 'mongoose';
import type { IAnnotationMask, IBoxObject } from './LabelAnnotation';

/**
 * Labels waiting for an annotator to accept them: what an import brought, or an
 * old job's masks converted. Not annotations — nobody has judged them yet, and
 * they count toward no progress. The editor shows them dashed on a frame the
 * annotator has not labeled.
 */
export interface ILabelSuggestion extends Document {
  _id: Types.ObjectId;
  jobId: Types.ObjectId;
  generation?: string;
  taskId: Types.ObjectId;
  source: 'import';
  objects: IBoxObject[];
  mask?: IAnnotationMask;
  createdAt: Date;
  updatedAt: Date;
}

const LabelSuggestionSchema = new Schema<ILabelSuggestion>(
  {
    jobId: { type: Schema.Types.ObjectId, ref: 'LabelJob', required: true },
    generation: String,
    taskId: { type: Schema.Types.ObjectId, ref: 'LabelTask', required: true },
    source: { type: String, enum: ['import'], default: 'import' },
    objects: {
      type: [
        {
          _id: false,
          id: { type: String, required: true },
          classKey: { type: String, required: true },
          bbox: { type: [Number], required: true },
          source: { type: String, default: 'import' },
          score: { type: Number }
        }
      ],
      default: []
    },
    mask: {
      type: {
        _id: false,
        fileId: { type: String, required: true },
        width: { type: Number, required: true },
        height: { type: Number, required: true },
        pixels: { type: Schema.Types.Mixed, default: {} }
      },
      default: undefined
    }
  },
  { timestamps: true, minimize: false }
);

LabelSuggestionSchema.index({ taskId: 1, source: 1 }, { unique: true });
LabelSuggestionSchema.index({ jobId: 1 });

export const LabelSuggestion = model<ILabelSuggestion>('LabelSuggestion', LabelSuggestionSchema, 'label_suggestions');
