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
import * as apiTokenSchemas from '../../validation/apiTokenSchemas';
import * as benchmarkSchemas from '../../validation/benchmarkSchemas';
import * as comparisonSchemas from '../../validation/comparisonSchemas';
import * as configSchemas from '../../validation/configSchemas';
import * as epochSchemas from '../../validation/epochSchemas';
import * as findingSchemas from '../../validation/findingSchemas';
import * as projectSchemas from '../../validation/projectSchemas';
import * as testResultSchemas from '../../validation/testResultSchemas';
import * as trainingSchemas from '../../validation/trainingSchemas';
import * as visualizationSchemas from '../../validation/visualizationSchemas';
import * as writeCapabilitiesSchemas from '../../validation/writeCapabilitiesSchemas';

/**
 * `docs/openapi.yml` checked against the routes the app really mounts.
 *
 * Request bodies and query parameters are never typed into the spec by hand:
 * they `$ref` JSON Schema generated from the Zod schemas each route validates
 * with, in `docs/generated/request-schemas.json`. When a schema changes, run
 * `npm run docs:generate` and commit the file.
 */

const DOCS_DIR = path.join(__dirname, '../../../docs');
const routes = collectRoutes(API_ROUTE_GROUPS, { specBase: '/api' });
const nameOf = schemaNamer([
  apiTokenSchemas,
  benchmarkSchemas,
  comparisonSchemas,
  configSchemas,
  epochSchemas,
  findingSchemas,
  projectSchemas,
  testResultSchemas,
  trainingSchemas,
  visualizationSchemas,
  writeCapabilitiesSchemas
]);
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
