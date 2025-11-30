import mongoose from 'mongoose';

let connected = false;

export async function connectDb(uri?: string) {
  if (connected) return;
  const mongoUri = uri || process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGODB_URI not set');
  await mongoose.connect(mongoUri);
  connected = true;
  // eslint-disable-next-line no-console
  console.log('[auth-service] Mongo connected');
}
