<script setup lang="ts">
/**
 * マップ編集（マスター）：部屋に机・椅子・壁・ドアなどの家具を配置する。
 * 選択・移動・範囲選択・大きさの変更・回転・コピー・元に戻す・やり直しができる。
 */
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, useTemplateRef } from "vue";

import { officesApi } from "@/api";
import FurnitureShape from "@/components/map/FurnitureShape.vue";
import RoomMap from "@/components/map/RoomMap.vue";
import { CELL, clientToGrid, FURNITURE_TYPES, footprint } from "@/lib/map";
import { showToast, toastError } from "@/lib/toast";
import type { Floor, Furniture, FurnitureType, Room, Rotation } from "@/types/api";

const MAX_HISTORY = 100;

/** 編集中の家具（key は画面の中だけで使う識別子） */
type Item = Furniture & { key: string };
type Box = { x1: number; y1: number; x2: number; y2: number };
type NumberField = "x" | "y" | "width" | "height";

// ───────── 状態 ─────────

const floors = ref<Floor[]>([]);
const rooms = computed(() => floors.value.flatMap((f) => f.rooms));
const loaded = ref(false);
const room = ref<Room | null>(null);
const roomId = ref<number | null>(null);
const items = ref<Item[]>([]);
/** 保存済みの内容（変更があるかの判定に使う） */
const savedSnapshot = ref("");
/** 選択中の家具の key */
const selection = ref(new Set<string>());
const undoStack = shallowRef<Item[][]>([]);
const redoStack = shallowRef<Item[][]>([]);
const marquee = ref<Box | null>(null);
const saving = ref(false);
/** コピーした家具（id と key は持たない） */
let clipboard: Omit<Furniture, "id">[] = [];
/** 同じものを続けて貼り付けたときに、少しずつずらすため */
let pasteCount = 0;
let nextKey = 1;

const roomMap = useTemplateRef<InstanceType<typeof RoomMap>>("roomMap");
const stage = useTemplateRef<HTMLDivElement>("stage");

const keyOf = () => `k${nextKey++}`;
const selectedItems = computed(() => items.value.filter((i) => selection.value.has(i.key)));
const single = computed(() => (selectedItems.value.length === 1 ? selectedItems.value[0] : null));
const snapshot = () => JSON.stringify(items.value.map(({ key: _key, ...rest }) => rest));
const isDirty = computed(() => room.value !== null && snapshot() !== savedSnapshot.value);
const cloneItems = (list: Item[]) => list.map((i) => ({ ...i }));
const select = (keys: Iterable<string>) => (selection.value = new Set(keys));

// ───────── 元に戻す・やり直し ─────────

/** 変更する直前の状態を記録する（「元に戻す」で戻れるように） */
function checkpoint(before: Item[] = cloneItems(items.value)) {
  undoStack.value = [...undoStack.value, before].slice(-MAX_HISTORY);
  redoStack.value = [];
}

function restore(state: Item[]) {
  items.value = cloneItems(state);
  // 消えた家具は選択から外す
  const keys = new Set(items.value.map((i) => i.key));
  select([...selection.value].filter((k) => keys.has(k)));
}

function undo() {
  const stack = undoStack.value;
  if (!stack.length) return;
  redoStack.value = [...redoStack.value, cloneItems(items.value)];
  undoStack.value = stack.slice(0, -1);
  restore(stack[stack.length - 1]);
}

function redo() {
  const stack = redoStack.value;
  if (!stack.length) return;
  undoStack.value = [...undoStack.value, cloneItems(items.value)];
  redoStack.value = stack.slice(0, -1);
  restore(stack[stack.length - 1]);
}

// ───────── 部屋の読み込み ─────────

async function loadRoom(id: number) {
  const layout = await officesApi.getLayout(id);
  room.value = layout.room;
  roomId.value = id;
  items.value = layout.furniture.map((f) => ({ ...f, key: keyOf() }));
  savedSnapshot.value = snapshot();
  select([]);
  undoStack.value = [];
  redoStack.value = [];
  window.history.replaceState(null, "", `?room=${id}`);
}

async function onRoomChange(event: Event) {
  const select = event.target as HTMLSelectElement;
  if (isDirty.value && !confirm("保存していない変更があります。破棄して別の部屋に切り替えますか？")) {
    select.value = String(room.value!.id);
    return;
  }
  await loadRoom(Number(select.value));
}

// ───────── 配置の変更（すべてここを通して、はみ出しを防ぐ） ─────────

function fits(item: Pick<Furniture, "width" | "height" | "rotation">): boolean {
  const { w, h } = footprint(item);
  const r = room.value!;
  return w >= 1 && h >= 1 && w <= r.width && h <= r.height;
}

function clampInto(item: Furniture) {
  const { w, h } = footprint(item);
  const r = room.value!;
  item.x = Math.min(Math.max(0, item.x), r.width - w);
  item.y = Math.min(Math.max(0, item.y), r.height - h);
}

/** 変更後の家具が部屋に収まるなら反映して true を返す */
function apply(item: Item, changes: Partial<Furniture>): boolean {
  const next = { ...item, ...changes };
  if (!fits(next)) return false;
  clampInto(next);
  Object.assign(item, next);
  return true;
}

/** 選んだ家具をまとめて動かす。部屋からはみ出さない範囲に動く量を抑える */
function moveGroup(group: Item[], dx: number, dy: number, origins: Map<string, { x: number; y: number }> | null = null) {
  const r = room.value!;
  let [minDx, maxDx, minDy, maxDy] = [-Infinity, Infinity, -Infinity, Infinity];
  for (const item of group) {
    const o = origins?.get(item.key) ?? item;
    const { w, h } = footprint(item);
    minDx = Math.max(minDx, -o.x);
    maxDx = Math.min(maxDx, r.width - w - o.x);
    minDy = Math.max(minDy, -o.y);
    maxDy = Math.min(maxDy, r.height - h - o.y);
  }
  const cdx = Math.min(Math.max(dx, minDx), maxDx);
  const cdy = Math.min(Math.max(dy, minDy), maxDy);
  for (const item of group) {
    const o = origins?.get(item.key) ?? { x: item.x, y: item.y };
    item.x = o.x + cdx;
    item.y = o.y + cdy;
  }
}

function addItem(type: FurnitureType) {
  const svg = roomMap.value?.svg;
  if (!room.value || !svg || !stage.value) return;
  const def = FURNITURE_TYPES[type];
  const item: Item = { key: keyOf(), id: null, type, label: null, x: 0, y: 0, width: def.width, height: def.height, rotation: 0 };
  // 表示中の範囲の左上あたりに置く
  const visible = stage.value.getBoundingClientRect();
  const p = clientToGrid(svg, visible.left + 40, visible.top + 40);
  const before = cloneItems(items.value);
  if (!apply(item, { x: Math.round(p.x), y: Math.round(p.y) })) {
    showToast("部屋が小さすぎて追加できません", "error");
    return;
  }
  checkpoint(before);
  items.value.push(item);
  select([item.key]);
}

function rotateSelected(delta: number) {
  const group = selectedItems.value;
  if (!group.length) return;
  const before = cloneItems(items.value);
  // 1つでも回転できない家具があれば、どれも回転しない
  const rotations = group.map((item) => ((item.rotation + delta + 360) % 360) as Rotation);
  if (!group.every((item, i) => fits({ ...item, rotation: rotations[i] }))) {
    showToast("部屋からはみ出すため回転できません", "error");
    return;
  }
  checkpoint(before);
  group.forEach((item, i) => {
    item.rotation = rotations[i];
    clampInto(item);
  });
}

function removeSelected() {
  if (!selection.value.size) return;
  checkpoint();
  items.value = items.value.filter((i) => !selection.value.has(i.key));
  select([]);
}

function copySelected(): boolean {
  const group = selectedItems.value;
  if (!group.length) return false;
  clipboard = group.map(({ key: _key, id: _id, ...rest }) => ({ ...rest }));
  pasteCount = 0;
  return true;
}

function paste() {
  if (!clipboard.length || !room.value) return;
  pasteCount += 1;
  const pasted: Item[] = clipboard
    .map((c) => ({ ...c, id: null, key: keyOf(), x: c.x + pasteCount, y: c.y + pasteCount }))
    .filter(fits);
  if (!pasted.length) {
    showToast("部屋が小さすぎて貼り付けられません", "error");
    return;
  }
  checkpoint();
  // 元の並びを保ったまま、部屋の中に収まるように全体をずらす
  moveGroup(pasted, 0, 0, new Map(pasted.map((p) => [p.key, { x: p.x, y: p.y }])));
  items.value.push(...pasted);
  select(pasted.map((p) => p.key));
}

function duplicateSelected() {
  if (copySelected()) paste();
}

// ───────── 選択中の家具の欄（1つだけ選んでいるとき） ─────────

/** 入力を始める前の状態（入力をまとめて1回の「元に戻す」にする） */
let editBefore: Item[] | null = null;

function onPropsFocus() {
  editBefore = cloneItems(items.value);
}

function onLabelInput(event: Event) {
  const one = single.value;
  if (one) one.label = (event.target as HTMLInputElement).value.trim() || null;
}

function onNumberInput(name: NumberField, event: Event) {
  const one = single.value;
  const n = Number((event.target as HTMLInputElement).value);
  // 幅・奥行きは「向き0度のときの大きさ」として扱う
  if (one && Number.isInteger(n)) apply(one, { [name]: n });
}

function onPropsChange(event: Event) {
  if (editBefore && JSON.stringify(editBefore) !== JSON.stringify(items.value)) checkpoint(editBefore);
  editBefore = cloneItems(items.value);
  // 補正された値を表示に戻す
  const input = event.target as HTMLInputElement;
  const one = single.value;
  if (one && input.name !== "label") input.value = String(one[input.name as NumberField]);
}

const typeText = computed(() => {
  if (!selectedItems.value.length) return "";
  const one = single.value;
  if (!one) return `${selectedItems.value.length}個を選択中`;
  return FURNITURE_TYPES[one.type].label + (one.type === "chair" ? "（座席）" : "");
});

// ───────── マウス操作（選択・移動・大きさの変更・範囲選択） ─────────

type Drag =
  | { mode: "resize"; item: Item; before: Item[] }
  | { mode: "move"; group: Item[]; start: { x: number; y: number }; origins: Map<string, { x: number; y: number }>; before: Item[] }
  | { mode: "marquee"; base: Set<string>; box: Box };
let drag: Drag | null = null;

const grid = (e: PointerEvent) => clientToGrid(roomMap.value!.svg!, e.clientX, e.clientY);

function onPointerDown(e: PointerEvent) {
  const target = e.target as Element;
  const p = grid(e);
  const before = cloneItems(items.value);

  if (target.getAttribute("data-handle") === "resize" && single.value) {
    drag = { mode: "resize", item: single.value, before };
  } else {
    const key = target.closest("[data-key]")?.getAttribute("data-key");
    if (key && e.shiftKey) {
      // Shift+クリック：選択に追加・解除（ドラッグはしない）
      const next = new Set(selection.value);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      selection.value = next;
      return;
    }
    if (key) {
      // 選択していない家具を押したら、その家具だけを選ぶ。選択中の家具ならまとめて動かす
      if (!selection.value.has(key)) select([key]);
      const group = selectedItems.value;
      drag = { mode: "move", group, start: p, origins: new Map(group.map((i) => [i.key, { x: i.x, y: i.y }])), before };
    } else {
      // 何もない所：範囲選択を始める（Shift を押していれば今の選択に追加）
      const base = e.shiftKey ? new Set(selection.value) : new Set<string>();
      drag = { mode: "marquee", base, box: { x1: p.x, y1: p.y, x2: p.x, y2: p.y } };
      selection.value = new Set(base);
      marquee.value = { ...drag.box };
    }
  }
  try {
    // 部屋の外までドラッグしても追いかけられるようにする
    roomMap.value?.svg?.setPointerCapture(e.pointerId);
  } catch {
    // 対応していない入力（一部のペンや自動操作など）では、捕まえずに続ける
  }
}

/** 範囲選択の枠を p まで広げ、枠に少しでも重なった家具を選ぶ */
function selectInBox(d: Extract<Drag, { mode: "marquee" }>, p: { x: number; y: number }) {
  d.box.x2 = p.x;
  d.box.y2 = p.y;
  const [x1, x2] = [Math.min(d.box.x1, p.x), Math.max(d.box.x1, p.x)];
  const [y1, y2] = [Math.min(d.box.y1, p.y), Math.max(d.box.y1, p.y)];
  const hit = items.value.filter((i) => {
    const { w, h } = footprint(i);
    return i.x < x2 && i.x + w > x1 && i.y < y2 && i.y + h > y1;
  });
  select([...d.base, ...hit.map((i) => i.key)]);
  marquee.value = { ...d.box };
}

function onPointerMove(e: PointerEvent) {
  if (!drag) return;
  const p = grid(e);
  if (drag.mode === "move") {
    moveGroup(drag.group, Math.round(p.x - drag.start.x), Math.round(p.y - drag.start.y), drag.origins);
  } else if (drag.mode === "resize") {
    const item = drag.item;
    const w = Math.max(1, Math.round(p.x - item.x));
    const h = Math.max(1, Math.round(p.y - item.y));
    const turned = item.rotation === 90 || item.rotation === 270;
    apply(item, turned ? { width: h, height: w } : { width: w, height: h });
  } else {
    selectInBox(drag, p);
  }
}

function onPointerEnd(e: PointerEvent) {
  // 指を離した位置でも範囲を確定する（移動のイベントが少ない環境でも選べるように）
  if (drag?.mode === "marquee") selectInBox(drag, grid(e));
  if (drag && "before" in drag && JSON.stringify(drag.before) !== JSON.stringify(items.value)) checkpoint(drag.before);
  drag = null;
  marquee.value = null;
}

/** 選択枠・大きさ変更のつまみ・範囲選択の枠（px） */
const selectionBoxes = computed(() =>
  selectedItems.value.map((item) => {
    const { w, h } = footprint(item);
    return { key: item.key, rect: { x: item.x * CELL - 2, y: item.y * CELL - 2, width: w * CELL + 4, height: h * CELL + 4 } };
  }),
);
const resizeHandle = computed(() => {
  // 大きさの変更は、1つだけ選んでいるときにできる
  const one = single.value;
  if (!one) return null;
  const { w, h } = footprint(one);
  return { x: (one.x + w) * CELL - 7, y: (one.y + h) * CELL - 7 };
});
const marqueeRect = computed(() => {
  const m = marquee.value;
  if (!m) return null;
  return {
    x: Math.min(m.x1, m.x2) * CELL,
    y: Math.min(m.y1, m.y2) * CELL,
    width: Math.abs(m.x2 - m.x1) * CELL,
    height: Math.abs(m.y2 - m.y1) * CELL,
  };
});

// ───────── キーボード操作 ─────────

function onKeydown(e: KeyboardEvent) {
  // 入力欄で文字を打っているときは、ショートカットとして扱わない
  const typing = e.target instanceof Element && e.target.closest("input, select, textarea, dialog");
  if (!room.value || typing) return;
  const key = e.key.toLowerCase();

  if (e.ctrlKey || e.metaKey) {
    const actions: Record<string, () => unknown> = {
      z: () => (e.shiftKey ? redo() : undo()),
      y: redo,
      c: () => copySelected() && showToast(`${clipboard.length}個をコピーしました`),
      v: paste,
      d: duplicateSelected,
      a: () => select(items.value.map((i) => i.key)),
    };
    if (actions[key]) {
      e.preventDefault();
      actions[key]();
    }
    return;
  }

  if (!selection.value.size) return;
  const moves: Record<string, [number, number]> = {
    arrowleft: [-1, 0],
    arrowright: [1, 0],
    arrowup: [0, -1],
    arrowdown: [0, 1],
  };
  if (moves[key]) {
    e.preventDefault();
    checkpoint();
    moveGroup(selectedItems.value, ...moves[key]);
  } else if (key === "delete" || key === "backspace") {
    e.preventDefault();
    removeSelected();
  } else if (key === "r") {
    rotateSelected(e.shiftKey ? -90 : 90);
  } else if (key === "escape") {
    select([]);
  }
}

// ───────── 保存・保存時の状態に戻す ─────────

async function save() {
  const r = room.value;
  if (!r) return;
  // 座っている人がいる椅子を削除しようとしていないか確認する
  const before = JSON.parse(savedSnapshot.value) as Furniture[];
  const keptIds = new Set(items.value.filter((i) => i.type === "chair" && i.id).map((i) => i.id));
  const removedChairIds = before.filter((f) => f.type === "chair" && !keptIds.has(f.id)).map((f) => f.id);
  if (removedChairIds.length) {
    const occupants = await officesApi.getOccupancy(r.id).catch(() => []);
    const affected = occupants.filter((o) => removedChairIds.includes(o.seat_id));
    if (
      affected.length &&
      !confirm(
        "次の人が座っている椅子を削除します。保存すると、この人たちは「未出勤」に戻ります。\n\n" +
          affected.map((o) => `・${o.name ?? "名前未登録"}`).join("\n"),
      )
    ) {
      return;
    }
  }

  saving.value = true;
  try {
    const payload = items.value.map(({ key: _key, ...rest }) => rest);
    const layout = await officesApi.saveLayout(r.id, payload);
    // 保存後も同じ家具を選んだままにする（並び順は送った順のまま返ってくる）
    const selectedIndexes = items.value.flatMap((i, idx) => (selection.value.has(i.key) ? [idx] : []));
    items.value = layout.furniture.map((f) => ({ ...f, key: keyOf() }));
    savedSnapshot.value = snapshot();
    select(selectedIndexes.map((idx) => items.value[idx]?.key).filter((k): k is string => Boolean(k)));
    // 保存前の状態には id のない家具が含まれるので、履歴はここで区切る
    undoStack.value = [];
    redoStack.value = [];
    showToast("配置を保存しました");
  } catch (err) {
    toastError(err);
  } finally {
    saving.value = false;
  }
}

async function revert() {
  if (!room.value || !isDirty.value) return;
  if (!confirm("保存していない変更を破棄して、保存済みの配置に戻しますか？")) return;
  await loadRoom(room.value.id);
}

function onBeforeUnload(e: BeforeUnloadEvent) {
  if (isDirty.value) e.preventDefault();
}

onMounted(async () => {
  floors.value = await officesApi.listFloors();
  if (rooms.value.length) {
    const fromUrl = Number(new URLSearchParams(window.location.search).get("room"));
    await loadRoom(rooms.value.some((r) => r.id === fromUrl) ? fromUrl : rooms.value[0].id);
  }
  loaded.value = true;
  document.addEventListener("keydown", onKeydown);
  window.addEventListener("beforeunload", onBeforeUnload);
});

onBeforeUnmount(() => {
  document.removeEventListener("keydown", onKeydown);
  window.removeEventListener("beforeunload", onBeforeUnload);
});
</script>

<template>
  <main class="editor">
    <aside class="editor__palette">
      <h2 class="editor__heading">部品</h2>
      <p class="field__hint">クリックで部屋に追加します。</p>
      <div class="editor__palette-items">
        <button
          v-for="(def, type) in FURNITURE_TYPES"
          :key="type"
          type="button"
          :class="['palette-item', `palette-item--${type}`]"
          @click="addItem(type)"
        >{{ def.label }}</button>
      </div>
      <h2 class="editor__heading">操作</h2>
      <ul class="editor__help">
        <li>ドラッグで移動（選択中の家具はまとめて動く）</li>
        <li>何もない所をドラッグで範囲選択</li>
        <li><kbd>Shift</kbd>+クリックで選択に追加・解除</li>
        <li>右下の □ をドラッグで大きさ変更</li>
        <li>矢印キーで1マス移動</li>
        <li><kbd>R</kbd> で回転、<kbd>Delete</kbd> で削除</li>
        <li><kbd>Ctrl</kbd>+<kbd>C</kbd> / <kbd>V</kbd> でコピー・貼り付け、<kbd>Ctrl</kbd>+<kbd>D</kbd> で複製</li>
        <li><kbd>Ctrl</kbd>+<kbd>Z</kbd> で元に戻す、<kbd>Ctrl</kbd>+<kbd>Y</kbd> でやり直し</li>
        <li><kbd>Ctrl</kbd>+<kbd>A</kbd> ですべて選択、<kbd>Esc</kbd> で選択解除</li>
      </ul>
    </aside>

    <section class="editor__canvas">
      <div class="editor__toolbar">
        <select class="field__input" aria-label="編集する部屋" :value="roomId" @change="onRoomChange">
          <template v-for="f in floors" :key="f.id">
            <optgroup v-if="f.rooms.length" :label="f.name">
              <option v-for="r in f.rooms" :key="r.id" :value="r.id">{{ r.name }}</option>
            </optgroup>
          </template>
        </select>
        <span id="status" :class="['editor__status', { 'editor__status--dirty': isDirty }]">
          {{ room ? (isDirty ? "● 保存していない変更があります" : "保存済み") : "" }}
        </span>
        <button type="button" class="button button--ghost button--small" title="元に戻す（Ctrl+Z）" :disabled="!undoStack.length" @click="undo">↶ 元に戻す</button>
        <button type="button" class="button button--ghost button--small" title="やり直し（Ctrl+Y）" :disabled="!redoStack.length" @click="redo">↷ やり直し</button>
        <span class="editor__spacer"></span>
        <button type="button" class="button button--ghost" :disabled="!room" @click="revert">保存時の状態に戻す</button>
        <button type="button" class="button" :disabled="!room || saving" @click="save">保存する</button>
      </div>
      <div ref="stage" class="editor__stage">
        <div v-if="loaded && !rooms.length" class="empty-state">
          <p>まだ部屋がありません。</p>
          <a class="button" href="/admin/offices.html">フロア・部屋を作成する</a>
        </div>
        <RoomMap
          v-else-if="room"
          ref="roomMap"
          :room="room"
          fixed-width
          class="room-map--editable"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerEnd"
          @pointercancel="onPointerEnd"
        >
          <FurnitureShape
            v-for="item in items"
            :key="item.key"
            :item="item"
            :data-key="item.key"
            :class="{ 'furniture--selected': selection.has(item.key) }"
          />
          <template #overlay>
            <rect v-for="b in selectionBoxes" :key="b.key" v-bind="b.rect" class="selection" />
            <rect
              v-if="resizeHandle"
              :x="resizeHandle.x"
              :y="resizeHandle.y"
              width="12"
              height="12"
              class="selection__handle"
              data-handle="resize"
            />
            <rect v-if="marqueeRect" v-bind="marqueeRect" class="marquee" />
          </template>
        </RoomMap>
      </div>
    </section>

    <aside id="props" class="editor__props">
      <h2 class="editor__heading">選択中の家具</h2>
      <p v-if="!selection.size" class="field__hint">家具をクリックすると、ここで細かく調整できます。</p>
      <div v-else class="form">
        <div class="editor__type" data-type>{{ typeText }}</div>
        <form v-if="single" class="form" novalidate @submit.prevent @focusin="onPropsFocus" @change="onPropsChange">
          <label class="field">
            <span class="field__label">ラベル</span>
            <input class="field__input" type="text" name="label" maxlength="50" placeholder="例：A-1" :value="single.label ?? ''" @input="onLabelInput">
          </label>
          <div class="field-row">
            <label class="field"><span class="field__label">X</span><input class="field__input" type="number" name="x" min="0" :value="single.x" @input="onNumberInput('x', $event)"></label>
            <label class="field"><span class="field__label">Y</span><input class="field__input" type="number" name="y" min="0" :value="single.y" @input="onNumberInput('y', $event)"></label>
          </div>
          <div class="field-row">
            <label class="field"><span class="field__label">幅</span><input class="field__input" type="number" name="width" min="1" :value="single.width" @input="onNumberInput('width', $event)"></label>
            <label class="field"><span class="field__label">奥行き</span><input class="field__input" type="number" name="height" min="1" :value="single.height" @input="onNumberInput('height', $event)"></label>
          </div>
        </form>
        <div class="field">
          <span class="field__label">向き</span>
          <div class="input-row">
            <button type="button" class="button button--ghost" title="左に回転（Shift+R）" @click="rotateSelected(-90)">⟲ 左</button>
            <button type="button" class="button button--ghost" title="右に回転（R）" @click="rotateSelected(90)">右 ⟳</button>
          </div>
        </div>
        <div class="input-row">
          <button type="button" class="button button--ghost" title="複製（Ctrl+D）" @click="duplicateSelected">複製</button>
          <button type="button" class="button button--ghost button--danger-text" title="削除（Delete）" @click="removeSelected">削除</button>
        </div>
      </div>
    </aside>
  </main>
</template>
