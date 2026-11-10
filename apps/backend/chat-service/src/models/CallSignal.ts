import { Schema, model } from 'mongoose';

/**
 * One WebRTC signal (an offer, an answer, an ICE candidate, "my camera is on") waiting for a device to take it. The
 * device's stream removes it as it delivers it, so a reconnecting device never replays an old offer; whatever nobody
 * takes expires. This is what stands in for an in-process hub, so any replica can accept a signal and any other can
 * deliver it.
 */
const callSignalSchema = new Schema({
  callId: { type: String, required: true, index: true },
  toUserId: { type: String, required: true },
  toDeviceId: { type: String, required: true },
  fromDeviceId: { type: String, required: true },
  seq: { type: Number, required: true },
  data: { type: Schema.Types.Mixed, required: true },
  createdAt: { type: Date, default: Date.now, expires: 120 }
});
callSignalSchema.index({ toUserId: 1, toDeviceId: 1, seq: 1 });
export const CallSignal = model('ChatCallSignal', callSignalSchema);
