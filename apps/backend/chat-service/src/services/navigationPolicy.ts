import { z } from 'zod';
import { entityId, screenRequestSchema } from './screen';

const reference = z.discriminatedUnion('place', [
  z.strictObject({ place: z.literal('training'), id: entityId }),
  z.strictObject({ place: z.literal('project'), id: entityId }),
  z.strictObject({ place: z.literal('dataset'), id: entityId })
]);
/** Only this MCP contract grants navigation capabilities; text and recursively discovered fields never do. */
export class NavigationPolicy {
  private readonly references = new Set<string>();
  accept(result: Record<string, unknown>) {
    if (result.isError) return [];
    const envelope = z.object({ navigation: z.array(z.unknown()).max(400) }).safeParse(result.structuredContent);
    if (!envelope.success) return [];
    const accepted = envelope.data.navigation.flatMap((value) => {
      const parsed = reference.safeParse(value);
      return parsed.success ? [parsed.data] : [];
    });
    for (const ref of accepted) this.references.add(`${ref.place}:${ref.id}`);
    return accepted;
  }
  has(place: string, id: string) {
    return this.references.has(`${place}:${id}`);
  }
  allows(input: unknown) {
    const request = screenRequestSchema.safeParse(input);
    if (!request.success) return false;
    const target = request.data;
    switch (target.place) {
      case 'training':
        return this.has('training', target.id) && target.model === undefined;
      case 'project':
      case 'dataset':
        return this.has(target.place, target.id);
      case 'compare':
      case 'visualizations':
        return target.ids.every((id) => this.has('training', id));
      case 'trainings':
        return target.project === undefined || this.has('project', target.project);
      case 'projects':
      case 'datasets':
      case 'models':
      case 'benchmarks':
        return true;
      default:
        return false;
    }
  }
}
