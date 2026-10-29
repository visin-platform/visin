import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { comparisonService } from '../services/comparisonService';
import type { Comparison } from '../types';
import type { Project } from '../types/Project';

/** Asking before a comparison is deleted, deleting it, and going back to where it came from. */
export const useDeleteComparison = (comparison: Comparison | undefined, canEdit: boolean, project: Project | undefined) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const begin = () => {
    setError(null);
    setOpen(true);
  };

  const confirm = async () => {
    if (!comparison || !canEdit) return;

    try {
      setDeleting(true);
      setError(null);
      await comparisonService.deleteComparison(comparison._id);
      // Navigate back to project or comparisons page
      if (project) {
        navigate(`/projects/${project.slug || project._id}`);
      } else {
        navigate('/comparisons');
      }
    } catch (err) {
      console.error('Error deleting comparison:', err);
      setError(err instanceof Error ? err.message : 'Could not delete the comparison');
      setDeleting(false);
    }
  };

  return { open, deleting, error, begin, cancel: () => setOpen(false), confirm };
};
