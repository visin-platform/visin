import mongoose from 'mongoose';
import ApiToken from '../../models/ApiToken';
import Benchmark from '../../models/Benchmark';
import Comparison from '../../models/Comparison';
import Config from '../../models/Config';
import Contact from '../../models/Contact';
import DatasetAnalysis from '../../models/DatasetAnalysis';
import DatasetImage, { WEATHER_CONDITIONS } from '../../models/DatasetImage';
import Dataset from '../../models/Dataset';
import Epoch from '../../models/Epoch';
import EpochVisualization from '../../models/EpochVisualization';
import ImageCategory from '../../models/ImageCategory';
import Project from '../../models/Project';
import TestResult from '../../models/TestResult';
import Training from '../../models/Training';

describe('model registration', () => {
  it('registers every model under its collection-stable name', () => {
    expect(ApiToken.modelName).toBe('ApiToken');
    expect(Benchmark.modelName).toBe('Benchmark');
    expect(Comparison.modelName).toBe('comparison');
    expect(Config.modelName).toBe('training_config');
    expect(Contact.modelName).toBe('Contact');
    expect(DatasetAnalysis.modelName).toBe('dataset_analysis');
    expect(DatasetImage.modelName).toBe('DatasetImage');
    expect(Dataset.modelName).toBe('training_dataset');
    expect(Epoch.modelName).toBe('training_epoch');
    expect(EpochVisualization.modelName).toBe('epoch_visualization');
    expect(ImageCategory.modelName).toBe('ImageCategory');
    expect(Project.modelName).toBe('Project');
    expect(TestResult.modelName).toBe('test_result');
    expect(Training.modelName).toBe('training');
  });
});

describe('Project', () => {
  it('defaults to private and requires name + ownerId', () => {
    const project = new Project({ name: 'P', ownerId: 'u1' });
    expect(project.isPublic).toBe(false);

    const error = new Project({}).validateSync();
    expect(error?.errors.name).toBeDefined();
    expect(error?.errors.ownerId).toBeDefined();
  });

  it('lowercases slugs', () => {
    const project = new Project({ name: 'P', ownerId: 'u1', slug: 'My-Slug' });
    expect(project.slug).toBe('my-slug');
  });
});

describe('Training', () => {
  it('defaults status to pending and requires uuid + name', () => {
    const training = new Training({ uuid: 'u-1', name: 'T' });
    expect(training.status).toBe('pending');

    const error = new Training({}).validateSync();
    expect(error?.errors.uuid).toBeDefined();
    expect(error?.errors.name).toBeDefined();
  });

  it('rejects unknown statuses', () => {
    const training = new Training({ uuid: 'u-1', name: 'T', status: 'exploded' });
    expect(training.validateSync()?.errors.status).toBeDefined();
  });
});

describe('ApiToken', () => {
  it('defaults isActive to true and requires core fields', () => {
    const token = new ApiToken({
      name: 't',
      tokenHash: 'h',
      prefix: 'vsn_abc',
      projectId: new mongoose.Types.ObjectId(),
      createdBy: 'u1',
    });
    expect(token.isActive).toBe(true);
    expect(token.validateSync()).toBeUndefined();

    const error = new ApiToken({}).validateSync();
    expect(error?.errors.name).toBeDefined();
    expect(error?.errors.tokenHash).toBeDefined();
    expect(error?.errors.projectId).toBeDefined();
  });
});

describe('Benchmark', () => {
  const valid = {
    timestamp: new Date(),
    system_info: { cpu_count: 8, cpu_count_logical: 16, memory_total_gb: 32 },
    results: [{ model_name: 'm', fps: 30 }],
  };

  it('validates a complete benchmark', () => {
    expect(new Benchmark(valid).validateSync()).toBeUndefined();
  });

  it('requires timestamp and system info', () => {
    const error = new Benchmark({}).validateSync();
    expect(error?.errors.timestamp).toBeDefined();
  });

  it('softDelete stamps deletedAt and saves', async () => {
    const doc = new Benchmark(valid);
    const save = jest.spyOn(doc, 'save').mockResolvedValue(doc as never);

    await (doc as unknown as { softDelete: () => Promise<unknown> }).softDelete();

    expect(doc.deletedAt).toBeInstanceOf(Date);
    expect(save).toHaveBeenCalled();
    // Under strict mode, assigning a path absent from the schema is
    // silently dropped by save() even though the in-memory getter still
    // reads it back — modifiedPaths() is what actually reflects what a
    // real save() would persist.
    expect(doc.modifiedPaths()).toContain('deletedAt');
  });

  it('findActive filters out soft-deleted docs', () => {
    const find = jest.spyOn(Benchmark, 'find').mockReturnValue('query' as never);

    const result = (Benchmark as unknown as { findActive: (q?: object) => unknown }).findActive({
      epoch: 1,
    });

    expect(find).toHaveBeenCalledWith({ epoch: 1, deletedAt: null });
    expect(result).toBe('query');
    find.mockRestore();
  });
});

describe('Comparison', () => {
  it('requires uuid, name, and a known type', () => {
    const error = new Comparison({}).validateSync();
    expect(error?.errors.uuid).toBeDefined();
    expect(error?.errors.name).toBeDefined();
    expect(error?.errors.type).toBeDefined();

    expect(
      new Comparison({ uuid: 'c1', name: 'C', type: 'nonsense' }).validateSync()?.errors.type
    ).toBeDefined();
    expect(
      new Comparison({ uuid: 'c1', name: 'C', type: 'trainings', itemIds: ['a'] }).validateSync()
    ).toBeUndefined();
  });
});

describe('Contact', () => {
  it('validates email format and lowercases it', () => {
    const good = new Contact({ name: 'N', email: 'A@B.co', message: 'hi' });
    expect(good.validateSync()).toBeUndefined();
    expect(good.email).toBe('a@b.co');

    expect(
      new Contact({ name: 'N', email: 'not-an-email', message: 'hi' }).validateSync()?.errors.email
    ).toBeDefined();
  });
});

describe('DatasetImage', () => {
  it('exposes the weather condition list and validates against it', () => {
    expect(WEATHER_CONDITIONS).toContain('day_fair');

    const image = new DatasetImage({
      filename: 'f.jpg',
      originalName: 'o.jpg',
      fileId: 'id',
      datasetId: new mongoose.Types.ObjectId(),
      categoryId: new mongoose.Types.ObjectId(),
      mimetype: 'image/jpeg',
      size: 1,
      weatherCondition: 'snow',
    });
    expect(image.validateSync()).toBeUndefined();

    image.weatherCondition = 'volcano' as never;
    expect(image.validateSync()?.errors.weatherCondition).toBeDefined();
  });

  it('mirrors fileId/thumbnailFileId under their deprecated minio* names when serialized', () => {
    const image = new DatasetImage({
      filename: 'f.jpg',
      originalName: 'o.jpg',
      fileId: 'id',
      thumbnailFileId: 'thumb',
      datasetId: new mongoose.Types.ObjectId(),
      categoryId: new mongoose.Types.ObjectId(),
      mimetype: 'image/jpeg',
      size: 1,
    });

    // The deprecated aliases are added by the schema transform at runtime and
    // deliberately kept off IDatasetImage, so read them untyped.
    for (const doc of [image.toJSON(), image.toObject()]) {
      const serialized = doc as unknown as Record<string, unknown>;
      expect(serialized.fileId).toBe('id');
      expect(serialized.minioFileId).toBe('id');
      expect(serialized.thumbnailFileId).toBe('thumb');
      expect(serialized.minioThumbnailFileId).toBe('thumb');
    }
  });

  it('omits the deprecated thumbnail alias when there is no thumbnail', () => {
    const image = new DatasetImage({
      filename: 'f.jpg',
      originalName: 'o.jpg',
      fileId: 'id',
      datasetId: new mongoose.Types.ObjectId(),
      categoryId: new mongoose.Types.ObjectId(),
      mimetype: 'image/jpeg',
      size: 1,
    });

    expect((image.toJSON() as unknown as Record<string, unknown>).minioThumbnailFileId).toBeUndefined();
  });
});

describe('EpochVisualization', () => {
  it('mirrors fileId under its deprecated minioFileId name when serialized', () => {
    const viz = new EpochVisualization({
      epoch_uuid: 'e',
      visualization_uuid: 'v',
      filename: 'f.png',
      type: 'segment',
      fileId: 'visualizations/e/segment/v.png',
    });

    for (const doc of [viz.toJSON(), viz.toObject()]) {
      const serialized = doc as unknown as Record<string, unknown>;
      expect(serialized.fileId).toBe('visualizations/e/segment/v.png');
      expect(serialized.minioFileId).toBe('visualizations/e/segment/v.png');
    }
  });
});

describe('Config / DatasetAnalysis', () => {
  it('Config requires uuid, summary, and data', () => {
    const error = new Config({}).validateSync();
    expect(error?.errors.config_uuid).toBeDefined();
    expect(error?.errors.summary).toBeDefined();
    expect(error?.errors.config_data).toBeDefined();
  });

  it('DatasetAnalysis requires dataset and data', () => {
    const error = new DatasetAnalysis({}).validateSync();
    expect(error?.errors.dataset).toBeDefined();
    expect(error?.errors.data).toBeDefined();
  });
});
