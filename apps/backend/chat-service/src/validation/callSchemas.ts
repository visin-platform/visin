import { z } from 'zod';

/** Which browser tab is in a call. Made up by the client per page load; it only tells one person's tabs apart. */
export const deviceId = z.string().min(8).max(64);

export const callDeviceSchema = z.object({ deviceId });

/**
 * One WebRTC signal: an offer, an answer, a candidate, or "I started / stopped showing my screen or camera". The SDP
 * ceiling is generous for an offer with audio and two video lines (ten to twenty kilobytes in the browsers that write
 * the longest) and still stops a call being used to shovel data.
 */
export const callSignalSchema = z.object({
  deviceId,
  data: z
    .object({
      description: z.object({ type: z.enum(['offer', 'answer']), sdp: z.string().max(50_000) }).optional(),
      candidate: z
        .object({
          candidate: z.string().max(1_000),
          sdpMid: z.string().max(64).nullable().optional(),
          sdpMLineIndex: z.number().int().min(0).max(64).nullable().optional(),
          usernameFragment: z.string().max(256).nullable().optional()
        })
        .nullable()
        .optional(),
      /** The sender's screen is now shown to the other person (true) or no longer is (false). */
      screen: z.boolean().optional(),
      /** The sender's camera is now on (true) or off (false). */
      camera: z.boolean().optional(),
      /** How much of the other side's pictures the sender is showing: the call screen, the minimized bar, or nothing. */
      showing: z.enum(['full', 'small', 'none']).optional()
    })
    .refine(
      (data) =>
        data.description !== undefined ||
        data.candidate !== undefined ||
        data.screen !== undefined ||
        data.camera !== undefined ||
        data.showing !== undefined,
      'A signal must carry something'
    )
});

export type CallSignalData = z.infer<typeof callSignalSchema>['data'];
