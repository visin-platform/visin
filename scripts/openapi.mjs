#!/usr/bin/env node
/**
 * The services' API specs: linted, and bundled into the copies the docs site
 * publishes.
 *
 *   node scripts/openapi.mjs lint            # lint each service's docs/openapi.yml
 *   node scripts/openapi.mjs bundle          # write landing-front/public/openapi/<service>.json
 *   node scripts/openapi.mjs bundle --check  # fail if a published copy is stale
 *
 * landing-front's Docker build sees only its own directory, so it cannot read
 * a service's spec: the published copy is committed, and CI fails when it
 * drifts from the source (like lockfiles:check).
 *
 * A published copy is self-contained (the generated request schemas are
 * inlined), leaves out operations marked `x-internal: true`, and names its
 * server `{visinUrl}`: Visin is self-hosted, so there is no one address to
 * point a reader at.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { bundle, createConfig, formatProblems, lint } from '@redocly/openapi-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Specs held to the rules below, and whether the docs site publishes them.
 * A published spec names its server as a variable for the reader to fill in.
 */
const SPECS = {
  vision: {
    path: 'apps/backend/vision-service/docs/openapi.yml',
    publish: true,
    server: {
      url: '{visinUrl}/api',
      description: "Your deployment's vision-service",
      variables: {
        visinUrl: {
          default: 'http://localhost:4010',
          description: 'Your Visin API address. A local `docker compose up` answers at http://localhost:4010.'
        }
      }
    }
  },
  auth: {
    path: 'apps/backend/auth-service/docs/openapi.yml',
    publish: true,
    server: {
      url: '{authUrl}',
      description: "Your deployment's auth-service",
      variables: {
        authUrl: {
          default: 'http://localhost:5001',
          description: 'Your auth-service address. A local `docker compose up` answers at http://localhost:5001.'
        }
      }
    }
  }
};

const PUBLISHED_DIR = 'apps/frontend/landing-front/public/openapi';

const config = await createConfig({
  extends: ['recommended'],
  rules: {
    // Every operation names its controller (see operationId), says what it
    // answers when it fails, and has a summary for the reference's sidebar.
    'operation-operationId': 'error',
    'operation-4xx-response': 'error',
    'operation-summary': 'error',
    'tag-description': 'error',
    // Express matches `/trainings/uuid/{uuid}` before `/trainings/{id}/epochs`
    // by declaration order; the paths are real and cannot be made unambiguous.
    'no-ambiguous-paths': 'off',
    // Self-hosted: example.com and localhost are the only honest server URLs.
    'no-server-example.com': 'off'
  }
});

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'patch', 'options', 'head', 'trace'];

async function lintAll() {
  let failed = false;
  for (const [name, spec] of Object.entries(SPECS)) {
    const problems = await lint({ ref: join(ROOT, spec.path), config });
    if (problems.length === 0) {
      console.log(`  ${name}: no problems`);
      continue;
    }
    formatProblems(problems, { format: 'stylish', totals: { errors: 0, warnings: 0, ignored: 0 }, version: '' });
    failed = true;
  }
  return failed ? 1 : 0;
}

/** Every `#/components/...` a node refers to. */
const refsIn = (node, found = new Set()) => {
  if (Array.isArray(node)) node.forEach((child) => refsIn(child, found));
  else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === '$ref' && typeof value === 'string') found.add(value);
      else refsIn(value, found);
    }
  }
  return found;
};

async function published(spec) {
  const { bundle: result, problems } = await bundle({ ref: join(ROOT, spec.path), config, dereference: false });
  const errors = problems.filter((problem) => problem.severity === 'error');
  if (errors.length) {
    formatProblems(errors, { format: 'stylish', totals: { errors: 0, warnings: 0, ignored: 0 }, version: '' });
    throw new Error(`${spec.path} does not bundle`);
  }
  const doc = result.parsed;
  const schemas = doc.components.schemas;

  for (const [path, item] of Object.entries(doc.paths)) {
    for (const method of HTTP_METHODS) {
      const operation = item[method];
      if (!operation) continue;
      if (operation['x-internal']) {
        delete item[method];
        continue;
      }
      // A query parameter's schema is one property of a generated query
      // schema; bundling hoists each into a component of its own, which is
      // noise in a reference. They go back inline.
      for (const parameter of operation.parameters ?? []) {
        const ref = parameter.schema?.$ref;
        if (ref?.startsWith('#/components/schemas/')) parameter.schema = schemas[ref.split('/').pop()];
      }
    }
    if (!HTTP_METHODS.some((method) => item[method])) delete doc.paths[path];
  }

  // Components nothing refers to any more, until none are left.
  for (let removed = true; removed;) {
    removed = false;
    const used = refsIn({ ...doc, components: { ...doc.components, schemas: {} } });
    for (const [name, schema] of Object.entries(schemas)) refsIn(schema, used);
    for (const name of Object.keys(schemas)) {
      if (!used.has(`#/components/schemas/${name}`)) {
        delete schemas[name];
        removed = true;
      }
    }
  }

  // Shared responses, security schemes and tags only the dropped operations used.
  const operations = Object.values(doc.paths).flatMap((item) =>
    HTTP_METHODS.map((method) => item[method]).filter(Boolean)
  );
  const usedRefs = refsIn(doc.paths);
  for (const name of Object.keys(doc.components.responses ?? {})) {
    if (!usedRefs.has(`#/components/responses/${name}`)) delete doc.components.responses[name];
  }
  const usedSchemes = new Set(operations.flatMap((operation) => (operation.security ?? []).flatMap(Object.keys)));
  for (const name of Object.keys(doc.components.securitySchemes ?? {})) {
    if (!usedSchemes.has(name)) delete doc.components.securitySchemes[name];
  }
  const usedTags = new Set(operations.flatMap((operation) => operation.tags ?? []));
  doc.tags = (doc.tags ?? []).filter((tag) => usedTags.has(tag.name));

  doc.servers = [spec.server];
  return JSON.stringify(doc, null, 2) + '\n';
}

async function bundleAll(check) {
  let stale = false;
  for (const [name, spec] of Object.entries(SPECS)) {
    if (!spec.publish) continue;
    const target = join(ROOT, PUBLISHED_DIR, `${name}.json`);
    const content = await published(spec);
    if (check) {
      let current = '';
      try {
        current = readFileSync(target, 'utf8');
      } catch {
        // missing counts as stale
      }
      if (current !== content) {
        console.error(`  ${name}: ${PUBLISHED_DIR}/${name}.json is stale; run npm run openapi:bundle`);
        stale = true;
      } else console.log(`  ${name}: up to date`);
    } else {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
      console.log(`  wrote ${PUBLISHED_DIR}/${name}.json`);
    }
  }
  return stale ? 1 : 0;
}

const [command, flag] = process.argv.slice(2);
if (command === 'lint') process.exitCode = await lintAll();
else if (command === 'bundle') process.exitCode = await bundleAll(flag === '--check');
else {
  console.error('usage: node scripts/openapi.mjs lint | bundle [--check]');
  process.exitCode = 2;
}
