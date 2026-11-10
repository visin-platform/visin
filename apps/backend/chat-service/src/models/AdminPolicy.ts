import { Schema, model } from 'mongoose';
const history = new Schema(
  { actorId: String, at: Date, reason: String, before: Schema.Types.Mixed, after: Schema.Types.Mixed },
  { _id: false }
);
export const AdminPolicy = model(
  'ChatAdminPolicy',
  new Schema(
    {
      _id: String,
      revision: { type: Number, default: 0 },
      settings: { type: Schema.Types.Mixed, required: true },
      history: { type: [history], default: [] }
    },
    { timestamps: true }
  )
);
