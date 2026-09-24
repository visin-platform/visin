import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { validateRequest } from '../../middleware/validate';
import {
  GENERATED_SCHEMAS,
  buildRequestSchemas,
  collectRoutes,
  createResponseChecker,
  loadSpec,
  schemaNamer,
  specProblems,
  toJsonSchema,
  type OpenApiSpec
} from '../../openapi-testing';

const createThingBodySchema = z.object({ name: z.string(), due: z.coerce.date().optional() });
const listThingsQuerySchema = z.object({ page: z.coerce.number().int().default(1), q: z.string() });
const thingParamsSchema = z.object({ id: z.string() });
const validation = { createThingBodySchema, listThingsQuerySchema, thingParamsSchema, notASchema: 1 };

function guard(_req: Request, _res: Response, next: NextFunction) {
  next();
}
function listThings(_req: Request, res: Response) {
  res.json([]);
}
function createThing(_req: Request, res: Response) {
  res.json({});
}
function getThing(_req: Request, res: Response) {
  res.json({});
}

const router = express.Router();
router.use(guard);
router.get('/', validateRequest({ query: listThingsQuerySchema }), listThings);
router.post('/', validateRequest({ body: createThingBodySchema }), createThing);
router.get('/:id', validateRequest({ params: thingParamsSchema }), getThing);
router.delete('/:id', (_req, res) => {
  res.end();
});

const routes = collectRoutes([{ path: '/api/things', router }], { specBase: '/api' });
const nameOf = schemaNamer([validation]);
const generated = buildRequestSchemas(routes, nameOf);
const ref = (pointer: string) => ({ $ref: `./${GENERATED_SCHEMAS}#/${pointer}` });

const goodSpec = (): OpenApiSpec => ({
  paths: {
    '/things': {
      get: {
        parameters: [
          { name: 'page', in: 'query', schema: ref('ListThingsQuery/properties/page') },
          { name: 'q', in: 'query', required: true, schema: ref('ListThingsQuery/properties/q') }
        ],
        responses: { '200': { content: { 'application/json': { schema: { type: 'array' } } } } }
      },
      post: {
        requestBody: { content: { 'application/json': { schema: ref('CreateThingBody') } } },
        responses: {
          '201': { content: { 'application/json': { schema: { $ref: '#/components/schemas/Thing' } } } },
          default: { $ref: '#/components/responses/Error' }
        }
      }
    },
    '/things/{id}': {
      get: {
        parameters: [{ name: 'id', in: 'path', required: true, schema: ref('ThingParams/properties/id') }],
        responses: { '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/Thing' } } } } }
      },
      delete: { responses: { '204': { description: 'Gone' } } }
    },
    '/things/latest': {
      get: {
        responses: { '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/Thing' } } } } }
      }
    }
  },
  components: {
    schemas: { Thing: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } } },
    responses: {
      Error: { content: { 'application/json': { schema: { type: 'object', required: ['error'] } } } },
      Gone: { description: 'No body' }
    }
  }
});

describe('collectRoutes', () => {
  it('lists each route in the spec form, with its validator, middleware and handler', () => {
    expect(
      routes.map(({ method, path: routePath, middleware, handler }) => ({ method, routePath, middleware, handler }))
    ).toEqual([
      { method: 'GET', routePath: '/things', middleware: ['guard', 'validateRequest'], handler: 'listThings' },
      { method: 'POST', routePath: '/things', middleware: ['guard', 'validateRequest'], handler: 'createThing' },
      { method: 'GET', routePath: '/things/{id}', middleware: ['guard', 'validateRequest'], handler: 'getThing' },
      { method: 'DELETE', routePath: '/things/{id}', middleware: ['guard'], handler: 'anonymous' }
    ]);
    expect(routes[1].schemas.body).toBe(createThingBodySchema);
    expect(routes[3].schemas).toEqual({});
  });

  it('keeps the whole mount path without a spec base', () => {
    expect(collectRoutes([{ path: '/things', router }])[0].path).toBe('/things');
  });

  it('names middleware it cannot name', () => {
    const bare = express.Router();
    bare.use((_req, _res, next) => next());
    bare.get('/', (_req, _res, next) => next(), getThing);
    expect(collectRoutes([{ path: '', router: bare }])[0].middleware).toEqual(['anonymous', 'anonymous']);
  });
});

describe('request schemas', () => {
  it('publishes a schema under its export name', () => {
    expect(nameOf(createThingBodySchema)).toBe('CreateThingBody');
    expect(() => nameOf(z.object({}))).toThrow(/does not export by name/);
  });

  it('describes what a caller sends: dates as strings, defaults optional, no MAX_SAFE_INTEGER', () => {
    expect(Object.keys(generated)).toEqual(['CreateThingBody', 'ListThingsQuery', 'ThingParams']);
    expect(generated.CreateThingBody.properties?.due).toMatchObject({ type: 'string', format: 'date-time' });
    expect(generated.ListThingsQuery.required).toEqual(['q']);
    expect(generated.ListThingsQuery.properties?.page).not.toHaveProperty('maximum');
    expect(toJsonSchema(z.number().int())).toEqual({ type: 'integer' });
    expect(toJsonSchema(z.string())).not.toHaveProperty('$schema');
  });
});

describe('specProblems', () => {
  it('finds nothing when the spec matches the routes', () => {
    expect(specProblems({ spec: goodSpec(), routes, generated, nameOf, ignore: ['GET /things/latest'] })).toEqual({
      undocumented: [],
      stale: ['GET /things/latest'],
      requests: [],
      refs: []
    });
  });

  it('reports routes missing from the spec, unless ignored', () => {
    const spec = goodSpec();
    delete spec.paths['/things/{id}'].delete;
    expect(specProblems({ spec, routes, generated, nameOf }).undocumented).toEqual(['DELETE /things/{id}']);
    expect(specProblems({ spec, routes, generated, nameOf, ignore: ['DELETE /things/{id}'] }).undocumented).toEqual([]);
  });

  it('reports bodies and parameters that do not ref what their route validates with', () => {
    const spec = goodSpec();
    spec.paths['/things'].post.requestBody = { content: { 'application/json': { schema: { $ref: '#/wrong' } } } };
    spec.paths['/things'].get.parameters = [];
    delete spec.paths['/things/{id}'].get.parameters;
    const { requests } = specProblems({ spec, routes, generated, nameOf });

    expect(requests).toHaveLength(3);
    expect(requests[0]).toMatch(/^GET \/things: query parameters should be/);
    expect(requests[1]).toMatch(/^POST \/things: body should \$ref .*CreateThingBody, not #\/wrong/);
    expect(requests[2]).toMatch(/^GET \/things\/\{id\}: path parameters should be/);
  });

  it('reports a body with no content at all', () => {
    const spec = goodSpec();
    delete spec.paths['/things'].post.requestBody;
    expect(specProblems({ spec, routes, generated, nameOf }).requests).toEqual([
      expect.stringMatching(/body should \$ref .*, not undefined/)
    ]);
  });

  it('reports $refs that point nowhere, in the spec, the generated file or elsewhere', () => {
    const spec = goodSpec();
    spec.paths['/things/latest'].get.responses = {
      '200': { $ref: '#/components/responses/Missing' },
      '201': { $ref: `./${GENERATED_SCHEMAS}#/Nope` },
      '202': { $ref: './other.json#/X' },
      '203': { $ref: './whole-file.json' }
    };
    expect(specProblems({ spec, routes, generated, nameOf }).refs).toEqual([
      '#/components/responses/Missing',
      `./${GENERATED_SCHEMAS}#/Nope`,
      './other.json#/X',
      './whole-file.json'
    ]);
  });

  it('treats a schema the generated file lacks as having no parameters', () => {
    const spec = goodSpec();
    spec.paths['/things'].get.parameters = [];
    // With nothing generated, no query parameters is right and a path parameter is not.
    expect(specProblems({ spec, routes, generated: {}, nameOf }).requests).toEqual([
      expect.stringMatching(/^GET \/things\/\{id\}/)
    ]);
  });
});

describe('loadSpec', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'openapi-testing-'));
    writeFileSync(path.join(dir, 'openapi.yml'), 'paths:\n  /things:\n    get: {}\n');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('reads the spec and its generated schemas', () => {
    mkdirSync(path.join(dir, 'generated'));
    writeFileSync(path.join(dir, GENERATED_SCHEMAS), JSON.stringify({ A: { type: 'string' } }));
    expect(loadSpec(dir)).toEqual({
      spec: { paths: { '/things': { get: {} } } },
      generated: { A: { type: 'string' } }
    });
  });

  it('reads the spec alone before anything is generated', () => {
    expect(loadSpec(dir).generated).toEqual({});
  });
});

describe('createResponseChecker', () => {
  const checker = createResponseChecker({ spec: goodSpec(), generated }, { specBase: '/api' });
  const check = (method: string, url: string, status: number, body?: unknown) =>
    checker.responseProblems({ method, url, status, body });

  it('matches literal paths before templated ones, and ignores the query string', () => {
    expect(checker.operationKey('GET', '/api/things/latest')).toBe('GET /things/latest');
    expect(checker.operationKey('GET', '/api/things/abc?x=1')).toBe('GET /things/{id}');
    expect(checker.operationKey('PUT', '/api/things/abc')).toBeUndefined();
  });

  it('accepts a body that matches its schema', () => {
    expect(check('GET', '/api/things/abc', 200, { name: 'a' })).toEqual([]);
    expect(check('GET', '/api/things?q=a', 200, [])).toEqual([]);
  });

  it('names each way a body is wrong', () => {
    expect(check('GET', '/api/things/abc', 200, { name: 1 })).toEqual([
      'GET /things/{id} 200: body/name must be string'
    ]);
    expect(check('GET', '/api/things/abc', 200, {})).toEqual([
      "GET /things/{id} 200: body must have required property 'name'"
    ]);
  });

  it('falls back to default, and follows a shared response to its schema', () => {
    expect(check('POST', '/api/things', 409, { error: 'Conflict' })).toEqual([]);
    expect(check('POST', '/api/things', 409, {})).toEqual([
      "POST /things 409: body must have required property 'error'"
    ]);
  });

  it('reports an undocumented status, an unknown operation, and a body the spec does not describe', () => {
    expect(check('GET', '/api/things/abc', 500, {})).toEqual([
      'GET /things/{id}: answered 500, which the spec does not document'
    ]);
    expect(check('PATCH', '/api/nothing', 200, {})).toEqual(['PATCH /api/nothing: no such operation in the spec']);
    expect(check('DELETE', '/api/things/abc', 204)).toEqual([]);
    expect(check('DELETE', '/api/things/abc', 204, { surprise: true })).toEqual([
      'DELETE /things/{id} 204: sends a JSON body, but the spec documents none'
    ]);
  });

  it('treats a missing shared response, or an operation without responses, as documenting no body', () => {
    const spec = goodSpec();
    spec.paths['/things/latest'].get.responses = { '200': { $ref: '#/components/responses/Missing' } };
    delete spec.paths['/things/{id}'].delete.responses;
    const bare = createResponseChecker({ spec, generated: {} });

    expect(bare.responseProblems({ method: 'GET', url: '/things/latest', status: 200, body: undefined })).toEqual([]);
    expect(bare.responseProblems({ method: 'DELETE', url: '/things/x', status: 204, body: undefined })).toEqual([
      'DELETE /things/{id}: answered 204, which the spec does not document'
    ]);
  });

  it('works for a spec without components', () => {
    const minimal = createResponseChecker({
      spec: { paths: { '/a': { get: { responses: { '200': { $ref: '#/components/responses/X' } } } } } },
      generated: {}
    });
    expect(minimal.responseProblems({ method: 'GET', url: '/a', status: 200, body: undefined })).toEqual([]);
  });

  it('reuses a compiled validator', () => {
    expect(check('GET', '/api/things/one', 200, { name: 'a' })).toEqual([]);
    expect(check('GET', '/api/things/two', 200, { name: 'b' })).toEqual([]);
  });
});
