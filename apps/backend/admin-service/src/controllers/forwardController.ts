import type { Request, RequestHandler, Response } from 'express';
import { beginAudit, settleAudit } from '../services/auditService';
import { callUpstream, isWrite, unconfirmed, upstreamUrl, type UpstreamName } from '../services/upstreamService';

/**
 * Hands the request to the service that owns it and relays the answer unchanged. A write is audited around the call:
 * pending before, then completed, rejected or (when the call failed in transit) uncertain.
 */
export function forwardTo(name: UpstreamName): RequestHandler {
  return async (req: Request, res: Response): Promise<void> => {
    const url = upstreamUrl(name, req);
    const write = isWrite(req.method);
    const auditId = write ? await beginAudit(req.user!.id, req.method, req.path) : undefined;
    let reply;
    try {
      reply = await callUpstream(name, url, req);
    } catch (error) {
      if (auditId) await settleAudit(auditId, 'uncertain');
      throw unconfirmed(error, write);
    }
    if (auditId) await settleAudit(auditId, reply.status < 400 ? 'completed' : 'rejected', reply.status);
    if (reply.retryAfter) res.setHeader('Retry-After', reply.retryAfter);
    res.status(reply.status).type(reply.contentType).send(reply.body);
  };
}
