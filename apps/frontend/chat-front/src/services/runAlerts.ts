import { api, apiPut } from './apiClient';

/** Whether this person is told, on the devices they turned notifications on for, when their runs finish or fail. */
export const getRunAlerts = () => api<{ runs: boolean }>('/push/preferences').then((preference) => preference.runs);
export const setRunAlerts = (runs: boolean) =>
  apiPut<{ runs: boolean }>('/push/preferences', { runs }).then((preference) => preference.runs);
