<script setup lang="ts">
/** 家具を1つ描く（<g class="furniture furniture--種類">）。クリックなどは親で付ける */
import { computed } from "vue";

import { CELL, FURNITURE_TYPES, footprint } from "@/lib/map";
import type { Furniture } from "@/types/api";

const props = defineProps<{ item: Furniture }>();

const box = computed(() => {
  const { w, h } = footprint(props.item);
  return { x: props.item.x * CELL, y: props.item.y * CELL, w: w * CELL, h: h * CELL };
});

const INSET = 4;
const BACK = 5;

/** 椅子の背もたれ（向きによって位置が変わる） */
const chairBack = computed(() => {
  const { x, y, w, h } = box.value;
  return {
    0: { x: x + INSET, y: y + INSET, width: w - INSET * 2, height: BACK },
    90: { x: x + w - INSET - BACK, y: y + INSET, width: BACK, height: h - INSET * 2 },
    180: { x: x + INSET, y: y + h - INSET - BACK, width: w - INSET * 2, height: BACK },
    270: { x: x + INSET, y: y + INSET, width: BACK, height: h - INSET * 2 },
  }[props.item.rotation];
});

/** ドアの開く向きの目印（扉の軌跡） */
const doorArc = computed(() => {
  const { x, y, w, h } = box.value;
  const r = Math.min(w, h);
  return {
    0: `M ${x} ${y + h} A ${r} ${r} 0 0 1 ${x + r} ${y + h - r}`,
    90: `M ${x} ${y} A ${r} ${r} 0 0 1 ${x + r} ${y + r}`,
    180: `M ${x + w} ${y} A ${r} ${r} 0 0 1 ${x + w - r} ${y + r}`,
    270: `M ${x + w} ${y + h} A ${r} ${r} 0 0 1 ${x + w - r} ${y + h - r}`,
  }[props.item.rotation];
});

const text = computed(() => {
  const { type, label } = props.item;
  if (label) return label;
  return type === "chair" || type === "wall" ? "" : FURNITURE_TYPES[type].label;
});
</script>

<template>
  <g :class="['furniture', `furniture--${item.type}`]">
    <template v-if="item.type === 'chair'">
      <rect
        :x="box.x + INSET"
        :y="box.y + INSET"
        :width="box.w - INSET * 2"
        :height="box.h - INSET * 2"
        rx="6"
        class="furniture__body"
      />
      <rect v-bind="chairBack" rx="2" class="furniture__back" />
    </template>
    <template v-else-if="item.type === 'door'">
      <rect :x="box.x" :y="box.y" :width="box.w" :height="box.h" class="furniture__body" />
      <path :d="doorArc" class="furniture__swing" />
    </template>
    <rect
      v-else
      :x="box.x"
      :y="box.y"
      :width="box.w"
      :height="box.h"
      :rx="item.type === 'desk' ? 4 : 0"
      class="furniture__body"
    />
    <text
      v-if="text"
      :x="box.x + box.w / 2"
      :y="box.y + box.h / 2"
      class="furniture__label"
      dominant-baseline="central"
      text-anchor="middle"
    >{{ text }}</text>
  </g>
</template>
