import React from 'react';
import type { OwnerGroup } from '@visin/frontend-core';
import { deleteDatasetForever, listTrash, restoreDataset } from '../../services/datasetService';
import TrashList from '../TrashList';

interface DatasetTrashProps {
  userId?: string;
  groups: OwnerGroup[];
}

/** Datasets in the trash that the user manages. */
const DatasetTrash: React.FC<DatasetTrashProps> = ({ userId, groups }) => (
  <TrashList
    noun="dataset"
    userId={userId}
    groups={groups}
    queryKey={['datasets', 'trash']}
    load={listTrash}
    invalidateKey={['datasets']}
    restore={(dataset) => restoreDataset(dataset._id)}
    deleteForever={(dataset) => deleteDatasetForever(dataset._id)}
    deleteConsequence="its zip and every imported image"
  />
);

export default DatasetTrash;
