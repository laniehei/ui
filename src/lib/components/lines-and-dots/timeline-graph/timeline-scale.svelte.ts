import type { Timeline } from './timeline/model.svelte';
import type { ViewportModel } from './viewport/model.svelte';

export interface ScaledSegment {
  startTimeMs: number;
  endTimeMs: number;
  startPx: number;
  endPx: number;
  isCollapsed: boolean;
}

const DEFAULT_COLLAPSED_WIDTH_PX = 24;

export class TimelineScale {
  #timeline: Timeline;
  #viewport: ViewportModel;
  #getCollapsedPx: () => number;

  constructor(init: {
    timeline: Timeline;
    viewport: ViewportModel;
    getCollapsedPx?: () => number;
  }) {
    this.#timeline = init.timeline;
    this.#viewport = init.viewport;
    this.#getCollapsedPx =
      init.getCollapsedPx ?? (() => DEFAULT_COLLAPSED_WIDTH_PX);
  }

  readonly segments = $derived.by<ScaledSegment[]>(() =>
    buildScaledSegments({
      timeline: this.#timeline,
      widthPx: this.#viewport.widthPx,
      collapsedPx: this.#getCollapsedPx(),
    }),
  );

  project(timeMs: number): number {
    const segments = this.segments;
    if (!segments.length) {
      return 0;
    }

    const first = segments[0];
    const last = segments[segments.length - 1];

    if (timeMs <= first.startTimeMs) {
      return first.startPx;
    }

    if (timeMs >= last.endTimeMs) {
      return last.endPx;
    }

    for (const segment of segments) {
      if (timeMs > segment.endTimeMs) {
        continue;
      }

      const durationMs = segment.endTimeMs - segment.startTimeMs || 1;
      const ratio = (timeMs - segment.startTimeMs) / durationMs;
      return segment.startPx + ratio * (segment.endPx - segment.startPx);
    }

    return last.endPx;
  }
}

function buildScaledSegments({
  timeline,
  widthPx,
  collapsedPx,
}: {
  timeline: Timeline;
  widthPx: number;
  collapsedPx: number;
}): ScaledSegment[] {
  const segments = timeline.segments;
  if (!segments.length) {
    return [];
  }

  let collapsedTotalPx = 0;
  let expandedDurationMs = 0;
  const collapsedBySegmentKey: Record<string, boolean> = {};

  for (const segment of segments) {
    const isCollapsed = timeline.isTimeSegmentCollapsed(segment.timespan.key);
    collapsedBySegmentKey[segment.timespan.key] = isCollapsed;

    if (isCollapsed) {
      collapsedTotalPx += collapsedPx;
    } else {
      expandedDurationMs += segment.timespan.durationMs;
    }
  }

  const availablePx = Math.max(widthPx - collapsedTotalPx, 0);

  const scaled: ScaledSegment[] = [];
  let cursorPx = 0;

  for (const segment of segments) {
    const isCollapsed = collapsedBySegmentKey[segment.timespan.key];

    const segmentWidthPx = isCollapsed
      ? collapsedPx
      : expandedDurationMs > 0
        ? (segment.timespan.durationMs / expandedDurationMs) * availablePx
        : 0;

    scaled.push({
      startTimeMs: segment.timespan.startTimeMs,
      endTimeMs: segment.timespan.endTimeMs,
      startPx: cursorPx,
      endPx: cursorPx + segmentWidthPx,
      isCollapsed,
    });

    cursorPx += segmentWidthPx;
  }

  return scaled;
}
