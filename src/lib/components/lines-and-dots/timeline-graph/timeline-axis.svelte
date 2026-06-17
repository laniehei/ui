<script lang="ts">
  import type { Timestamp } from '$lib/types';
  import { formatDistanceAbbreviated } from '$lib/utilities/format-time';

  import { TimelineConfig } from '../constants';
  import Line from '../svg/line.svelte';

  import type { TimelineScale } from './timeline-scale.svelte';

  type Props = {
    x1: number;
    x2: number;
    gutter: number;
    timelineHeight: number;
    startTime: string | Timestamp;
    scale: TimelineScale;
  };
  let {
    x1 = 0,
    x2 = 1000,
    gutter = 0,
    timelineHeight = 1000,
    startTime,
    scale,
  }: Props = $props();

  const { radius } = TimelineConfig;
  const ticks = 20;

  const distance = $derived(x2 - x1);
  const tickDistance = $derived(distance / ticks);

  const startMs = $derived(scale.unproject(x1 - gutter));
  const endMs = $derived(scale.unproject(x2 - gutter));
  const includeMilliseconds = $derived((endMs - startMs) / ticks < 1000);

  const isWithinCollapsedSegment = (px: number): boolean =>
    scale.segments.some(
      (segment) =>
        segment.isCollapsed && px > segment.startPx && px < segment.endPx,
    );
</script>

<Line
  strokeWidth={radius / 2}
  startPoint={[x1, timelineHeight]}
  endPoint={[x1 + distance, timelineHeight]}
/>
{#each Array(ticks) as _, i}
  {@const tickX = x1 + i * tickDistance}
  {@const tickY = timelineHeight + radius * 2}
  {#if i !== 0 && !isWithinCollapsedSegment(tickX - gutter)}
    <Line
      strokeWidth={0.5}
      startPoint={[tickX, 0]}
      endPoint={[tickX, timelineHeight]}
      strokeDasharray="2"
    />
    <text
      fill="#fff"
      font-size="12"
      transform="rotate(90, {tickX}, {tickY})"
      x={tickX - radius}
      y={tickY + 3}
    >
      {formatDistanceAbbreviated({
        start: startTime,
        end: new Date(scale.unproject(tickX - gutter)),
        includeMilliseconds,
      })}
    </text>
  {/if}
{/each}

<style lang="postcss">
  text {
    @apply fill-current;
  }
</style>
