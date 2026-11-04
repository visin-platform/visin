import { Schema, model } from 'mongoose';

/** A provider key an administrator saved in the page, encrypted: never returned, only its last characters. */
const providerKeySchema = new Schema(
  {
    // 'deployment' for the key everyone uses; a user's own key would be owned by that user.
    owner: { type: String, required: true },
    provider: { type: String, enum: ['anthropic', 'openai'], required: true },
    ciphertext: { type: String, required: true },
    iv: { type: String, required: true },
    tag: { type: String, required: true },
    hint: { type: String, default: '' },
    updatedBy: String
  },
  { timestamps: true }
);
providerKeySchema.index({ owner: 1, provider: 1 }, { unique: true });
export const ProviderKey = model('ChatProviderKey', providerKeySchema);
