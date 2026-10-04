import mongoose, { Document, Schema } from 'mongoose';

/** Permanent ownership of a deployment-wide suite name, independent of its protocol versions. */
export interface ISuiteSlug extends Document<string> {
  projectId: string;
  createdAt: Date;
}

const SuiteSlugSchema = new Schema<ISuiteSlug>(
  {
    // MongoDB's primary-key index enforces ownership even before application indexes are built.
    _id: { type: String, required: true },
    projectId: { type: String, required: true, immutable: true },
    createdAt: { type: Date, default: Date.now, immutable: true }
  },
  { collection: 'suite_slugs', versionKey: false }
);

export default mongoose.model<ISuiteSlug>('suite_slug', SuiteSlugSchema);
