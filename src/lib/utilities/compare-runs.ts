import { groupEvents } from '$lib/models/event-groups';
import type { EventGroup } from '$lib/models/event-groups/event-groups';
import { toEventHistory } from '$lib/models/event-history';
import type { LLMMetadata } from '$lib/models/event-history/get-event-llm-metadata';
import { getGroupLLMMetadata } from '$lib/models/event-history/get-event-llm-metadata';
import type { HistoryEvent, WorkflowEvents } from '$lib/types/events';
import { decodePayloadsAndParseDataToJSON } from '$lib/utilities/decode-payload';

export type CompareStep = {
  activityName: string;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  durationMs: number;
  output: string;
  llmMetadata: LLMMetadata | null;
};

export type CompareStepPair = [CompareStep | null, CompareStep | null];

export type CompareSummary = {
  totalTokensA: number;
  totalTokensB: number;
  totalDurationMsA: number;
  totalDurationMsB: number;
  stepsA: number;
  stepsB: number;
};

const getActivityResult = async (group: EventGroup): Promise<string> => {
  for (const event of group.eventList) {
    const attrs = event.attributes as Record<string, unknown> | undefined;
    if (attrs?.result) {
      if (
        typeof attrs.result === 'object' &&
        'payloads' in (attrs.result as Record<string, unknown>)
      ) {
        try {
          const results = await decodePayloadsAndParseDataToJSON(
            attrs.result as { payloads: unknown[] },
          );
          const decoded = results[0];
          return typeof decoded === 'string'
            ? decoded
            : JSON.stringify(decoded, null, 2);
        } catch {
          return '';
        }
      }
      return typeof attrs.result === 'string'
        ? attrs.result
        : JSON.stringify(attrs.result, null, 2);
    }
  }
  return '';
};

const getDurationMs = (group: EventGroup): number => {
  const start = group.initialEvent?.eventTime;
  const end = group.lastEvent?.eventTime;
  if (!start || !end) return 0;
  return new Date(end).getTime() - new Date(start).getTime();
};

export const extractCompareSteps = async (
  rawEvents: HistoryEvent[],
): Promise<CompareStep[]> => {
  const events: WorkflowEvents = toEventHistory(rawEvents);
  const groups = groupEvents(events);

  const filtered = groups.filter(
    (g) => g.category === 'activity' || g.category === 'local-activity',
  );

  return Promise.all(
    filtered.map(async (group) => {
      const llmMetadata = getGroupLLMMetadata(group);
      return {
        activityName: group.displayName || group.name || group.label,
        model: llmMetadata?.model,
        promptTokens: llmMetadata?.promptTokens,
        completionTokens: llmMetadata?.completionTokens,
        totalTokens: llmMetadata?.totalTokens,
        durationMs: getDurationMs(group),
        output: await getActivityResult(group),
        llmMetadata,
      };
    }),
  );
};

export const matchSteps = (
  stepsA: CompareStep[],
  stepsB: CompareStep[],
): CompareStepPair[] => {
  const maxLen = Math.max(stepsA.length, stepsB.length);
  const pairs: CompareStepPair[] = [];
  for (let i = 0; i < maxLen; i++) {
    pairs.push([stepsA[i] ?? null, stepsB[i] ?? null]);
  }
  return pairs;
};

export const formatDelta = (
  a: number | undefined,
  b: number | undefined,
): string => {
  if (a === undefined || b === undefined) return '';
  const diff = b - a;
  if (diff === 0) return '';
  return diff > 0 ? `+${diff}` : `${diff}`;
};

export const computeSummary = (
  stepsA: CompareStep[],
  stepsB: CompareStep[],
): CompareSummary => {
  return {
    totalTokensA: stepsA.reduce((sum, s) => sum + (s.totalTokens ?? 0), 0),
    totalTokensB: stepsB.reduce((sum, s) => sum + (s.totalTokens ?? 0), 0),
    totalDurationMsA: stepsA.reduce((sum, s) => sum + s.durationMs, 0),
    totalDurationMsB: stepsB.reduce((sum, s) => sum + s.durationMs, 0),
    stepsA: stepsA.length,
    stepsB: stepsB.length,
  };
};
