/** Delivery identities fence late results from an older scan or resumed import.
 * Missing identities only match legacy records; they never match a new delivery. */
export const importDelivery = (datasetId: string, importId: string, deliveryId?: string) => ({
  _id: datasetId,
  'import.id': importId,
  'import.deliveryId': deliveryId ?? { $exists: false }
});

export const scanDelivery = (datasetId: string, fileId: string, scanId?: string) => ({
  _id: datasetId,
  'scan.fileId': fileId,
  'scan.id': scanId ?? { $exists: false }
});

export const pendingWork = { $in: ['queued', 'running'] as const };

export const staleHeartbeat = (field: string, before: Date) => ({
  $or: [{ [field]: { $lte: before } }, { [field]: { $exists: false } }]
});
