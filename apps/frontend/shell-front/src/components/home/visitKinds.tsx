import type { ReactNode } from 'react';
import { Folder, Groups, ModelTraining, Person, PhotoLibrary } from '@mui/icons-material';
import type { VisitKind } from '@visin/frontend-core';

/** What each kind of place is called, and drawn as, wherever recently visited places are listed. */
const KINDS: Record<VisitKind, { label: string; icon: ReactNode }> = {
  project: { label: 'Project', icon: <Folder fontSize="small" /> },
  dataset: { label: 'Dataset', icon: <PhotoLibrary fontSize="small" /> },
  training: { label: 'Training', icon: <ModelTraining fontSize="small" /> },
  person: { label: 'Person', icon: <Person fontSize="small" /> },
  group: { label: 'Group', icon: <Groups fontSize="small" /> }
};

export const visitLabel = (kind: VisitKind): string => KINDS[kind].label;
export const visitIcon = (kind: VisitKind): ReactNode => KINDS[kind].icon;
