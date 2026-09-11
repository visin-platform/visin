import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { FileUpload } from '../../models/FileUpload';

export function useMongo() {
  let mongo: MongoMemoryServer;
  beforeAll(async () => {
    mongo = await MongoMemoryServer.create({ binary: { version: '8.2.11' } });
    await mongoose.connect(mongo.getUri());
    await FileUpload.init();
  }, 60_000);
  beforeEach(async () => { await FileUpload.deleteMany({}); });
  afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });
}
