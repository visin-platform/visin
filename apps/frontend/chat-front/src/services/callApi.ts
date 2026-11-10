import type { CallApi } from './callEngine';
import type { CallsConfig } from '../types/call';
import { api, apiSend } from './apiClient';

/** The call endpoints of chat-service. Errors keep the server's reason ("alice is on another call") for the screen. */
export const callApi: CallApi = {
  iceServers: () => api('/calls/ice-servers'),
  currentCall: () => api('/calls/current'),
  startCall: (conversationId, deviceId) => api(`/conversations/${conversationId}/calls`, { deviceId }),
  acceptCall: (callId, deviceId) => api(`/calls/${callId}/accept`, { deviceId }),
  declineCall: async (callId) => void (await api(`/calls/${callId}/decline`, {})),
  endCall: async (callId) => void (await api(`/calls/${callId}/end`, {})),
  sendSignal: (callId, deviceId, data) => apiSend(`/calls/${callId}/signal`, { deviceId, data })
};

export const callsConfig = () => api<CallsConfig>('/calls/config');
