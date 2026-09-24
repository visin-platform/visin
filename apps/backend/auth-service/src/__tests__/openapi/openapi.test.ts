import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import {
  GENERATED_SCHEMAS,
  buildRequestSchemas,
  collectRoutes,
  loadSpec,
  schemaNamer,
  specProblems
} from '@visin/backend-core/openapi-testing';
import { API_ROUTE_GROUPS } from '../../routes/apiRoutes';
import * as authSchemas from '../../validation/authSchemas';

/**
 * `docs/openapi.yml` checked against the routes the app really mounts.
 *
 * Request bodies and parameters that a route validates with Zod `$ref` JSON
 * Schema generated from those schemas, in `docs/generated/request-schemas.json`.
 * When a schema changes, run `npm run docs:generate` and commit the file.
 */

const DOCS_DIR = path.join(__dirname, '../../../docs');
const routes = collectRoutes(API_ROUTE_GROUPS);
const nameOf = schemaNamer([authSchemas]);
const requestSchemas = buildRequestSchemas(routes, nameOf);

if (process.env.UPDATE_OPENAPI_SCHEMAS) {
  mkdirSync(path.join(DOCS_DIR, 'generated'), { recursive: true });
  writeFileSync(path.join(DOCS_DIR, GENERATED_SCHEMAS), JSON.stringify(requestSchemas, null, 2) + '\n');
}

const { spec } = loadSpec(DOCS_DIR);
const problems = specProblems({ spec, routes, generated: requestSchemas, nameOf });

describe('docs/openapi.yml', () => {
  it(`has an up-to-date ${GENERATED_SCHEMAS} (npm run docs:generate)`, () => {
    const file = path.join(DOCS_DIR, GENERATED_SCHEMAS);
    expect(existsSync(file)).toBe(true);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(requestSchemas);
  });

  it('documents every route the app mounts', () => {
    expect(problems.undocumented).toEqual([]);
  });

  it('documents no route that the app does not mount', () => {
    expect(problems.stale).toEqual([]);
  });

  it('takes the bodies and parameters each route validates', () => {
    expect(problems.requests).toEqual([]);
  });

  it('has no $ref that points nowhere', () => {
    expect(problems.refs).toEqual([]);
  });
});
