const fs = require('fs');
const path = require('path');
const Minio = require('minio');
require('dotenv').config();

// Configuration
const SOURCE_FOLDER = '/media/tom/ml/zod_temp/visualizations/lidar_only_annotation';
const BUCKET_NAME = 'vision';
const MINIO_PREFIX = 'lidar_only_annotation';
const CONCURRENCY = 5; // Upload 5 files at a time

// Initialize MinIO client
const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY
});

console.log('MinIO Configuration:');
console.log('  Endpoint:', process.env.MINIO_ENDPOINT);
console.log('  Port:', process.env.MINIO_PORT);
console.log('  SSL:', process.env.MINIO_USE_SSL);
console.log('  Bucket:', BUCKET_NAME);
console.log('  Access Key:', process.env.MINIO_ACCESS_KEY ? '***' : 'NOT SET');
console.log('');

// Utility functions
function getAllFiles(dirPath, relativeTo = dirPath) {
  const files = [];

  function scanDir(currentPath) {
    const items = fs.readdirSync(currentPath);

    for (const item of items) {
      const fullPath = path.join(currentPath, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        scanDir(fullPath);
      } else if (stat.isFile()) {
        const relativePath = path.relative(relativeTo, fullPath);
        files.push(relativePath);
      }
    }
  }

  scanDir(dirPath);
  return files;
}

function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.json': 'application/json',
    '.txt': 'text/plain'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

async function uploadFile(filePath, minioKey) {
  const fullPath = path.join(SOURCE_FOLDER, filePath);
  const buffer = fs.readFileSync(fullPath);
  const mimetype = getMimeType(filePath);

  console.log(`Uploading: ${filePath} -> ${minioKey} (${buffer.length} bytes)`);

  return minioClient.putObject(BUCKET_NAME, minioKey, buffer, buffer.length, {
    'Content-Type': mimetype,
    'x-amz-meta-uploaded-by': 'upload-script',
    'x-amz-meta-uploaded-at': new Date().toISOString()
  });
}

async function ensureBucketExists() {
  try {
    console.log(`Assuming bucket '${BUCKET_NAME}' exists (skipping check due to auth issues)`);
    // Skip bucket existence check to avoid auth issues
    // const exists = await minioClient.bucketExists(BUCKET_NAME);
    // if (!exists) {
    //   console.log(`Creating bucket: ${BUCKET_NAME}`);
    //   await minioClient.makeBucket(BUCKET_NAME, 'eu-east-1');
    //   console.log(`✅ Created bucket: ${BUCKET_NAME}`);
    // } else {
    //   console.log(`✅ Bucket ${BUCKET_NAME} exists`);
    // }
  } catch (error) {
    console.log(`Warning: Could not verify bucket exists: ${error.message}`);
    console.log('Continuing with upload assuming bucket exists...');
  }
}

async function uploadFilesConcurrently(files) {
  let uploaded = 0;
  let failed = 0;
  const total = files.length;

  console.log(`\nStarting upload of ${total} files with concurrency ${CONCURRENCY}`);

  for (let i = 0; i < files.length; i += CONCURRENCY) {
    const batch = files.slice(i, i + CONCURRENCY);
    const promises = batch.map(async (filePath) => {
      try {
        const minioKey = path.join(MINIO_PREFIX, filePath).replace(/\\/g, '/');
        await uploadFile(filePath, minioKey);
        uploaded++;
        return true;
      } catch (error) {
        console.error(`❌ Failed to upload ${filePath}:`, error.message);
        failed++;
        return false;
      }
    });

    await Promise.all(promises);

    const progress = Math.min(i + CONCURRENCY, total);
    console.log(`Progress: ${progress}/${total} files processed (${uploaded} uploaded, ${failed} failed)`);
  }

  return { uploaded, failed };
}

async function main() {
  try {
    console.log('🔍 Scanning source folder for files...');
    const files = getAllFiles(SOURCE_FOLDER);

    if (files.length === 0) {
      console.log('No files found in source folder');
      return;
    }

    console.log(`Found ${files.length} files to upload`);
    console.log('Sample files:', files.slice(0, 3).map(f => `  - ${f}`));

    // Ensure bucket exists
    await ensureBucketExists();

    // Confirm upload
    console.log(`\nReady to upload ${files.length} files to MinIO bucket '${BUCKET_NAME}' under prefix '${MINIO_PREFIX}'`);
    console.log('Starting upload in 3 seconds... (Ctrl+C to cancel)');

    await new Promise(resolve => setTimeout(resolve, 3000));

    const startTime = Date.now();
    const result = await uploadFilesConcurrently(files);
    const duration = (Date.now() - startTime) / 1000;

    console.log('\n✅ Upload completed!');
    console.log(`📊 Summary:`);
    console.log(`  Total files: ${files.length}`);
    console.log(`  Successfully uploaded: ${result.uploaded}`);
    console.log(`  Failed: ${result.failed}`);
    console.log(`  Duration: ${duration.toFixed(1)} seconds`);
    console.log(`  Average speed: ${(files.length / duration).toFixed(1)} files/sec`);

  } catch (error) {
    console.error('Upload failed:', error);
    process.exit(1);
  }
}

main();