import React from 'react';
import { Training } from '../../types';

export interface TrainingsTableProps {
  trainings: Training[];
  isLoading: boolean;
  page: number;
  rowsPerPage: number;
  total: number;
  onPageChange: (event: unknown, newPage: number) => void;
  onRowsPerPageChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onEdit: (training: Training) => void;
  onDelete: (trainingId: string) => void;
  searchTerm: string;
  selectedTrainingIds: Set<string>;
  onSelectTraining: (trainingId: string) => void;
  onSelectAll: () => void;
  sortBy:
    'name' | 'createdAt' | 'updatedAt' | 'status' | 'totalTime' | 'cpuCost' | 'gpuCost' | 'totalCost' | 'epochCount';
  sortOrder: 'asc' | 'desc';
  onSort: (
    column:
      'name' | 'createdAt' | 'updatedAt' | 'status' | 'totalTime' | 'cpuCost' | 'gpuCost' | 'totalCost' | 'epochCount'
  ) => void;
  isAuthenticated: boolean;
  canWrite?: (id: string) => boolean;
  /**
   * Project names by id. Given, and sorted newest first, the runs are shown
   * grouped under their project; without it the list is flat, as sorted.
   */
  projectNames?: Record<string, string>;
}
