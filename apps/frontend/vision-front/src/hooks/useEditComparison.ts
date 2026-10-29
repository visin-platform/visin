import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { comparisonService } from '../services/comparisonService';
import type { Comparison } from '../types';

/** The edit dialog's draft of a comparison, and saving it. */
export const useEditComparison = (comparison: Comparison | undefined, canEdit: boolean, uuid: string | undefined) => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setOpen(false);
    setName('');
    setDescription('');
    setSelectedIds([]);
  };

  /** Open the dialog with the comparison as it is now. */
  const begin = () => {
    if (!comparison || !canEdit) return;
    setName(comparison.name);
    setDescription(comparison.description || '');
    setSelectedIds(comparison.itemIds);
    setError(null);
    setOpen(true);
  };

  const save = async () => {
    if (!comparison || !name.trim()) return;

    try {
      setUpdating(true);
      setError(null);
      await comparisonService.updateComparison(comparison._id, {
        name: name.trim(),
        description: description.trim(),
        itemIds: selectedIds
      });

      // Invalidate and refetch the comparison data
      queryClient.invalidateQueries({ queryKey: ['comparison', uuid] });

      reset();
    } catch (err) {
      console.error('Error updating comparison:', err);
      setError(err instanceof Error ? err.message : 'Could not save the comparison');
    } finally {
      setUpdating(false);
    }
  };

  const toggleTraining = (trainingId: string) => {
    setSelectedIds((previous) =>
      previous.includes(trainingId) ? previous.filter((id) => id !== trainingId) : [...previous, trainingId]
    );
  };

  return { open, name, setName, description, setDescription, selectedIds, toggleTraining, updating, error, begin, cancel: reset, save };
};
