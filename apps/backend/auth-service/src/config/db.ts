import mongoose from 'mongoose';

let connected = false;

export async function connectDb(uri?: string) {
  if (connected) return;
  const mongoUri = uri || process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGODB_URI not set');
  await mongoose.connect(mongoUri);
  connected = true;
   
  console.log('[auth-service] Mongo connected');
}
