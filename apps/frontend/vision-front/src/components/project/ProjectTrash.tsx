import React from 'react';
import type { OwnerGroup } from '@visin/frontend-core';
import { projectService } from '../../services/projectService';
import TrashList from '../TrashList';

interface ProjectTrashProps {
  userId?: string;
  groups: OwnerGroup[];
}

/** Projects in the trash that the user manages. */
const ProjectTrash: React.FC<ProjectTrashProps> = ({ userId, groups }) => (
  <TrashList
    noun="project"
    userId={userId}
    groups={groups}
    queryKey={['projects', 'trash', userId]}
    load={async () => (await projectService.getTrash()).data}
    invalidateKey={['projects']}
    restore={(project) => projectService.restoreProject(project._id)}
    deleteForever={(project) => projectService.deleteProjectForever(project._id)}
    deleteConsequence="all its trainings, results, configs and visualization files"
  />
);

export default ProjectTrash;
