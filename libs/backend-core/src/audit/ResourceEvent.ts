import mongoose, { Schema } from 'mongoose';
import type { ResourceOwner } from '../ownership/types';

export const RESOURCE_EVENT_ACTIONS = ['transfer', 'visibility', 'trash', 'restore', 'purge'] as const;
export type ResourceEventAction = (typeof RESOURCE_EVENT_ACTIONS)[number];

/**
 * Something that changed who controls or can see a resource, or whether it
 * exists: the history a group's owners and admins can read back.
 */
export interface IResourceEvent {
  at: Date;
  /** which service recorded it */
  service: string;
  /** 'project', 'dataset' */
  resourceType: string;
  resourceId: string;
  /** its name when it happened, so the history reads well after a rename or purge */
  resourceName?: string;
  action: ResourceEventAction;
  actorId: string;
  /** a transfer: the owner before and after */
  from?: ResourceOwner;
  to?: ResourceOwner;
  /** a visibility change: the new visibility */
  visibility?: string;
  /** every group this touched, as owner before or after: what a group's history is read by */
  groupIds: string[];
}

const OwnerSchema = new Schema<ResourceOwner>(
  { kind: { type: String, enum: ['user', 'group'], required: true }, id: { type: String, required: true } },
  { _id: false }
);

const ResourceEventSchema = new Schema<IResourceEvent>(
  {
    at: { type: Date, required: true, default: Date.now },
    service: { type: String, required: true },
    resourceType: { type: String, required: true },
    resourceId: { type: String, required: true },
    resourceName: { type: String },
    action: { type: String, required: true, enum: RESOURCE_EVENT_ACTIONS },
    actorId: { type: String, required: true },
    from: { type: OwnerSchema },
    to: { type: OwnerSchema },
    visibility: { type: String },
    groupIds: { type: [String], default: [] }
  },
  { collection: 'resource_events', versionKey: false }
);

// A group's history, newest first.
ResourceEventSchema.index({ groupIds: 1, at: -1 });

/** Guarded against re-registration, as `ApiKey` is: several services import this module. */
export const ResourceEvent = mongoose.models.ResourceEvent
  ? (mongoose.models.ResourceEvent as mongoose.Model<IResourceEvent>)
  : mongoose.model<IResourceEvent>('ResourceEvent', ResourceEventSchema);
