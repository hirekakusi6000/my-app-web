<script setup lang="ts">
/** 座席に座っている人のアイコン。クリックか Enter・スペースで select を送る */
import { computed, useId } from "vue";

import { CELL, STATUS_LABELS, seatCenter, staleLabel } from "@/lib/map";
import type { Furniture, Occupant } from "@/types/api";

const props = defineProps<{ occupant: Occupant; seat: Furniture; focused?: boolean }>();
const emit = defineEmits<{ select: [occupant: Occupant] }>();

const clipId = `clip-occupant-${useId()}`;
const R = CELL * 0.62;
const center = computed(() => seatCenter(props.seat));
const status = computed(() => STATUS_LABELS[props.occupant.status] ?? props.occupant.status);
const title = computed(() => {
  const o = props.occupant;
  const base = `${o.name ?? ""}（${status.value}）`;
  return o.is_stale ? `${base}\n${staleLabel(o.updated_at)}` : base;
});
const initial = computed(() => (props.occupant.name ?? "?").trim().charAt(0));
</script>

<template>
  <g
    :class="[
      'occupant',
      `occupant--${occupant.status}`,
      { 'occupant--stale': occupant.is_stale, 'occupant--focus': focused },
    ]"
    tabindex="0"
    role="button"
    :aria-label="`${occupant.name ?? '名前未登録'}（${status}）`"
    :data-seat-id="occupant.seat_id"
    @click="emit('select', occupant)"
    @keydown.enter.space.prevent="emit('select', occupant)"
  >
    <title>{{ title }}</title>
    <circle :cx="center.cx" :cy="center.cy" :r="R + 3" class="occupant__ring" />
    <template v-if="occupant.avatar_url">
      <clipPath :id="clipId">
        <circle :cx="center.cx" :cy="center.cy" :r="R" />
      </clipPath>
      <image
        :href="occupant.avatar_url"
        :x="center.cx - R"
        :y="center.cy - R"
        :width="R * 2"
        :height="R * 2"
        :clip-path="`url(#${clipId})`"
        preserveAspectRatio="xMidYMid slice"
      />
    </template>
    <template v-else>
      <circle :cx="center.cx" :cy="center.cy" :r="R" class="occupant__face" />
      <text
        :x="center.cx"
        :y="center.cy"
        class="occupant__initial"
        dominant-baseline="central"
        text-anchor="middle"
      >{{ initial }}</text>
    </template>
    <text :x="center.cx" :y="center.cy + R + 12" class="occupant__name" text-anchor="middle">{{ occupant.name ?? "" }}</text>
  </g>
</template>
