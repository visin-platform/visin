import { allProgram, run } from './bootstrap';

// The API and the worker in one process: local development, or a deployment of a single container.
run(allProgram);
