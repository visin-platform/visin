import mongoose, { Document, Schema, Types } from 'mongoose';
import { VISIBILITIES, type ResourceOwner, type Visibility } from '@visin/backend-core';
import { IProjectTaxonomy, TaxonomySchema } from './taxonomy';
import { CostingSchema, IProjectCosting } from './costing';
import { STORAGE_PROVIDERS, type StorageProvider } from '../services/sourceRegistry';

export interface IProject extends Document {
  _id: Types.ObjectId;
  name: string;
  slug?: string;
  description?: string;
  /** who controls it: a person, or a group whose current roles decide who may do what */
  owner: ResourceOwner;
  /** attribution only: never changes and grants nothing */
  createdBy: string;
  visibility: Visibility;
  /** groups it is shared with for collaboration: their members get `contribute` */
  editorGroupIds?: string[];
  /** set while it is in the trash; its trainings carry the same timestamp */
  trashedAt?: Date;
  taxonomy?: IProjectTaxonomy;
  costing?: IProjectCosting;
  /** where its big files live; absent means `visin` (this deployment's own storage) */
  storage?: { provider: StorageProvider; settings?: Record<string, unknown> };
  stallAfterMinutes?: number;
  createdAt: Date;
  updatedAt: Date;
}

const OwnerSchema = new Schema<ResourceOwner>(
  {
    kind: { type: String, enum: ['user', 'group'], required: true },
    id: { type: String, required: true }
  },
  { _id: false }
);

const ProjectSchema: Schema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    slug: {
      type: String,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 100,
      sparse: true // Allow null/undefined values
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500
    },
    owner: { type: OwnerSchema, required: true },
    createdBy: { type: String, required: true },
    visibility: { type: String, enum: VISIBILITIES, default: 'private', index: true },
    editorGroupIds: { type: [String], default: [], index: true },
    trashedAt: { type: Date },
    taxonomy: {
      type: TaxonomySchema,
      required: false
    },
    storage: {
      type: new Schema({
        provider: { type: String, enum: STORAGE_PROVIDERS, required: true },
        // What the provider keeps about the project: validated by the provider's own schema, so its fields are its own.
        settings: { type: Schema.Types.Mixed }
      }, { _id: false, minimize: false }),
      required: false
    },
    stallAfterMinutes: { type: Number, default: 30, min: 1, max: 10080 },
    costing: {
      type: CostingSchema,
      required: false
    }
  },
  {
    timestamps: true
  }
);

ProjectSchema.index({ 'owner.kind': 1, 'owner.id': 1 });
ProjectSchema.index({ trashedAt: 1 }, { sparse: true });

// Index for searching
ProjectSchema.index({ name: 'text', description: 'text' });

export default mongoose.model<IProject>('Project', ProjectSchema);
