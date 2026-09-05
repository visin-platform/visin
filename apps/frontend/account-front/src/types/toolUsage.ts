/** What one tool has cost over a window. */
export interface ToolUsage {
  tool: string;
  calls: number;
  failed: number;
  totalTokens: number;
  avgTokens: number;
  avgMs: number;
  maxTokens: number;
}

export interface ToolUsageSummary {
  windowDays: number;
  usage: ToolUsage[];
}

/** One call, as the trail records it. */
export interface ToolCall {
  at: string;
  tool: string;
  ms: number;
  tokens: number;
  failed: boolean;
  actorLabel: string;
  actorKind: 'api_key' | 'oauth';
}
