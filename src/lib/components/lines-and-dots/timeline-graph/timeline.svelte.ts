import { SvelteSet } from 'svelte/reactivity';

import type { EventGroups } from '$lib/models/event-groups/event-groups';
import type { WorkflowEvents } from '$lib/types/events';
import type { WorkflowExecution } from '$lib/types/workflows';
import { isWorkflowDelayed } from '$lib/utilities/delayed-workflows';
import { minDate } from '$lib/utilities/format-time';
import { isNotNullish } from '$lib/utilities/type-predicates';

import { Timespan } from './timespan';
import type { TimeSegment, TimeSegmentKey } from './types';
import { buildTimeSegments } from './utils/build-time-segments';

const DEFAULT_DURATION_THRESHOLD_RATIO = 0.2;

interface TimelineInit {
  getFullEventHistory: () => WorkflowEvents;
  getWorkflow: () => WorkflowExecution;
  getEventGroups: () => EventGroups;
  getCurrentTimeMs: () => number;
  getDurationThresholdRatio?: () => number;
}

export class Timeline {
  #collapsedSegmentKeys = new SvelteSet<TimeSegmentKey>();

  #getFullEventHistory: () => WorkflowEvents;
  #getWorkflow: () => WorkflowExecution;
  #getEventGroups: () => EventGroups;
  #getCurrentTimeMs: () => number;
  #getDurationThresholdRatio: () => number;

  constructor({
    getFullEventHistory,
    getWorkflow,
    getEventGroups,
    getCurrentTimeMs,
    getDurationThresholdRatio,
  }: TimelineInit) {
    this.#getFullEventHistory = getFullEventHistory;
    this.#getWorkflow = getWorkflow;
    this.#getEventGroups = getEventGroups;
    this.#getCurrentTimeMs = getCurrentTimeMs;
    this.#getDurationThresholdRatio =
      getDurationThresholdRatio ?? (() => DEFAULT_DURATION_THRESHOLD_RATIO);
  }

  readonly workflow = $derived.by(() => this.#getWorkflow());
  readonly eventGroups = $derived.by(() => this.#getEventGroups());
  readonly workflowTimespan = $derived.by(() => {
    const fullEventHistory = this.#getFullEventHistory();

    const earliestStartTime = minDate(
      ...[
        ...fullEventHistory
          .map((wfEvent) => wfEvent?.eventTime)
          .filter(isNotNullish),
        this.workflow.executionTime,
      ],
    );

    return Timespan.coerce(
      {
        start:
          isWorkflowDelayed(this.workflow) && this.workflow.startTime
            ? this.workflow.startTime
            : earliestStartTime,
        end: this.workflow.endTime ?? this.#getCurrentTimeMs(),
      },
      { endUnbounded: !this.workflow.endTime },
    );
  });

  readonly segments = $derived.by<TimeSegment[]>(() => {
    return buildTimeSegments({
      workflowTimespan: this.workflowTimespan,
      eventGroups: this.eventGroups,
    });
  });

  readonly expandedDurationMs = $derived.by(() =>
    this.segments.reduce(
      (sum, segment) =>
        this.#isSegmentCollapsedRaw(segment)
          ? sum
          : sum + segment.timespan.durationMs,
      0,
    ),
  );

  #isSegmentCollapsedRaw(segment: TimeSegment): boolean {
    return this.#collapsedSegmentKeys.has(segment.timespan.key);
  }

  isTimeSegmentCollapsible(segment: TimeSegment): boolean {
    if (segment.kind !== 'inactive') return false;
    if (this.segments.length <= 1) return false;
    if (this.expandedDurationMs <= 0) return false;

    return (
      segment.timespan.durationMs / this.expandedDurationMs >=
      this.#getDurationThresholdRatio()
    );
  }

  isTimeSegmentCollapsed(segment: TimeSegment): boolean {
    return (
      this.#isSegmentCollapsedRaw(segment) &&
      this.isTimeSegmentCollapsible(segment)
    );
  }

  toggleTimeSegment(segment: TimeSegment): void {
    const key = segment.timespan.key;
    if (this.#collapsedSegmentKeys.has(key)) {
      this.#collapsedSegmentKeys.delete(key);
    } else {
      this.#collapsedSegmentKeys.add(key);
    }

    this.#expandNonCollapsibleSegments();
  }

  #expandNonCollapsibleSegments(): void {
    let pruned = true;
    // map not used reactively
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const segmentsByTimespanKey = new Map(
      this.segments.map((s) => [s.timespan.key, s]),
    );

    // This is a while loop because uncollapsing segments
    // could trigger the need to uncollapse new segments.
    while (pruned) {
      pruned = false;
      // creating an array from the iterable because we potentiaally
      // mutate the array and want to iterate over a snapshot of the iterable
      for (const key of Array.from(this.#collapsedSegmentKeys)) {
        const segment = segmentsByTimespanKey.get(key);
        if (!segment || !this.isTimeSegmentCollapsible(segment)) {
          this.#collapsedSegmentKeys.delete(key);
          pruned = true;
        }
      }
    }
  }
}
