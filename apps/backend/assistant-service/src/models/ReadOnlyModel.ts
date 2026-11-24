type ReadMethods = 'find' | 'findOne' | 'findById' | 'exists' | 'countDocuments' | 'aggregate' | 'distinct' | 'schema' | 'modelName';

/**
 * A model that can only read. Vivi reads chat's collections through its own definitions of them, and what it changes there it asks chat to
 * change (`chatClient`).
 *
 * It has no write method (and no raw `collection`), so `Model.updateOne` does not compile. What it returns is still a
 * Mongoose query or document, which could be written through (`.updateMany()`, `doc.save()`): don't. Read with
 * `.lean()` where the document is not needed.
 */
export type ReadOnlyModel<M> = { [K in Extract<keyof M, ReadMethods>]: M[K] };
