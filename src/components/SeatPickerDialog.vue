<script setup lang="ts">
/**
 * マップから座席（椅子）を1つ選ぶダイアログ。
 * 使い方: const result = await picker.value.open({ currentSeatId, currentRoomId, title })
 *   → { seatId }（null は「設定を外す」）。キャンセルしたら null
 */
import { computed, nextTick, ref, useTemplateRef } from "vue";

import { officesApi } from "@/api";
import FurnitureShape from "@/components/map/FurnitureShape.vue";
import RoomMap from "@/components/map/RoomMap.vue";
import { toastError } from "@/lib/toast";
import type { Floor, Furniture, Layout } from "@/types/api";

export interface PickOptions {
  currentSeatId: number | null;
  currentRoomId?: number | null;
  title?: string;
}
export type PickResult = { seatId: number | null } | null;

const dialog = useTemplateRef<HTMLDialogElement>("dialog");
const title = ref("座席を選ぶ");
const floors = ref<Floor[]>([]);
const roomId = ref<number | null>(null);
const layout = ref<Layout | null>(null);
const currentSeatId = ref<number | null>(null);
const picked = ref<number | null>(null);
/** 椅子をクリックするまで「この座席にする」を押せない */
const clicked = ref(false);
const hasRooms = computed(() => floors.value.some((f) => f.rooms.length > 0));
const hasChairs = computed(() => layout.value?.furniture.some((f) => f.type === "chair") ?? false);
let resolve: ((result: PickResult) => void) | null = null;

async function showRoom(id: number) {
  roomId.value = id;
  try {
    layout.value = await officesApi.getLayout(id);
  } catch (err) {
    toastError(err);
  }
}

async function open(options: PickOptions): Promise<PickResult> {
  title.value = options.title ?? "座席を選ぶ";
  currentSeatId.value = options.currentSeatId;
  picked.value = options.currentSeatId;
  clicked.value = false;
  layout.value = null;
  floors.value = await officesApi.listFloors();
  const rooms = floors.value.flatMap((f) => f.rooms);
  if (rooms.length) {
    const initial = rooms.some((r) => r.id === options.currentRoomId) ? options.currentRoomId! : rooms[0].id;
    await showRoom(initial);
  }
  await nextTick();
  dialog.value?.showModal();
  return new Promise((r) => (resolve = r));
}

function pick(item: Furniture) {
  if (item.type !== "chair" || item.id == null) return;
  picked.value = item.id;
  clicked.value = true;
}

function finish(result: PickResult) {
  dialog.value?.close();
  resolve?.(result);
  resolve = null;
}

defineExpose({ open });
</script>

<template>
  <dialog ref="dialog" class="dialog seat-picker" @cancel.prevent="finish(null)">
    <h2 class="dialog__title">{{ title }}</h2>
    <div v-if="hasRooms" class="seat-picker__toolbar">
      <select
        class="field__input"
        aria-label="部屋"
        :value="roomId"
        @change="showRoom(Number(($event.target as HTMLSelectElement).value))"
      >
        <template v-for="f in floors" :key="f.id">
          <optgroup v-if="f.rooms.length" :label="f.name">
            <option v-for="r in f.rooms" :key="r.id" :value="r.id">{{ r.name }}</option>
          </optgroup>
        </template>
      </select>
      <span class="field__hint">椅子をクリックして選んでください</span>
    </div>
    <div class="seat-picker__stage">
      <template v-if="!hasRooms">
        まだオフィスマップがありません。管理者がマップを作成すると選べるようになります。
      </template>
      <template v-else-if="layout">
        <RoomMap :room="layout.room" fixed-width class="room-map--pickable">
          <FurnitureShape
            v-for="(item, i) in layout.furniture"
            :key="item.id ?? `new-${i}`"
            :item="item"
            :class="{ 'furniture--picked': item.type === 'chair' && item.id === picked }"
            :data-seat-id="item.type === 'chair' ? item.id : undefined"
            @click="pick(item)"
          />
        </RoomMap>
        <p v-if="!hasChairs" class="field__hint">この部屋には椅子がありません。</p>
      </template>
    </div>
    <div class="dialog__actions">
      <button
        v-if="currentSeatId !== null"
        type="button"
        class="button button--ghost button--danger-text"
        @click="finish({ seatId: null })"
      >設定を外す</button>
      <span class="editor__spacer"></span>
      <button type="button" class="button button--ghost" @click="finish(null)">キャンセル</button>
      <button
        type="button"
        class="button"
        :disabled="!clicked"
        @click="finish({ seatId: picked })"
      >この座席にする</button>
    </div>
  </dialog>
</template>
