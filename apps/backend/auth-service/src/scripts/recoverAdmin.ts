import mongoose from 'mongoose';
import { recoverAdministrator } from '../services/bootstrapService';

// Exposing completion lets the command's errors and cleanup be tested directly.
export const completion = (async () => {
  const [userId, ...extra] = process.argv.slice(2);
  if (!userId || extra.length) throw new Error('Usage: npm run recover:admin -- <existing-user-id>');
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');
  try {
    await mongoose.connect(uri);
    const user = await recoverAdministrator(userId);
    console.info(`Administrator role restored for user ${user._id.toString()}`);
  } finally {
    await mongoose.disconnect();
  }
})().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
