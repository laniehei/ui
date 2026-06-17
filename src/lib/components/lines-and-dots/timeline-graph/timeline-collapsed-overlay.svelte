<script lang="ts">
  import { formatDistanceAbbreviated } from '$lib/utilities/format-time';

  import { TimelineConfig } from '../constants';

  import type { TimelineScale } from './timeline-scale.svelte';

  type Props = {
    scale: TimelineScale;
    timelineHeight: number;
    readOnly?: boolean;
    onToggle: (segmentKey: string) => void;
  };
  let { scale, timelineHeight, readOnly = false, onToggle }: Props = $props();

  const { radius } = TimelineConfig;
  const ZIGZAG_HALF_WIDTH = 3;

  const collapsibleSegments = $derived(
    scale.segments.filter((s) => s.isCollapsible),
  );

  const zigzagPath = (xStart: number, xEnd: number, height: number) => {
    const step = 6;
    let d = `M ${xStart} 0`;
    let y = 0;
    let toRight = true;
    while (y < height) {
      const nextY = Math.min(y + step, height);
      d += ` L ${toRight ? xEnd : xStart} ${nextY}`;
      toRight = !toRight;
      y = nextY;
    }
    return d;
  };

  const handleToggle = (segmentKey: string) => {
    if (readOnly) return;
    onToggle(segmentKey);
  };
</script>

{#each collapsibleSegments as seg (seg.key)}
  {@const labelX = (seg.startPx + seg.endPx) / 2}
  {@const labelY = timelineHeight + radius * 2}
  {#if seg.isCollapsed}
    {@const half = Math.min(ZIGZAG_HALF_WIDTH, (seg.endPx - seg.startPx) / 4)}
    {@const d = zigzagPath(labelX - half, labelX + half, timelineHeight)}
    <path
      class="zigzag-halo"
      {d}
      fill="none"
      stroke-width="3"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path class="zigzag" {d} fill="none" stroke-width="1" />
    <text
      class="zigzag-label"
      font-size="10"
      transform="rotate(90, {labelX}, {labelY})"
      x={labelX - radius}
      y={labelY + 3}
    >
      {formatDistanceAbbreviated({
        start: new Date(seg.startTimeMs),
        end: new Date(seg.endTimeMs),
      })}
    </text>
    {#if !readOnly}
      <rect
        role="button"
        tabindex="0"
        aria-label={`Expand ${formatDistanceAbbreviated({
          start: new Date(seg.startTimeMs),
          end: new Date(seg.endTimeMs),
        })} of skipped time`}
        class="toggle-handle"
        x={seg.startPx}
        y={0}
        width={seg.endPx - seg.startPx}
        height={timelineHeight}
        onclick={() => handleToggle(seg.key)}
        onkeypress={() => handleToggle(seg.key)}
      />
    {/if}
  {:else if !readOnly}
    <rect
      role="button"
      tabindex="0"
      aria-label={`Collapse ${formatDistanceAbbreviated({
        start: new Date(seg.startTimeMs),
        end: new Date(seg.endTimeMs),
      })} of idle time`}
      class="toggle-handle"
      x={seg.startPx}
      y={0}
      width={seg.endPx - seg.startPx}
      height={timelineHeight}
      onclick={() => handleToggle(seg.key)}
      onkeypress={() => handleToggle(seg.key)}
    />
  {/if}
{/each}

<style lang="postcss">
  .zigzag-halo {
    stroke: var(--color-surface-primary);
  }

  .zigzag {
    stroke: currentColor;
    opacity: 0.55;
  }

  .zigzag-label {
    @apply fill-current;

    opacity: 0.7;
  }

  .toggle-handle {
    fill: currentColor;
    cursor: pointer;
    opacity: 0;
    outline: none;
    transition: opacity 0.1s ease-in-out;
  }

  .toggle-handle:hover,
  .toggle-handle:focus-visible {
    opacity: 0.25;
  }
</style>
