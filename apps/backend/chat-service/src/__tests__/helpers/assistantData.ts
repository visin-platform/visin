import mongoose from 'mongoose';
import { AssistantRun } from '../../models/AssistantRun';

/**
 * The runs the assistants keep, writable, for a test to put in them what the assistant service would have. Chat only
 * reads them (models/AssistantRun) and decides who sees what of them.
 */
export const assistantRuns = mongoose.model('TestAssistantRun', AssistantRun.schema, 'chatassistantruns');
import { ScreenCall } from '../../models/ScreenCall';

/** What an assistant asked a person's open page to do, writable, for a test to put there. */
export const screenCalls = mongoose.model('TestScreenCall', ScreenCall.schema, 'chatscreencalls');
