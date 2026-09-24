import { readFileSync } from 'fs';
import path from 'path';
import type { Router } from 'express';
import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';
import { z } from 'zod';
import type { RequestSchemas } from '../middleware/validate';

/**
 * Checks a service's `docs/openapi.yml` against its code, for its tests:
 * every route is documented and nothing else is, request bodies and
 * parameters `$ref` the JSON Schema generated from the Zod schemas the routes
 * validate with, and real responses match what the spec says.
 *
 * Test-only. It needs `ajv`, `ajv-formats` and `yaml`, which a service
 * installs as dev dependencies; nothing a service ships imports this.
 */

/** Where a service's generated request schemas live, relative to its spec. */
export const GENERATED_SCHEMAS = 'generated/request-schemas.json';
const GENERATED_REF = `./${GENERATED_SCHEMAS}`;

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];

export interface RouteGroup {
  /** Where the router is mounted, e.g. `/api/trainings`. */
  path: string;
  router: Router;
}

export interface ApiRoute {
  method: string;
  /** In the spec's form: `/trainings/{id}`. */
  path: string;
  /** What its `validateRequest` checks, if it has one. */
  schemas: RequestSchemas;
  /** Middleware names in order, router-level first; `validateRequest` for a validator. */
  middleware: string[];
  /** The controller's function name. */
  handler: string;
}

type Layer = {
  name?: string;
  handle: { name?: string; requestSchemas?: RequestSchemas };
  route?: { path: string; methods: Record<string, boolean>; stack: Layer[] };
};

const layerName = (layer: Layer) =>
  layer.handle.requestSchemas ? 'validateRequest' : layer.handle.name || 'anonymous';

/**
 * Every route the groups mount. `specBase` is the part of the mount path the
 * spec's servers already include (vision-service's servers end in `/api`).
 */
export function collectRoutes(groups: RouteGroup[], { specBase = '' }: { specBase?: string } = {}): ApiRoute[] {
  return groups.flatMap(({ path: mountPath, router }) => {
    const layers = router.stack as unknown as Layer[];
    const routerMiddleware = layers.filter((layer) => !layer.route).map(layerName);
    return layers.flatMap(({ route }) => {
      if (!route) return [];
      const handlers = route.stack.map((layer) => layer.handle);
      const validator = handlers.find((handle) => handle.requestSchemas);
      const full = mountPath + (route.path === '/' ? '' : route.path);
      return Object.keys(route.methods).map((method) => ({
        method: method.toUpperCase(),
        path: full.slice(specBase.length).replace(/:(\w+)/g, '{$1}'),
        schemas: validator?.requestSchemas ?? {},
        middleware: [...routerMiddleware, ...route.stack.slice(0, -1).map(layerName)],
        handler: handlers[handlers.length - 1].name || 'anonymous'
      }));
    });
  });
}

/**
 * Names schemas by their export: `createEpochFromJsonBodySchema` publishes as
 * `CreateEpochFromJsonBody`. Throws for a schema no module exports by name.
 */
export function schemaNamer(modules: object[]): (schema: z.ZodType) => string {
  const names = new Map<z.ZodType, string>();
  for (const module of modules) {
    for (const [name, value] of Object.entries(module)) {
      if (value instanceof z.ZodType) names.set(value, name[0].toUpperCase() + name.slice(1).replace(/Schema$/, ''));
    }
  }
  return (schema) => {
    const name = names.get(schema);
    if (!name) throw new Error('A route validates against a schema that validation/ does not export by name');
    return name;
  };
}

export type JsonSchema = {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  [key: string]: unknown;
};

/**
 * The shape a caller sends (`io: 'input'`), so defaulted fields are optional
 * and coerced ones read as what goes over the wire: a date is an ISO string.
 * `.int()`'s implied `MIN_SAFE_INTEGER`/`MAX_SAFE_INTEGER` bounds are dropped as noise.
 */
export function toJsonSchema(schema: z.ZodType): JsonSchema {
  const jsonSchema = z.toJSONSchema(schema, {
    io: 'input',
    unrepresentable: 'any',
    override: ({ zodSchema, jsonSchema: out }) => {
      if (zodSchema._zod.def.type === 'date') {
        out.type = 'string';
        out.format = 'date-time';
      }
      if (out.maximum === Number.MAX_SAFE_INTEGER) delete out.maximum;
      if (out.minimum === Number.MIN_SAFE_INTEGER) delete out.minimum;
    }
  }) as JsonSchema;
  delete jsonSchema.$schema;
  return jsonSchema;
}

/** The body, query and path schemas the routes use, by published name, sorted. */
export function buildRequestSchemas(
  routes: ApiRoute[],
  nameOf: (schema: z.ZodType) => string
): Record<string, JsonSchema> {
  const byName = new Map<string, JsonSchema>();
  for (const { schemas } of routes) {
    for (const schema of [schemas.body, schemas.query, schemas.params]) {
      if (schema) byName.set(nameOf(schema), toJsonSchema(schema));
    }
  }
  return Object.fromEntries([...byName].sort(([a], [b]) => a.localeCompare(b)));
}

type Parameter = { name: string; in: string; required?: boolean; schema?: { $ref?: string } };
type Response = { $ref?: string; description?: string; content?: Record<string, { schema?: unknown }> };
type Operation = {
  parameters?: Parameter[];
  requestBody?: { content?: Record<string, { schema?: { $ref?: string } }> };
  responses?: Record<string, Response>;
};
export type OpenApiSpec = {
  paths: Record<string, Record<string, Operation>>;
  components?: { schemas?: Record<string, unknown>; responses?: Record<string, Response> };
};

/** A service's spec and its generated request schemas. */
export function loadSpec(docsDir: string): { spec: OpenApiSpec; generated: Record<string, JsonSchema> } {
  const spec = parse(readFileSync(path.join(docsDir, 'openapi.yml'), 'utf8')) as OpenApiSpec;
  let generated: Record<string, JsonSchema> = {};
  try {
    generated = JSON.parse(readFileSync(path.join(docsDir, GENERATED_SCHEMAS), 'utf8'));
  } catch {
    // Not generated yet: the up-to-date check reports it.
  }
  return { spec, generated };
}

const operationKey = ({ method, path: routePath }: { method: string; path: string }) => `${method} ${routePath}`;

/** Every `$ref` string anywhere in a document. */
const refsIn = (node: unknown): string[] => {
  if (Array.isArray(node)) return node.flatMap(refsIn);
  if (node && typeof node === 'object') {
    return Object.entries(node).flatMap(([field, value]) =>
      field === '$ref' && typeof value === 'string' ? [value] : refsIn(value)
    );
  }
  return [];
};

const resolvePointer = (document: unknown, pointer: string): unknown =>
  pointer
    .split('/')
    .slice(1)
    .map((part) => decodeURIComponent(part).replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce<unknown>(
      (node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined),
      document
    );

export interface SpecProblems {
  /** Routes the app mounts that the spec leaves out. */
  undocumented: string[];
  /** Spec operations no route serves. */
  stale: string[];
  /** Bodies or parameters that do not `$ref` what their route validates with. */
  requests: string[];
  /** `$ref`s that resolve to nothing. */
  refs: string[];
}

/**
 * Where the spec and the routes disagree. `ignore` lists `METHOD /path`
 * routes left out of the spec on purpose.
 */
export function specProblems({
  spec,
  routes,
  generated,
  nameOf,
  ignore = []
}: {
  spec: OpenApiSpec;
  routes: ApiRoute[];
  generated: Record<string, JsonSchema>;
  nameOf: (schema: z.ZodType) => string;
  ignore?: string[];
}): SpecProblems {
  const operations = Object.entries(spec.paths).flatMap(([specPath, item]) =>
    Object.keys(item)
      .filter((method) => HTTP_METHODS.includes(method))
      .map((method) => ({ method: method.toUpperCase(), path: specPath }))
  );
  const documented = new Set(operations.map(operationKey));
  const mounted = new Set(routes.map(operationKey));

  const requests: string[] = [];
  for (const route of routes) {
    const operation = spec.paths[route.path]?.[route.method.toLowerCase()];
    if (!operation) continue;
    const key = operationKey(route);

    if (route.schemas.body) {
      const expected = `${GENERATED_REF}#/${nameOf(route.schemas.body)}`;
      const actual = Object.values(operation.requestBody?.content ?? {})[0]?.schema?.$ref;
      if (actual !== expected) requests.push(`${key}: body should $ref ${expected}, not ${actual}`);
    }

    for (const [location, schema] of [
      ['query', route.schemas.query],
      ['path', route.schemas.params]
    ] as const) {
      if (!schema) continue;
      const name = nameOf(schema);
      const required = new Set(generated[name]?.required ?? []);
      const expected = Object.keys(generated[name]?.properties ?? {}).map((property) => ({
        name: property,
        required: location === 'path' || required.has(property),
        $ref: `${GENERATED_REF}#/${name}/properties/${property}`
      }));
      const actual = (operation.parameters ?? [])
        .filter((parameter) => parameter.in === location)
        .map((parameter) => ({
          name: parameter.name,
          required: parameter.required ?? false,
          $ref: parameter.schema?.$ref
        }));
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        requests.push(
          `${key}: ${location} parameters should be ${JSON.stringify(expected)}, not ${JSON.stringify(actual)}`
        );
      }
    }
  }

  const refs = refsIn(spec).filter((ref) => {
    const [file, pointer = ''] = ref.split('#');
    if (file === '') return resolvePointer(spec, pointer) === undefined;
    if (file === GENERATED_REF) return resolvePointer(generated, pointer) === undefined;
    return true;
  });

  return {
    undocumented: routes.map(operationKey).filter((key) => !documented.has(key) && !ignore.includes(key)),
    stale: operations.map(operationKey).filter((key) => !mounted.has(key)),
    requests,
    refs
  };
}

export interface ObservedResponse {
  method: string;
  /** As requested, with or without a query string. */
  url: string;
  status: number;
  body: unknown;
}

export interface ResponseChecker {
  /** The spec operation a request hit, as `METHOD /template`, or undefined when there is none. */
  operationKey: (method: string, url: string) => string | undefined;
  /** Why a response does not match the spec; empty when it does. */
  responseProblems: (response: ObservedResponse) => string[];
}

/**
 * Checks real responses against a spec: the operation exists, it documents
 * the status (or a `default`), and a JSON body matches that response's schema.
 */
export function createResponseChecker(
  { spec, generated }: { spec: OpenApiSpec; generated: Record<string, JsonSchema> },
  { specBase = '' }: { specBase?: string } = {}
): ResponseChecker {
  const specId = 'openapi.yml';
  // The spec is not itself a JSON Schema, only a home for them, so it is added
  // unvalidated; `example` and other OpenAPI keywords are not errors.
  const ajv = new Ajv2020({ strict: false, allErrors: true, validateSchema: false });
  addFormats(ajv);
  ajv.addSchema(spec, specId);
  ajv.addSchema(generated, GENERATED_SCHEMAS);

  // Literal paths before templated ones, so `/trainings/stats` is not read as `/trainings/{id}`.
  const templates = Object.keys(spec.paths)
    .map((template) => ({
      template,
      params: (template.match(/\{/g) ?? []).length,
      pattern: new RegExp(`^${template.replace(/[.]/g, '\\.').replace(/\{[^}]+\}/g, '[^/]+')}$`)
    }))
    .sort((a, b) => a.params - b.params);

  const pointer = (...parts: string[]) =>
    '/' + parts.map((part) => encodeURIComponent(part.replace(/~/g, '~0').replace(/\//g, '~1'))).join('/');

  const validators = new Map<string, ValidateFunction>();
  const validatorFor = (schemaPointer: string) => {
    let validate = validators.get(schemaPointer);
    if (!validate) {
      validate = ajv.compile({ $ref: `${specId}#${schemaPointer}` });
      validators.set(schemaPointer, validate);
    }
    return validate;
  };

  const keyOf = (method: string, url: string) => {
    const pathname = new URL(url, 'http://spec.invalid').pathname.slice(specBase.length);
    const verb = method.toLowerCase();
    const match = templates.find(({ template, pattern }) => pattern.test(pathname) && spec.paths[template][verb]);
    return match && `${method.toUpperCase()} ${match.template}`;
  };

  const responseProblems = ({ method, url, status, body }: ObservedResponse): string[] => {
    const key = keyOf(method, url);
    if (!key) return [`${method} ${url}: no such operation in the spec`];
    const template = key.slice(key.indexOf(' ') + 1);
    const verb = method.toLowerCase();

    const responses = spec.paths[template][verb].responses ?? {};
    const code = String(status) in responses ? String(status) : 'default' in responses ? 'default' : undefined;
    if (!code) return [`${key}: answered ${status}, which the spec does not document`];

    // A shared response (`$ref: '#/components/responses/NotFound'`) is followed to its schema.
    const declared = responses[code];
    const [responsePointer, response] = declared.$ref
      ? [declared.$ref.slice(1), spec.components?.responses?.[declared.$ref.split('/').pop()!] ?? {}]
      : [pointer('paths', template, verb, 'responses', code), declared];
    if (!response.content?.['application/json']?.schema) {
      return body === undefined ? [] : [`${key} ${status}: sends a JSON body, but the spec documents none`];
    }

    const validate = validatorFor(`${responsePointer}/content/application~1json/schema`);
    if (validate(body)) return [];
    // Ajv always sets `errors` when validation fails.
    return validate.errors!.map((error) => `${key} ${status}: body${error.instancePath} ${error.message}`);
  };

  return { operationKey: keyOf, responseProblems };
}
