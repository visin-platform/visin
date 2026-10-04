/**
 * Jest global setup for the services whose suites use an in-memory MongoDB.
 *
 * The mongodb driver imports `os` dynamically, which under Jest only works with
 * `node --experimental-vm-modules` (every service's `npm test` sets it). Without
 * the flag the driver sends an empty client handshake and mongod refuses it, so
 * every such suite fails in `beforeAll`; the suite's teardown then never reaches
 * `mongo.stop()`, and Jest sits on the orphaned mongod for good. Failing here, at
 * once and with the reason, replaces that hang.
 */
const FLAG = '--experimental-vm-modules';

module.exports = async function requireVmModules() {
  const enabled = (process.env.NODE_OPTIONS ?? '').split(/\s+/).includes(FLAG) || process.execArgv.includes(FLAG);
  if (!enabled) {
    throw new Error(
      `These tests need node's ${FLAG} flag; running jest directly (npx jest) leaves it out. ` +
        'Run them with `npm test --workspace=<service>` (or `npm run test:coverage`), which sets it.'
    );
  }
};
