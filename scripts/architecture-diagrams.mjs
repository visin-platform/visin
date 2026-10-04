#!/usr/bin/env node
/**
 * Draw the architecture diagrams the docs show at /docs/architecture, into
 * landing-front's public/architecture/, where each is also a stable link for
 * slides and write-ups.
 *
 * Every box is placed by hand on a grid, not by an auto-layout: that is what
 * keeps a diagram narrow enough for the docs column (800 wide) instead of one
 * long row of apps or services. To change a diagram, change it here, run this,
 * and look at the result; CI fails if the committed SVGs differ from what this
 * draws.
 *
 * What the diagrams say is read off the code by hand: which service calls
 * which (each service's `src/clients/`), which API each front calls (its
 * config), and the upload flow (vision-front's chunkedUpload, dataset-service's
 * queue). A new service or a new call between services belongs here too.
 *
 *   node scripts/architecture-diagrams.mjs          # write them
 *   node scripts/architecture-diagrams.mjs --check  # fail if any is out of date
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../apps/frontend/landing-front/public/architecture');
const check = process.argv.includes('--check');

// Visin's light palette (libs/frontend-core/src/theme/tokens.ts).
const C = {
  ink: '#0f172a',
  body: '#475569',
  muted: '#64748b',
  line: '#64748b',
  frame: '#cbd5e1',
  frameFill: '#f8fafc',
  brand: '#2563eb',
  brandSoft: '#dbeafe',
  web: '#eff6ff',
  data: '#4f46e5',
  dataFill: '#eef2ff',
  ext: '#f1f5f9',
  white: '#ffffff',
  onBrand: '#dbeafe',
  onInk: '#cbd5e1',
  chipText: '#1e3a8a'
};
const FONT = "Inter, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Rough text width, for sizing label pills.
const textW = (s, size) =>
  [...s].reduce(
    (w, ch) => w + (/[il.,:'|! ]/.test(ch) ? 0.3 : /[mwMW]/.test(ch) ? 0.85 : /[A-Z]/.test(ch) ? 0.66 : 0.55),
    0
  ) * size;

function doc(w, h, title, desc, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="${FONT}" role="img" aria-labelledby="title desc">
  <title id="title">${esc(title)}</title>
  <desc id="desc">${esc(desc)}</desc>
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="${C.line}"/>
    </marker>
    <marker id="arrow-brand" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="${C.brand}"/>
    </marker>
  </defs>
  <rect width="${w}" height="${h}" fill="${C.white}"/>
${body.join('\n')}
</svg>
`;
}

// Title, then an optional [technology] line, then description lines.
function texts({ x, y, w, title, tech, lines = [], color, sub, align = 'start', titleSize = 15 }) {
  const ax = align === 'middle' ? x + w / 2 : x;
  const parts = [];
  let cy = y;
  parts.push(
    `<text x="${ax}" y="${cy}" font-size="${titleSize}" font-weight="700" fill="${color}" text-anchor="${align}">${esc(title)}</text>`
  );
  cy += 16;
  if (tech) {
    parts.push(`<text x="${ax}" y="${cy}" font-size="11" fill="${sub}" text-anchor="${align}">[${esc(tech)}]</text>`);
    cy += 17;
  } else cy += 2;
  for (const l of lines) {
    parts.push(`<text x="${ax}" y="${cy}" font-size="12" fill="${sub}" text-anchor="${align}">${esc(l)}</text>`);
    cy += 15;
  }
  return parts.join('\n    ');
}

// The APIs a web app calls, as a row of pills along its bottom edge.
function chips(x, y, list) {
  let cx = x;
  return list
    .map((c) => {
      const w = textW(c, 11) + 14;
      const s = `<rect x="${cx}" y="${y}" width="${w.toFixed(1)}" height="18" rx="9" fill="${C.brandSoft}"/><text x="${(cx + w / 2).toFixed(1)}" y="${y + 12.5}" font-size="11" font-weight="600" fill="${C.chipText}" text-anchor="middle">${esc(c)}</text>`;
      cx += w + 6;
      return s;
    })
    .join('');
}

const node = {
  person({ x, y, w, h, title, lines }) {
    return `  <g><!-- person: ${title} -->
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${C.ink}"/>
    <circle cx="${x + 24}" cy="${y + h / 2 - 7}" r="6" fill="none" stroke="${C.onBrand}" stroke-width="1.6"/>
    <path d="M${x + 14},${y + h / 2 + 11} a10,9 0 0 1 20,0" fill="none" stroke="${C.onBrand}" stroke-width="1.6"/>
    ${texts({ x: x + 44, y: y + (h - 15 * lines.length) / 2 + 6, w, title, lines, color: C.white, sub: C.onInk })}
  </g>`;
  },
  web({ x, y, w, h, title, tech, lines, calls }) {
    return `  <g><!-- web app: ${title} -->
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${C.web}" stroke="${C.brand}" stroke-width="1.5"/>
    <path d="M${x},${y + 16} h${w}" stroke="${C.brand}" stroke-width="1" opacity="0.5"/>
    <circle cx="${x + 10}" cy="${y + 8}" r="2.5" fill="${C.brand}" opacity="0.6"/><circle cx="${x + 18}" cy="${y + 8}" r="2.5" fill="${C.brand}" opacity="0.6"/><circle cx="${x + 26}" cy="${y + 8}" r="2.5" fill="${C.brand}" opacity="0.6"/>
    ${texts({ x: x + 12, y: y + 36, w, title, tech, lines, color: C.ink, sub: C.body })}
    ${calls ? chips(x + 12, y + h - 28, calls) : ''}
  </g>`;
  },
  service({ x, y, w, h, title, tech, lines, align, dy = 0 }) {
    const tx = align === 'middle' ? x : x + 12;
    return `  <g><!-- service: ${title} -->
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${C.brand}"/>
    ${texts({ x: tx, y: y + 24 + dy, w, title, tech, lines, color: C.white, sub: C.onBrand, align })}
  </g>`;
  },
  data({ x, y, w, h, title, tech, lines }) {
    const ry = 8;
    return `  <g><!-- data store: ${title} -->
    <path d="M${x},${y + ry} v${h - 2 * ry} a${w / 2},${ry} 0 0 0 ${w},0 v${-(h - 2 * ry)}" fill="${C.dataFill}" stroke="${C.data}" stroke-width="1.5"/>
    <ellipse cx="${x + w / 2}" cy="${y + ry}" rx="${w / 2}" ry="${ry}" fill="${C.dataFill}" stroke="${C.data}" stroke-width="1.5"/>
    ${texts({ x: x + 12, y: y + 36, w, title, tech, lines, color: C.ink, sub: C.body })}
  </g>`;
  },
  external({ x, y, w, h, title, tech, lines }) {
    return `  <g><!-- external: ${title} -->
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${C.ext}" stroke="${C.muted}" stroke-width="1.2" stroke-dasharray="5 4"/>
    ${texts({ x: x + 12, y: y + 26, w, title, tech, lines, color: C.ink, sub: C.body })}
  </g>`;
  },
  system({ x, y, w, h, title, lines }) {
    return `  <g><!-- system: ${title} -->
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${C.brand}"/>
    ${texts({ x, y: y + (h - 15 * lines.length) / 2 + 4, w, title, lines, color: C.white, sub: C.onBrand, align: 'middle', titleSize: 20 })}
  </g>`;
  }
};

function frame({ x, y, w, h, label, note }) {
  return `  <g><!-- group: ${label} -->
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${C.frameFill}" stroke="${C.frame}" stroke-width="1.2" stroke-dasharray="6 4"/>
    <text x="${x + 14}" y="${y + 20}" font-size="11" font-weight="700" letter-spacing="1" fill="${C.muted}">${esc(label.toUpperCase())}${note ? `<tspan font-weight="400" letter-spacing="0">  ·  ${esc(note)}</tspan>` : ''}</text>
  </g>`;
}

// A connection: a polyline with an arrowhead, and an optional label pill
// (a second label line is the technology, smaller) centred on `at`.
function edge(points, { label, at, anchor = 'middle' } = {}) {
  const d = points.map(([px, py], i) => `${i ? 'L' : 'M'}${px},${py}`).join(' ');
  const parts = [`<path d="${d}" fill="none" stroke="${C.line}" stroke-width="1.6" marker-end="url(#arrow)"/>`];
  if (label) {
    const lines = Array.isArray(label) ? label : [label];
    const [lx, ly] = at ?? points[0].map((v, i) => (v + points[points.length - 1][i]) / 2);
    const w = Math.max(...lines.map((l, i) => textW(l, i ? 10.5 : 11.5))) + 16;
    const h = lines.length * 14 + 6;
    const rx = anchor === 'middle' ? lx - w / 2 : anchor === 'end' ? lx - w : lx;
    parts.push(
      `<rect x="${rx.toFixed(1)}" y="${ly - h / 2}" width="${w.toFixed(1)}" height="${h}" rx="6" fill="${C.white}" stroke="${C.frame}"/>`
    );
    lines.forEach((l, i) =>
      parts.push(
        `<text x="${(rx + w / 2).toFixed(1)}" y="${ly - h / 2 + 15 + i * 14}" font-size="${i ? 10.5 : 11.5}" fill="${i ? C.muted : C.ink}" text-anchor="middle">${esc(l)}</text>`
      )
    );
  }
  return `  <g>${parts.join('')}</g>`;
}

function legend(x, y, items) {
  const parts = [];
  let cx = x;
  for (const it of items) {
    const sw =
      it === 'person'
        ? `<rect x="${cx}" y="${y}" width="22" height="14" rx="4" fill="${C.ink}"/>`
        : it === 'web'
          ? `<rect x="${cx}" y="${y}" width="22" height="14" rx="3" fill="${C.web}" stroke="${C.brand}" stroke-width="1.2"/>`
          : it === 'service'
            ? `<rect x="${cx}" y="${y}" width="22" height="14" rx="3" fill="${C.brand}"/>`
            : it === 'data'
              ? `<rect x="${cx}" y="${y}" width="22" height="14" rx="6" fill="${C.dataFill}" stroke="${C.data}" stroke-width="1.2"/>`
              : `<rect x="${cx}" y="${y}" width="22" height="14" rx="3" fill="${C.ext}" stroke="${C.muted}" stroke-dasharray="3 2"/>`;
    const name = {
      person: 'Person or script',
      web: 'Web app',
      service: 'Backend service',
      data: 'Data store',
      external: 'External system'
    }[it];
    parts.push(sw, `<text x="${cx + 30}" y="${y + 11}" font-size="12" fill="${C.body}">${name}</text>`);
    cx += 30 + textW(name, 12) + 28;
  }
  return `  <g><!-- legend -->${parts.join('')}</g>`;
}

const files = {};

// ------------------------------------------------------------------ context
files['context.svg'] = doc(
  800,
  470,
  'Visin: system context',
  'Researchers use Visin in the browser, training scripts report runs to it with a pipeline key, and AI assistants call it over MCP. Visin can use Google for sign-in.',
  [
    node.person({
      x: 20,
      y: 20,
      w: 240,
      h: 72,
      title: 'Researcher',
      lines: ['Projects, datasets and labeling,', 'in the browser']
    }),
    node.person({
      x: 280,
      y: 20,
      w: 240,
      h: 72,
      title: 'Training script',
      lines: ['Reports epochs, results and', 'frames through visin-py']
    }),
    node.person({
      x: 540,
      y: 20,
      w: 240,
      h: 72,
      title: 'AI assistant',
      lines: ['Claude or another MCP client,', 'acting for a signed-in user']
    }),
    node.system({
      x: 20,
      y: 200,
      w: 760,
      h: 100,
      title: 'Visin',
      lines: [
        'Computer-vision platform: datasets, labeling, training runs',
        'and the metrics that come out of them. Self-hosted.'
      ]
    }),
    node.external({
      x: 290,
      y: 380,
      w: 220,
      h: 70,
      title: 'Google',
      tech: 'OpenID Connect',
      lines: ['Sign in with Google (optional)']
    }),
    edge(
      [
        [140, 92],
        [140, 200]
      ],
      { label: ['works in the browser', 'HTTPS, session cookie'], at: [140, 146] }
    ),
    edge(
      [
        [400, 92],
        [400, 200]
      ],
      { label: ['reports runs', 'HTTPS, pipeline key'], at: [400, 146] }
    ),
    edge(
      [
        [660, 92],
        [660, 200]
      ],
      { label: ['calls tools', 'MCP, OAuth 2.1'], at: [660, 146] }
    ),
    edge(
      [
        [400, 300],
        [400, 380]
      ],
      { label: 'verifies sign-in', at: [400, 340] }
    )
  ]
);

// --------------------------------------------------------------- containers
{
  const b = [];
  // Actors
  b.push(node.person({ x: 170, y: 20, w: 240, h: 64, title: 'Researcher', lines: ['in the browser'] }));
  b.push(node.person({ x: 590, y: 20, w: 190, h: 64, title: 'Training script', lines: ['visin-py, pipeline key'] }));
  b.push(node.person({ x: 620, y: 170, w: 160, h: 64, title: 'AI assistant', lines: ['MCP client'] }));

  // Web apps: 3 x 2
  b.push(frame({ x: 20, y: 130, w: 540, h: 250, label: 'Web apps', note: 'React, in the browser' }));
  const wx = [34, 210, 386];
  const web = [
    ['App shell', ['The app people open,', 'with the next three inside']],
    ['Vision', ['Projects, runs, metrics,', 'frames and datasets']],
    ['Labeling', ['Labeling jobs and', 'annotation tools']],
    ['Account', ['Profile, groups, API keys,', 'assistant connections']],
    ['Sign-in', ['Sign-in and the consent', 'page for assistants']],
    ['Landing', ['Public site, docs and', 'API reference']]
  ];
  web.forEach(([title, lines], i) =>
    b.push(node.web({ x: wx[i % 3], y: 160 + Math.floor(i / 3) * 104, w: 160, h: 94, title, lines }))
  );

  // Backend: 4 + 3
  b.push(
    frame({ x: 20, y: 440, w: 760, h: 240, label: 'Backend services', note: 'Node.js, Express, one per concern' })
  );
  const bx = [33, 221, 409, 597];
  const svc = [
    ['Auth', ['Users, sessions, API keys;', 'OAuth server for assistants']],
    ['Group', ['Groups and memberships:', 'who may use what']],
    ['Vision', ['Projects, training runs,', 'results and benchmarks']],
    ['Dataset', ['Dataset upload, queued', 'import, serving images']],
    ['Label', ['Labeling jobs and their', 'tasks over a dataset']],
    ['File', ['Stores and streams files,', 'signed URLs, chunked']],
    ['MCP', ['Model Context Protocol', 'server for assistants']]
  ];
  svc.forEach(([title, lines], i) =>
    b.push(
      node.service({
        x: bx[i % 4],
        y: 470 + Math.floor(i / 4) * 102,
        w: 170,
        h: 88,
        title: `${title} service`,
        lines,
        dy: 4
      })
    )
  );

  // Data
  b.push(frame({ x: 20, y: 750, w: 540, h: 138, label: 'Data' }));
  b.push(node.data({ x: 34, y: 784, w: 160, h: 90, title: 'MongoDB', lines: ["Every service's", 'collections'] }));
  b.push(node.data({ x: 210, y: 784, w: 160, h: 90, title: 'Redis', lines: ['Dataset import', 'queue (BullMQ)'] }));
  b.push(
    node.data({
      x: 386,
      y: 784,
      w: 160,
      h: 90,
      title: 'File storage',
      lines: ['A disk volume the', 'file service owns']
    })
  );
  b.push(
    node.external({
      x: 590,
      y: 784,
      w: 190,
      h: 90,
      title: 'Google',
      tech: 'OpenID Connect',
      lines: ['Sign in with Google,', 'when configured']
    })
  );

  // Connections, layer to layer
  b.push(
    edge(
      [
        [290, 84],
        [290, 130]
      ],
      { label: 'works in', at: [290, 107] }
    )
  );
  b.push(
    edge(
      [
        [290, 380],
        [290, 440]
      ],
      { label: ['call the APIs', 'HTTPS, JSON, session cookie'], at: [290, 410] }
    )
  );
  b.push(
    edge(
      [
        [600, 84],
        [600, 440]
      ],
      { label: ['reports runs', 'to the Vision service'], at: [592, 410], anchor: 'end' }
    )
  );
  b.push(
    edge(
      [
        [700, 234],
        [700, 440]
      ],
      { label: ['calls tools', 'MCP service'], at: [708, 410], anchor: 'start' }
    )
  );
  b.push(
    edge(
      [
        [290, 680],
        [290, 750]
      ],
      { label: 'read and write', at: [290, 715] }
    )
  );
  b.push(
    edge(
      [
        [685, 680],
        [685, 784]
      ],
      { label: ['verifies sign-in', 'Auth service'], at: [685, 730] }
    )
  );

  b.push(legend(20, 916, ['person', 'web', 'service', 'data', 'external']));
  files['containers.svg'] = doc(
    800,
    950,
    'Visin: containers',
    'Six web apps run in the browser and call seven backend services over HTTPS. Training scripts report to the Vision service and AI assistants call the MCP service. The services store data in MongoDB, Redis and a file-storage volume.',
    b
  );
}

// ----------------------------------------------------------------- services
{
  const b = [];
  const mx = 300,
    mw = 200,
    bh = 76,
    gap = 56,
    top = 20;
  const rowY = (i) => top + i * (bh + gap);
  const cy = (i) => rowY(i) + bh / 2;
  const bottom = rowY(4) + bh;

  // The two services the others lean on, as tall bars either side.
  b.push(
    node.service({
      x: 20,
      y: top,
      w: 140,
      h: bottom - top,
      title: 'Group service',
      lines: ['Groups and', 'memberships:', 'who may use', 'which project', 'or dataset'],
      dy: (bottom - top) / 2 - 60
    })
  );
  b.push(
    node.service({
      x: 640,
      y: rowY(1),
      w: 140,
      h: bottom - rowY(1),
      title: 'File service',
      lines: ['Stores and', 'streams files;', 'hands browsers', 'signed URLs'],
      dy: (bottom - rowY(1)) / 2 - 52
    })
  );

  const mid = [
    ['Auth service', ['Users, sessions, API keys']],
    ['Vision service', ['Projects, runs, results']],
    ['MCP service', ['Tools for AI assistants']],
    ['Dataset service', ['Upload, import, images'], 'BullMQ on Redis'],
    ['Label service', ['Labeling jobs and tasks']]
  ];
  mid.forEach(([title, lines, tech], i) =>
    b.push(node.service({ x: mx, y: rowY(i), w: mw, h: bh, title, tech, lines, dy: tech ? -2 : 6 }))
  );

  // To and from the group service: service → group above, group → service below.
  const toGroup = [
    [0, 'group roles', 'user search'],
    [1, 'editor groups', 'owned projects'],
    [3, 'group access', 'owned datasets'],
    [4, 'group access', null]
  ];
  for (const [i, up, down] of toGroup) {
    const y1 = down ? cy(i) - 10 : cy(i);
    b.push(
      edge(
        [
          [mx, y1],
          [160, y1]
        ],
        { label: up, at: [230, y1 - 16] }
      )
    );
    if (down)
      b.push(
        edge(
          [
            [160, cy(i) + 10],
            [mx, cy(i) + 10]
          ],
          { label: down, at: [230, cy(i) + 26] }
        )
      );
  }
  // To the file service.
  for (const [i, label] of [
    [1, 'visualizations'],
    [3, 'zips and images'],
    [4, 'label bundles']
  ]) {
    b.push(
      edge(
        [
          [mx + mw, cy(i)],
          [640, cy(i)]
        ],
        { label, at: [570, cy(i) - 16] }
      )
    );
  }
  // Within the column.
  const vx = 400;
  b.push(
    edge(
      [
        [vx, rowY(0) + bh],
        [vx, rowY(1)]
      ],
      { label: "a pipeline key's project", at: [vx, rowY(1) - gap / 2] }
    )
  );
  b.push(
    edge(
      [
        [vx, rowY(2)],
        [vx, rowY(1) + bh]
      ],
      { label: 'tool calls', at: [vx, rowY(2) - gap / 2] }
    )
  );
  b.push(
    edge(
      [
        [vx, rowY(2) + bh],
        [vx, rowY(3)]
      ],
      { label: 'dataset tools', at: [vx, rowY(3) - gap / 2] }
    )
  );
  b.push(
    edge(
      [
        [vx, rowY(4)],
        [vx, rowY(3) + bh]
      ],
      { label: 'job images', at: [vx, rowY(4) - gap / 2] }
    )
  );

  b.push(edge([[mx + mw, cy(1) + 20], [545, cy(1) + 20], [545, cy(3) - 20], [mx + mw, cy(3) - 20]],
    { label: 'dataset refs', at: [575, cy(2) - 14] }));
  b.push(edge([[mx + mw, cy(3) + 20], [605, cy(3) + 20], [605, cy(1) - 20], [mx + mw, cy(1) - 20]],
    { label: 'project owner', at: [575, cy(2) + 14] }));

  // Stores
  const sy = bottom + 40;
  b.push(
    node.data({
      x: 20,
      y: sy,
      w: 600,
      h: 70,
      title: 'MongoDB',
      lines: ['Every service reads and writes its own collections']
    })
  );
  b.push(node.data({ x: 640, y: sy, w: 140, h: 70, title: 'File storage', lines: ['disk volume'] }));
  b.push(
    edge([
      [710, bottom],
      [710, sy]
    ])
  );

  files['services.svg'] = doc(
    800,
    sy + 90,
    'Visin: service to service',
    'Calls between the backend services. The auth, vision, dataset and label services check access with the group service, which in turn searches users and lists what a group owns. The vision, dataset and label services store files through the file service. The MCP service calls the vision and dataset services. Vision resolves dataset references through Dataset; Dataset verifies a pipeline key’s project owner and current permissions through Vision.',
    b
  );
}

// ----------------------------------------------------------------- web apps
{
  const b = [];
  b.push(
    node.web({
      x: 20,
      y: 20,
      w: 760,
      h: 100,
      title: 'App shell',
      lines: [
        'The app people open. Owns the router, the one layout and the home page, and renders the three apps below in one page.'
      ],
      calls: ['Auth API', 'Vision API', 'Label API', 'Group API']
    })
  );
  const rx = [20, 280, 540];
  const remotes = [
    ['Vision', ['Projects, runs, metrics, prediction', 'frames and datasets'], ['Vision API', 'Dataset API', 'Files']],
    ['Labeling', ['Labeling jobs and the', 'annotation tools'], ['Label API']],
    ['Account', ['Profile, groups, API keys and', 'assistant connections'], ['Auth API', 'Group API']]
  ];
  remotes.forEach(([title, lines, calls], i) => {
    b.push(
      edge(
        [
          [rx[i] + 120, 120],
          [rx[i] + 120, 196]
        ],
        i === 1 ? { label: ['loads its code at runtime', 'Module Federation'], at: [rx[i] + 120, 158] } : {}
      )
    );
    b.push(node.web({ x: rx[i], y: 196, w: 240, h: 116, title, lines, calls }));
  });
  b.push(
    `  <text x="20" y="336" font-size="11.5" fill="${C.muted}">Each of these three also runs on its own address, without the shell.</text>`
  );

  b.push(
    frame({
      x: 20,
      y: 366,
      w: 760,
      h: 150,
      label: 'On their own',
      note: 'the other apps send a signed-out visitor to Sign-in'
    })
  );
  b.push(
    node.web({
      x: 34,
      y: 392,
      w: 358,
      h: 108,
      title: 'Sign-in',
      lines: ['Sign-in, sign-up and the consent page an', 'assistant asks through'],
      calls: ['Auth API', 'Google']
    })
  );
  b.push(
    node.web({
      x: 408,
      y: 392,
      w: 358,
      h: 108,
      title: 'Landing',
      lines: ['The public site, these docs, a leaderboard', 'preview, and the API reference\'s "try it"'],
      calls: ['Vision API', 'Auth API']
    })
  );

  files['web-apps.svg'] = doc(
    800,
    536,
    'Visin: web apps',
    'The app shell loads Vision, Labeling and Account at runtime with Module Federation and renders them in one page. Sign-in and Landing run on their own. Each app is labelled with the APIs it calls.',
    b
  );
}

// ---------------------------------------------------------- dataset upload
{
  const b = [];
  const lanes = [
    ['Browser', 'Vision app'],
    ['Dataset service', 'API'],
    ['Redis', 'queue'],
    ['Import worker', 'in the dataset service'],
    ['File service', ''],
    ['MongoDB', '']
  ];
  const lx = (i) => 20 + 60 + i * 128; // lane centres: 80 … 720
  const head = 56;
  const kinds = ['web', 'service', 'data', 'service', 'service', 'data'];
  lanes.forEach(([t, s], i) => {
    const x = lx(i) - 60;
    const fill = kinds[i] === 'web' ? C.web : kinds[i] === 'data' ? C.dataFill : C.brand;
    const stroke = kinds[i] === 'web' ? C.brand : kinds[i] === 'data' ? C.data : C.brand;
    const color = kinds[i] === 'service' ? C.white : C.ink;
    const sub = kinds[i] === 'service' ? C.onBrand : C.body;
    b.push(
      `  <g><rect x="${x}" y="20" width="120" height="${head - 8}" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="1.4"/><text x="${lx(i)}" y="${s ? 40 : 49}" font-size="13" font-weight="700" fill="${color}" text-anchor="middle">${esc(t)}</text>${s ? `<text x="${lx(i)}" y="56" font-size="10.5" fill="${sub}" text-anchor="middle">${esc(s)}</text>` : ''}</g>`
    );
  });
  const steps = [
    [0, 1, 'asks where to upload the zip'],
    [1, 4, 'gets a signed upload URL'],
    [0, 4, 'sends the zip straight here, in 64 MiB chunks'],
    [0, 1, 'reports the upload done'],
    [1, 4, 'checks the bytes arrived'],
    [1, 2, 'queues a scan'],
    [2, 3, 'scan job'],
    [3, 4, 'reads the zip, lists its contents'],
    [0, 1, 'maps the folders, starts the import'],
    [1, 2, 'queues the import'],
    [2, 3, 'import job'],
    [3, 4, 'stores each image'],
    [3, 5, 'stores the dataset items']
  ];
  const top = 20 + head + 14;
  const step = 40;
  const end = top + steps.length * step + 10;
  lanes.forEach((_, i) =>
    b.push(
      `  <path d="M${lx(i)},${20 + head - 8} V${end}" stroke="${C.frame}" stroke-width="1.5" stroke-dasharray="4 4"/>`
    )
  );
  // Every step runs left to right; the browser's own steps are drawn in blue.
  steps.forEach(([from, to, label], i) => {
    const y = top + i * step + 24;
    const x1 = lx(from) + 4;
    const own = from === 0;
    b.push(
      `  <g><path d="M${x1},${y} H${lx(to) - 4}" stroke="${own ? C.brand : C.line}" stroke-width="1.6" fill="none" marker-end="url(#${own ? 'arrow-brand' : 'arrow'})"/>` +
        `<circle cx="${x1 + 12}" cy="${y - 11}" r="8" fill="${own ? C.brand : C.line}"/><text x="${x1 + 12}" y="${y - 7.5}" font-size="10" font-weight="700" fill="${C.white}" text-anchor="middle">${i + 1}</text>` +
        `<text x="${x1 + 26}" y="${y - 7}" font-size="11.5" fill="${C.ink}" stroke="${C.white}" stroke-width="4" paint-order="stroke">${esc(label)}</text></g>`
    );
  });
  files['dataset-upload.svg'] = doc(
    800,
    end + 20,
    'Visin: uploading a dataset',
    'The browser asks the dataset service for a signed URL and sends the zip straight to the file service in 64 MiB chunks. The dataset service queues a scan and, once the person maps the contents, an import; a worker reads the zip, stores each image in the file service and the items in MongoDB.',
    b
  );
}

const stale = [];
for (const [name, svg] of Object.entries(files)) {
  const file = join(out, name);
  if (check) {
    if (!existsSync(file) || readFileSync(file, 'utf8') !== svg) stale.push(name);
  } else {
    mkdirSync(out, { recursive: true });
    writeFileSync(file, svg);
  }
}
if (stale.length) {
  console.error(`Out of date: ${stale.join(', ')}. Run \`npm run diagrams\` and commit the result.`);
  process.exit(1);
}
console.log(check ? 'Architecture diagrams are current.' : `Wrote ${Object.keys(files).join(', ')} to ${out}`);
