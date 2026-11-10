import { Schema, model } from 'mongoose';

/**
 * Secrets this service makes for itself, one document each (today only the Web Push signing keys). They live in
 * the database so that every replica signs with the same pair and a restart never invalidates the browsers
 * already subscribed. The private half is sealed with `API_KEY_ENCRYPTION_SECRET` when that is set.
 */
const deploymentSecretSchema = new Schema(
  {
    _id: { type: String, required: true },
    publicKey: { type: String, required: true },
    // Sealed (ciphertext, iv, tag) when an encryption secret is configured; otherwise `plain` holds the key.
    ciphertext: String,
    iv: String,
    tag: String,
    plain: String
  },
  { timestamps: true }
);
export const DeploymentSecret = model('ChatDeploymentSecret', deploymentSecretSchema);
