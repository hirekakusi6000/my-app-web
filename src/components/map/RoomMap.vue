<script setup lang="ts">
/**
 * 部屋のマップの SVG（床・グリッド・枠）。家具は default スロット、人のアイコンなどは overlay スロットに描く。
 * 親から svg 要素を使えるよう、svg を公開する（座標の変換やドラッグに使う）。
 */
import { computed, useId, useTemplateRef } from "vue";

import { CELL } from "@/lib/map";

const props = defineProps<{
  room: { name: string; width: number; height: number };
  /** true で表示する幅を部屋の大きさに合わせる（座席の選択など） */
  fixedWidth?: boolean;
}>();

const gridId = `grid-${useId()}`;
const width = computed(() => props.room.width * CELL);
const height = computed(() => props.room.height * CELL);

const svg = useTemplateRef<SVGSVGElement>("svg");
defineExpose({ svg });
</script>

<template>
  <svg
    ref="svg"
    class="room-map"
    :viewBox="`0 0 ${width} ${height}`"
    role="img"
    :aria-label="`${room.name} のマップ`"
    :width="fixedWidth ? width : undefined"
  >
    <defs>
      <pattern :id="gridId" :width="CELL" :height="CELL" patternUnits="userSpaceOnUse">
        <path :d="`M ${CELL} 0 L 0 0 0 ${CELL}`" class="room-map__grid" />
      </pattern>
    </defs>
    <rect x="0" y="0" :width="width" :height="height" class="room-map__floor" />
    <rect x="0" y="0" :width="width" :height="height" :fill="`url(#${gridId})`" />
    <rect x="0" y="0" :width="width" :height="height" class="room-map__border" />
    <g><slot /></g>
    <g><slot name="overlay" /></g>
  </svg>
</template>
