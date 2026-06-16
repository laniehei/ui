<script lang="ts">
  import { timestamp } from '$lib/components/timestamp.svelte';
  import type { EventGroups } from '$lib/models/event-groups/event-groups';
  import { activeGroupHeight, activeGroups } from '$lib/stores/active-events';
  import { fullEventHistory } from '$lib/stores/events';
  import { eventStatusFilter } from '$lib/stores/filters';
  import type { WorkflowExecution } from '$lib/types/workflows';
  import { isWorkflowDelayed } from '$lib/utilities/delayed-workflows';
  import { type ValidTime, validTimeToDate } from '$lib/utilities/format-time';
  import { getFailedOrPendingGroups } from '$lib/utilities/get-failed-or-pending';

  import { TimelineConfig } from '../constants';
  import EndTimeInterval from '../end-time-interval.svelte';
  import { Timeline } from '../timeline-graph/timeline/model.svelte';
  import { TimelineScale } from '../timeline-graph/timeline-scale.svelte';
  import { ViewportModel } from '../timeline-graph/viewport/model.svelte';

  import GroupDetailsRow from './group-details-row.svelte';
  import Line from './line.svelte';
  import TimelineAxis from './timeline-axis.svelte';
  import TimelineCollapsedOverlay from './timeline-collapsed-overlay.svelte';
  import TimelineGraphRow from './timeline-graph-row.svelte';
  import WorkflowRow from './workflow-row.svelte';

  interface Props {
    x?: number;
    y?: number;
    workflow: WorkflowExecution;
    groups: EventGroups;
    viewportHeight: number | undefined;
    readOnly?: boolean;
    error?: boolean;
  }

  let {
    x = 0,
    y = 0,
    workflow,
    groups,
    viewportHeight,
    readOnly = false,
    error = false,
  }: Props = $props();

  const { height, gutter, radius } = TimelineConfig;

  let canvasWidth = $state(0);
  let scrollY = $state(0);

  const timelineWidth = $derived(canvasWidth - 2 * gutter);

  const timeline = new Timeline({
    getFullEventHistory: () => $fullEventHistory,
    getWorkflow: () => workflow,
    getEventGroups: () => groups,
    getCurrentTimeMs: () => Date.now(),
  });

  const viewport = new ViewportModel({ startTimeMs: 0, endTimeMs: 0 });
  const scale = new TimelineScale({ timeline, viewport });

  $effect(() => {
    viewport.setSize(timelineWidth, 0);
  });

  const projectX = (time: ValidTime | undefined | null): number => {
    if (!time) return gutter;
    return scale.project(validTimeToDate(time).getTime()) + gutter;
  };

  const toggleSegment = (segmentKey: string) => {
    const segment = timeline.segments.find(
      (s) => s.timespan.key === segmentKey,
    );
    if (segment) {
      timeline.toggleTimeSegment(segment);
    }
  };

  const expandedGroupHeight = $derived(readOnly ? 0 : $activeGroupHeight);
  const filteredGroups = $derived(
    getFailedOrPendingGroups(groups, $eventStatusFilter),
  );
  const firstStartTime = $derived.by(() => {
    const firstEventTime = $fullEventHistory[0]?.eventTime;

    if (!firstEventTime) {
      return workflow.executionTime;
    }

    return firstEventTime < workflow.executionTime
      ? firstEventTime
      : workflow.executionTime;
  });

  const startTime = $derived(
    (!isWorkflowDelayed(workflow) && firstStartTime) || workflow.startTime,
  );
  const timelineHeight = $derived(
    Math.max(height * (filteredGroups.length + 2), 120) + expandedGroupHeight,
  );
  const canvasHeight = $derived(timelineHeight + 120);

  const handleScroll = (e: Event) => {
    scrollY = (e?.target as HTMLElement)?.scrollTop;
  };

  const groupIndexMap = $derived(
    new Map(filteredGroups.map((g, i) => [g.id, i])),
  );

  const activeGroupsHeightAboveGroup = (groupIndex: number) => {
    const hasActiveAbove = $activeGroups?.some((id) => {
      const activeIndex = groupIndexMap.get(id);
      return activeIndex !== undefined && activeIndex < groupIndex;
    });
    return hasActiveAbove ? expandedGroupHeight : 0;
  };
</script>

<div
  id="event-history-timeline-graph"
  class="relative h-auto overflow-auto border border-t-0 border-subtle bg-primary [scrollbar-gutter:stable]"
  bind:clientWidth={canvasWidth}
  style={viewportHeight ? `max-height: ${viewportHeight}px;` : ''}
  onscroll={handleScroll}
>
  <EndTimeInterval {workflow} {startTime} let:endTime let:currentTime>
    <div
      class="pointer-events-none sticky top-[120px]"
      class:invisible={!!$activeGroups.length}
    >
      <div class="flex w-full justify-between text-xs">
        <p class="w-60 -translate-x-24 rotate-90">
          {$timestamp(startTime, { format: 'short' })}
        </p>
        <p class="w-60 translate-x-24 rotate-90">
          {$timestamp(endTime, { format: 'short' })}
        </p>
      </div>
    </div>
    <svg
      {x}
      {y}
      viewBox="0 0 {canvasWidth} {canvasHeight}"
      height={canvasHeight}
      width={canvasWidth}
      class="-mt-4"
      class:error
    >
      <Line
        startPoint={[gutter, 0]}
        endPoint={[gutter, timelineHeight]}
        strokeWidth={radius / 2}
      />
      <Line
        startPoint={[canvasWidth - gutter, 0]}
        endPoint={[canvasWidth - gutter, timelineHeight]}
        strokeWidth={radius / 2}
      />
      <TimelineAxis
        x1={gutter - radius / 4}
        x2={canvasWidth - gutter + radius / 4}
        {gutter}
        {timelineHeight}
        {startTime}
        {scale}
      />
      <WorkflowRow {workflow} y={height} length={canvasWidth} />
      {#each filteredGroups as group, index (group.id)}
        {@const y = (index + 2) * height + activeGroupsHeightAboveGroup(index)}
        {#if !viewportHeight || (y > scrollY - 2 * height && y < scrollY + viewportHeight * height)}
          {#key group.eventList.length}
            <TimelineGraphRow
              {y}
              {group}
              {canvasWidth}
              project={projectX}
              {readOnly}
            />
          {/key}
        {/if}
      {/each}
      <g transform="translate({gutter}, 0)">
        <TimelineCollapsedOverlay
          {scale}
          {timelineHeight}
          {readOnly}
          onToggle={toggleSegment}
        />
      </g>
      {#each filteredGroups as group, index (group.id)}
        {@const y = (index + 2) * height + activeGroupsHeightAboveGroup(index)}
        {#if !readOnly && $activeGroups.includes(group.id)}
          <GroupDetailsRow
            y={y + 1.33 * radius}
            {group}
            {canvasWidth}
            endTime={workflow?.endTime ? endTime : currentTime}
          />
        {/if}
      {/each}
    </svg>
  </EndTimeInterval>
</div>

<style lang="postcss">
  .error {
    @apply bg-danger;
  }
</style>
