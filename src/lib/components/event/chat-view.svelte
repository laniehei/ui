<script lang="ts">
  import Badge from '$lib/holocene/badge.svelte';
  import { isEventGroup } from '$lib/models/event-groups';
  import type { EventGroup } from '$lib/models/event-groups/event-groups';
  import { getGroupLLMMetadata } from '$lib/models/event-history/get-event-llm-metadata';
  import type { IterableEvent } from '$lib/types/events';
  import { decodePayloadsAndParseDataToJSON } from '$lib/utilities/decode-payload';

  let { items }: { items: IterableEvent[] } = $props();

  const TRUNCATE_LIMIT = 500;

  type ActivityStep = {
    activityName: string;
    input: string;
    output: string;
    model?: string;
    totalTokens?: number;
    cost?: number;
    isLLM: boolean;
    timestamp: string;
  };

  const formatDecoded = (decoded: unknown): string => {
    if (typeof decoded === 'string') return decoded;
    if (decoded && typeof decoded === 'object')
      return JSON.stringify(decoded, null, 2);
    return String(decoded ?? '');
  };

  const extractOutputFromDecoded = (decoded: unknown): string => {
    if (decoded && typeof decoded === 'object') {
      const obj = decoded as Record<string, unknown>;
      const detailsObj =
        obj.details && typeof obj.details === 'object'
          ? (obj.details as Record<string, unknown>)
          : null;
      const llm = detailsObj?.llm ?? obj._details;
      if (llm && typeof llm === 'object') {
        const d = llm as Record<string, unknown>;
        if (typeof d.response === 'string') return d.response;
      }
      if ('result' in obj) return String(obj.result);
      return JSON.stringify(decoded, null, 2);
    }
    if (typeof decoded === 'string') return decoded;
    return JSON.stringify(decoded, null, 2);
  };

  let steps: ActivityStep[] = $state([]);

  $effect(() => {
    const groups = items.filter(isEventGroup) as EventGroup[];
    const promises = groups.map(async (group) => {
      const llmMetadata = getGroupLLMMetadata(group);
      const activityName = group.displayName || group.name || group.label;

      const scheduledEvent = group.eventList.find(
        (e) => e.eventType === 'ActivityTaskScheduled',
      );
      const completedEvent = group.eventList.find(
        (e) => e.eventType === 'ActivityTaskCompleted',
      );

      let input = '';
      if (scheduledEvent?.attributes?.input) {
        try {
          const results = await decodePayloadsAndParseDataToJSON(
            scheduledEvent.attributes.input as { payloads: unknown[] },
          );
          input = formatDecoded(results[0]);
        } catch {
          /* empty */
        }
      }

      let output = '';
      if (completedEvent?.attributes?.result) {
        try {
          const results = await decodePayloadsAndParseDataToJSON(
            completedEvent.attributes.result as { payloads: unknown[] },
          );
          output = extractOutputFromDecoded(results[0]);
        } catch {
          /* empty */
        }
      }

      return {
        activityName,
        input,
        output,
        model: llmMetadata?.model,
        totalTokens: llmMetadata?.totalTokens,
        cost: llmMetadata?.cost,
        isLLM: !!llmMetadata,
        timestamp: completedEvent?.eventTime || completedEvent?.timestamp || '',
      } as ActivityStep;
    });

    Promise.all(promises).then((resolved) => {
      steps = resolved;
    });
  });

  // Track expanded state per step
  let expandedInputs: Record<number, boolean> = $state({});
  let expandedOutputs: Record<number, boolean> = $state({});
</script>

<div class="mx-auto flex max-w-3xl flex-col gap-4 p-4" data-testid="chat-view">
  {#if steps.length === 0}
    <p class="py-8 text-center text-sm text-secondary">
      No activity steps found in this workflow.
    </p>
  {:else}
    {#each steps as step, i}
      {#if step.isLLM}
        <div class="flex flex-col gap-2">
          <!-- Activity header -->
          <div class="flex items-center gap-2 px-1">
            <span class="text-xs font-medium text-secondary/60"
              >{step.activityName}</span
            >
            {#if step.model}
              <Badge type="subtle" class="text-xs">{step.model}</Badge>
            {/if}
            {#if step.totalTokens}
              <span class="text-xs text-secondary/40"
                >{step.totalTokens.toLocaleString()} tokens</span
              >
            {/if}
            {#if step.cost}
              <span class="text-xs text-secondary/40"
                >${step.cost.toFixed(4)}</span
              >
            {/if}
          </div>

          <!-- Input bubble - right aligned -->
          {#if step.input}
            <div class="flex justify-end">
              <div
                class="max-w-[85%] rounded-2xl rounded-br-sm bg-interactive-secondary-active px-4 py-2.5"
              >
                <p class="text-xs font-medium text-secondary/40">Input</p>
                {#if step.input.length > TRUNCATE_LIMIT && !expandedInputs[i]}
                  <pre
                    class="mt-1 whitespace-pre-wrap break-words text-sm">{step.input.slice(
                      0,
                      TRUNCATE_LIMIT,
                    )}...</pre>
                  <button
                    class="mt-1 text-xs font-medium text-information hover:underline"
                    onclick={() => (expandedInputs[i] = true)}
                  >
                    Show more
                  </button>
                {:else}
                  <pre
                    class="mt-1 whitespace-pre-wrap break-words text-sm">{step.input}</pre>
                  {#if step.input.length > TRUNCATE_LIMIT}
                    <button
                      class="mt-1 text-xs font-medium text-information hover:underline"
                      onclick={() => (expandedInputs[i] = false)}
                    >
                      Show less
                    </button>
                  {/if}
                {/if}
              </div>
            </div>
          {/if}

          <!-- Output bubble - left aligned -->
          {#if step.output}
            <div class="flex justify-start">
              <div
                class="bg-surface-primary max-w-[85%] rounded-2xl rounded-bl-sm border border-subtle px-4 py-2.5"
              >
                <p class="text-xs font-medium text-secondary/40">Output</p>
                {#if step.output.length > TRUNCATE_LIMIT && !expandedOutputs[i]}
                  <pre
                    class="mt-1 whitespace-pre-wrap break-words text-sm">{step.output.slice(
                      0,
                      TRUNCATE_LIMIT,
                    )}...</pre>
                  <button
                    class="mt-1 text-xs font-medium text-information hover:underline"
                    onclick={() => (expandedOutputs[i] = true)}
                  >
                    Show more
                  </button>
                {:else}
                  <pre
                    class="mt-1 whitespace-pre-wrap break-words text-sm">{step.output}</pre>
                  {#if step.output.length > TRUNCATE_LIMIT}
                    <button
                      class="mt-1 text-xs font-medium text-information hover:underline"
                      onclick={() => (expandedOutputs[i] = false)}
                    >
                      Show less
                    </button>
                  {/if}
                {/if}
              </div>
            </div>
          {/if}
        </div>
      {:else}
        <!-- Non-LLM activity: compact system-style message -->
        <div class="flex justify-center">
          <div
            class="flex items-center gap-2 rounded-full bg-interactive-table-hover px-3 py-1"
          >
            <span class="text-xs text-secondary/60">{step.activityName}</span>
            {#if step.output}
              <span class="max-w-xs truncate text-xs text-secondary/40"
                >{step.output}</span
              >
            {/if}
          </div>
        </div>
      {/if}
    {/each}
  {/if}
</div>
