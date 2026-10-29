import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { vision } from '../vision';
import { Caller, ToolModule, explain, ok } from './module';

/** The few things a person does by hand on a run or a project: naming and retagging. */

function registerWriteTools(server: McpServer, caller: Caller): void {
  const key = caller.token;

  server.registerTool(
    'create_project',
    {
      title: 'Create a project',
      description:
        'Make a new project to group training runs under. Projects are private unless made ' +
        'public. Ask the user before creating one — a project is a thing they will see in the app.',
      inputSchema: {
        name: z.string().min(1).max(200).describe('What to call it'),
        description: z.string().max(2000).optional().describe('What it is for'),
        isPublic: z
          .boolean()
          .optional()
          .describe('Whether anyone can see it. Defaults to private; only set true if the user said so.'),
        groupId: z
          .string()
          .regex(/^[0-9a-fA-F]{24}$/)
          .optional()
          .describe(
            'A group the user is in, to own the project instead of the user: its members can then add ' +
              'runs, and its admins manage it. Only when the user asked for it and gave the group id.'
          )
      },
      // Adds a project; touches nothing that already exists. The two update
      // tools below leave the hint alone, because overwriting a name or
      // replacing a run's tags does lose what was there.
      annotations: { destructiveHint: false }
    },
    async ({ name, description, isPublic, groupId }) => {
      try {
        const project = await vision.createProject(key, {
          name,
          description,
          ...(isPublic === undefined ? {} : { visibility: isPublic ? 'public' : 'private' }),
          ...(groupId ? { owner: { kind: 'group', id: groupId } } : {})
        });
        return ok(
          `Created "${project.name}" (${project.visibility}), ` +
            `slug ${project.slug ?? project._id}.`
        );
      } catch (error) {
        return explain(error);
      }
    }
  );

  server.registerTool(
    'update_project',
    {
      title: 'Rename or re-describe a project',
      description:
        'Change a project\'s name, description or visibility. Making a project public exposes ' +
        'every run in it to anyone — confirm with the user before doing that.',
      inputSchema: {
        project: z.string().describe('The project id, from list_projects'),
        name: z.string().min(1).max(200).optional(),
        description: z.string().max(2000).optional(),
        isPublic: z.boolean().optional().describe('Only change this when the user explicitly asked')
      }
    },
    async ({ project, name, description, isPublic }) => {
      try {
        const updated = await vision.updateProject(key, project, {
          name,
          description,
          ...(isPublic === undefined ? {} : { visibility: isPublic ? 'public' : 'private' })
        });
        return ok(`Updated "${updated.name}" (${updated.visibility}).`);
      } catch (error) {
        return explain(error);
      }
    }
  );

  server.registerTool(
    'update_training',
    {
      title: 'Rename or retag a run',
      description:
        'Change a training run\'s name, description, status or tags. Note that nothing here can ' +
        'add or change measurements: epochs, test results and benchmarks are written by the ' +
        'training pipeline itself.',
      inputSchema: {
        training: z.string().describe('The training id, from list_trainings'),
        name: z.string().min(1).max(200).optional(),
        description: z.string().max(2000).optional(),
        status: z.enum(['pending', 'running', 'completed', 'failed']).optional(),
        tags: z.array(z.string()).max(20).optional().describe('Replaces the existing tags')
      }
    },
    async ({ training, name, description, status, tags }) => {
      try {
        const updated = await vision.updateTraining(key, training, {
          name,
          description,
          status,
          tags
        });
        return ok(`Updated "${updated.name}" [${updated.status}].`);
      } catch (error) {
        return explain(error);
      }
    }
  );
}

export const visionWrite: ToolModule = { scopes: ['vision:write'], register: registerWriteTools };
