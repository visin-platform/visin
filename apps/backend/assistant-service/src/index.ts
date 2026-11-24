import { apiProgram, run } from './bootstrap';

// The API. Vivi's worker is `index.worker.ts`; `index.all.ts` runs both in one process.
run(apiProgram);
