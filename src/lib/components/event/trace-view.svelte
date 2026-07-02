<script lang="ts">
  import { groupEvents, isEventGroup } from '$lib/models/event-groups';
  import type { EventGroup } from '$lib/models/event-groups/event-groups';
  import { toEventHistory } from '$lib/models/event-history';
  import { fetchRawEvents } from '$lib/services/events-service';
  import type { IterableEvent } from '$lib/types/events';

  let {
    items,
    namespace = '',
  }: { items: IterableEvent[]; namespace?: string } = $props();

  type TraceNode = {
    key: string;
    name: string;
    kind: 'activity' | 'child-workflow' | 'workflow' | 'other';
    status: 'completed' | 'failed' | 'running' | 'canceled';
    durationMs: number;
    childWorkflowId?: string;
    childRunId?: string;
  };

  let expanded: Record<string, boolean> = $state({});
  let childNodes: Record<string, TraceNode[]> = $state({});
  let childLoading: Record<string, boolean> = $state({});

  const toggleExpand = (key: string, node?: TraceNode) => {
    expanded[key] = !expanded[key];
    if (
      expanded[key] &&
      node?.kind === 'child-workflow' &&
      !childNodes[key] &&
      !childLoading[key]
    ) {
      loadChildWorkflow(node);
    }
  };

  const loadChildWorkflow = async (node: TraceNode) => {
    if (!node.childWorkflowId || !node.childRunId || !namespace) return;
    childLoading[node.key] = true;
    try {
      const rawEvents = await fetchRawEvents({
        namespace,
        workflowId: node.childWorkflowId,
        runId: node.childRunId,
        sort: 'ascending',
      });
      const events = toEventHistory(rawEvents);
      const groups = groupEvents(events).filter(
        (g) =>
          g.category === 'activity' ||
          g.category === 'local-activity' ||
          g.category === 'child-workflow',
      );
      childNodes[node.key] = groups.map((g, i) =>
        buildNode(g, i, `${node.key}-`),
      );
    } catch {
      childNodes[node.key] = [];
    } finally {
      childLoading[node.key] = false;
    }
  };

  const getStatus = (group: EventGroup): TraceNode['status'] => {
    if (group.isFailureOrTimedOut) return 'failed';
    if (group.isCanceled || group.isTerminated) return 'canceled';
    if (group.isPending) return 'running';
    return 'completed';
  };

  const buildNode = (
    group: EventGroup,
    idx: number,
    prefix = '',
  ): TraceNode => {
    const name = group.displayName || group.name || group.label;
    const category = group.category;

    let kind: TraceNode['kind'] = 'other';
    if (category === 'activity' || category === 'local-activity')
      kind = 'activity';
    else if (category === 'child-workflow') kind = 'child-workflow';

    const startTime =
      group.initialEvent?.eventTime || group.initialEvent?.timestamp || '';
    const endTime =
      group.lastEvent?.eventTime || group.lastEvent?.timestamp || '';
    const durationMs =
      startTime && endTime
        ? new Date(endTime).getTime() - new Date(startTime).getTime()
        : 0;

    let childWorkflowId: string | undefined;
    let childRunId: string | undefined;
    if (kind === 'child-workflow') {
      const startedEvent = group.eventList.find(
        (e) => e.eventType === 'ChildWorkflowExecutionStarted',
      );
      const attrs = startedEvent?.attributes as
        | Record<string, unknown>
        | undefined;
      const exec = attrs?.workflowExecution as
        | Record<string, string>
        | undefined;
      childWorkflowId = exec?.workflowId;
      childRunId = exec?.runId;
    }

    return {
      key: `${prefix}t-${idx}`,
      name,
      kind,
      status: getStatus(group),
      durationMs,
      childWorkflowId,
      childRunId,
    };
  };

  const nodes = $derived(
    items
      .filter(isEventGroup)
      .filter((g) => {
        const group = g as EventGroup;
        return (
          group.category === 'activity' ||
          group.category === 'local-activity' ||
          group.category === 'child-workflow'
        );
      })
      .map((g, i) => buildNode(g as EventGroup, i)),
  );

  const formatMs = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60_000).toFixed(1)}m`;
  };

  const statusColor = (status: TraceNode['status']): string => {
    switch (status) {
      case 'completed':
        return 'text-green-400';
      case 'failed':
        return 'text-red-400';
      case 'running':
        return 'text-blue-400';
      case 'canceled':
        return 'text-yellow-400';
    }
  };
</script>

{#snippet nodeIcon(node: TraceNode, isOpen: boolean)}
  {#if node.kind === 'child-workflow'}
    <svg
      class="h-3 w-3 shrink-0 {statusColor(node.status)}"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
    >
      <circle cx="8" cy="4" r="2" />
      <circle cx="4" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <path d="M8 6v2M6 10l2-2 2 2" />
      {#if !isOpen}
        <path d="M4 14v1M12 14v1" stroke-dasharray="1 1" opacity="0.4" />
      {/if}
    </svg>
  {:else}
    <svg
      class="h-3 w-3 shrink-0 {statusColor(node.status)}"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
    >
      <circle cx="8" cy="8" r="2.5" fill="currentColor" opacity="0.3" />
      <circle cx="8" cy="8" r="2.5" />
    </svg>
  {/if}
{/snippet}

{#snippet traceNode(node: TraceNode, depth: number, isLast: boolean)}
  {@const isOpen = expanded[node.key]}
  {@const hasChildren = node.kind === 'child-workflow'}
  {@const children = childNodes[node.key]}
  {@const loading = childLoading[node.key]}

  <div class="flex flex-col">
    <button
      class="group flex w-full cursor-pointer select-none items-center gap-2 rounded-sm py-1 text-left hover:bg-white/[0.03]"
      style="padding-left: {depth * 24 + 8}px"
      onclick={() => toggleExpand(node.key, node)}
    >
      <div class="relative flex items-center">
        <span
          class="absolute -left-[13px] top-1/2 h-px w-[10px] {isLast
            ? 'bg-gradient-to-r from-white/[0.08] to-transparent'
            : 'bg-white/[0.08]'}"
        ></span>
        {@render nodeIcon(node, isOpen ?? false)}
      </div>

      <span
        class="text-xs {node.kind === 'child-workflow'
          ? 'font-medium text-blue-300'
          : 'text-white/60'}"
      >
        {node.name}
      </span>

      {#if hasChildren}
        <svg
          class="h-3 w-3 shrink-0 text-white/20 transition-transform {isOpen
            ? 'rotate-90'
            : ''}"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path
            d="M6 4l4 4-4 4"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      {/if}

      {#if node.durationMs > 0}
        <span class="ml-auto pr-2 text-[10px] text-white/15">
          {formatMs(node.durationMs)}
        </span>
      {/if}
    </button>

    {#if isOpen && hasChildren}
      <div class="relative" style="margin-left: {depth * 24 + 8}px">
        <span class="absolute bottom-2 left-[11px] top-0 w-px bg-white/[0.06]"
        ></span>

        {#if loading}
          <div class="flex items-center gap-2 py-2" style="padding-left: 24px">
            <span
              class="inline-block h-3 w-3 animate-spin rounded-full border border-blue-400/30 border-t-blue-400"
            ></span>
            <span class="text-[10px] text-white/20">Loading...</span>
          </div>
        {:else if children}
          {#each children as child, idx (child.key)}
            {@render traceNode(child, depth + 1, idx === children.length - 1)}
          {/each}
        {/if}
      </div>
    {/if}
  </div>
{/snippet}

<div class="trace-view p-4" data-testid="trace-view">
  {#if nodes.length === 0}
    <p class="py-8 text-center text-xs text-white/30">
      No activity or child workflow steps found.
    </p>
  {:else}
    <div class="relative inline-flex flex-col">
      <div class="mb-3 flex items-center gap-2 pl-2">
        <svg
          class="h-4 w-4 text-blue-400"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <rect x="3" y="2" width="10" height="4" rx="1" />
          <path d="M8 6v2" />
          <circle cx="8" cy="10" r="1" fill="currentColor" />
          <path d="M8 11v3" stroke-dasharray="1 1" opacity="0.4" />
        </svg>
        <span class="text-xs font-medium text-blue-300">Workflow Trace</span>
        <span class="text-[10px] text-white/20">
          {nodes.length} step{nodes.length === 1 ? '' : 's'}
        </span>
      </div>

      <div class="relative">
        <span class="absolute bottom-2 left-[19px] top-0 w-px bg-white/[0.06]"
        ></span>

        {#each nodes as node, idx (node.key)}
          {@render traceNode(node, 0, idx === nodes.length - 1)}
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .trace-view {
    background: linear-gradient(
      180deg,
      rgb(0 0 0 / 2%) 0%,
      transparent 100%
    );
    font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace;
  }

  :global(.dark) .trace-view {
    background: linear-gradient(
      180deg,
      rgb(0 0 0 / 30%) 0%,
      rgb(0 0 0 / 10%) 100%
    );
  }
</style>
