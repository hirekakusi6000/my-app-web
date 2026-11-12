<script setup lang="ts">
/** フロア・部屋（マスター）：フロアと部屋の追加・名前変更・並べ替え・削除 */
import { onMounted, reactive, ref, useTemplateRef } from "vue";

import { officesApi } from "@/api";
import { type FormErrors, noErrors, toFormErrors } from "@/lib/errors";
import { showToast, toastError } from "@/lib/toast";
import type { Floor, Room } from "@/types/api";

const MAX_FLOORS = 5;
const MAX_ROOMS = 5;

const floors = ref<Floor[] | null>(null);

async function reload() {
  floors.value = await officesApi.listFloors();
}
onMounted(reload);

const errors = ref<FormErrors>(noErrors());
const sending = ref(false);

async function send(fieldNames: string[], action: () => Promise<void>) {
  errors.value = noErrors();
  sending.value = true;
  try {
    await action();
  } catch (err) {
    errors.value = toFormErrors(err, fieldNames);
  } finally {
    sending.value = false;
  }
}

// ───────── フロア ─────────

const floorDialog = useTemplateRef<HTMLDialogElement>("floorDialog");
const editingFloor = ref<Floor | null>(null);
const floorName = ref("");

function openFloorDialog(floor: Floor | null) {
  editingFloor.value = floor;
  floorName.value = floor?.name ?? "";
  errors.value = noErrors();
  floorDialog.value?.showModal();
}

const saveFloor = () =>
  send(["name"], async () => {
    const editing = editingFloor.value;
    if (editing) await officesApi.updateFloor(editing.id, { name: floorName.value.trim() });
    else await officesApi.createFloor(floorName.value.trim());
    floorDialog.value?.close();
    await reload();
    showToast(editing ? "フロア名を変更しました" : "フロアを追加しました");
  });

async function swapFloors(a: number, b: number) {
  const list = floors.value!;
  try {
    // 並び順の値を入れ替える（同じ値の場合も考えて、位置の番号を使う）
    await officesApi.updateFloor(list[a].id, { sort_order: b });
    await officesApi.updateFloor(list[b].id, { sort_order: a });
    await reload();
  } catch (err) {
    toastError(err);
  }
}

async function removeFloor(floor: Floor) {
  const roomNote = floor.rooms.length ? `\n中にある部屋（${floor.rooms.length}室）と家具もすべて削除されます。` : "";
  if (!confirm(`「${floor.name}」を削除しますか？${roomNote}\n座っている人は「未出勤」に戻ります。`)) return;
  try {
    await officesApi.deleteFloor(floor.id);
    await reload();
    showToast("フロアを削除しました");
  } catch (err) {
    toastError(err);
  }
}

// ───────── 部屋 ─────────

const roomDialog = useTemplateRef<HTMLDialogElement>("roomDialog");
const roomFloor = ref<Floor | null>(null);
const editingRoom = ref<Room | null>(null);
const room = reactive({ name: "", width: 30, height: 20 });

function openRoomDialog(floor: Floor, target: Room | null) {
  roomFloor.value = floor;
  editingRoom.value = target;
  Object.assign(room, target ? { name: target.name, width: target.width, height: target.height } : { name: "", width: 30, height: 20 });
  errors.value = noErrors();
  roomDialog.value?.showModal();
}

const saveRoom = () =>
  send(["name", "width", "height"], async () => {
    const fields = { name: room.name.trim(), width: Number(room.width), height: Number(room.height) };
    const editing = editingRoom.value;
    if (editing) await officesApi.updateRoom(editing.id, fields);
    else await officesApi.createRoom(roomFloor.value!.id, fields);
    roomDialog.value?.close();
    await reload();
    showToast(editing ? "部屋の設定を変更しました" : "部屋を追加しました");
  });

async function removeRoom(target: Room) {
  if (!confirm(`「${target.name}」を削除しますか？\n部屋の家具もすべて削除され、座っている人は「未出勤」に戻ります。`)) return;
  try {
    await officesApi.deleteRoom(target.id);
    await reload();
    showToast("部屋を削除しました");
  } catch (err) {
    toastError(err);
  }
}
</script>

<template>
  <main class="page page--narrow">
    <div class="page__head">
      <div>
        <h1 class="page__title">フロア・部屋</h1>
        <p class="page__lead">
          フロアは5つまで、部屋は1つのフロアに5つまで作成できます。
          <span v-if="floors">（{{ floors.length }} / {{ MAX_FLOORS }}）</span>
        </p>
      </div>
      <button type="button" class="button" :disabled="!floors || floors.length >= MAX_FLOORS" @click="openFloorDialog(null)">＋ フロアを追加</button>
    </div>

    <div id="floors">
      <section v-if="floors && floors.length === 0" class="panel empty-state">
        <p>まだフロアがありません。</p>
        <p class="field__hint">「＋ フロアを追加」から始めましょう（例：1F）。</p>
      </section>
      <section v-for="(floor, index) in floors ?? []" :key="floor.id" class="panel">
        <div class="panel__head">
          <h2 class="panel__title">{{ floor.name }}</h2>
          <div class="panel__head-actions">
            <button type="button" class="button button--ghost button--small" title="上へ" :disabled="index === 0" @click="swapFloors(index, index - 1)">↑</button>
            <button type="button" class="button button--ghost button--small" title="下へ" :disabled="index === floors!.length - 1" @click="swapFloors(index, index + 1)">↓</button>
            <button type="button" class="button button--ghost button--small" @click="openFloorDialog(floor)">名前変更</button>
            <button type="button" class="button button--ghost button--small" :disabled="floor.rooms.length >= MAX_ROOMS" @click="openRoomDialog(floor, null)">＋ 部屋を追加</button>
            <button type="button" class="button button--ghost button--small button--danger-text" @click="removeFloor(floor)">削除</button>
          </div>
        </div>
        <p v-if="floor.rooms.length === 0" class="field__hint">部屋がありません。</p>
        <ul v-else class="item-list">
          <li v-for="r in floor.rooms" :key="r.id" class="item-list__item">
            <span class="item-list__name">{{ r.name }}</span>
            <span class="badge badge--muted">{{ r.width }} × {{ r.height }} マス</span>
            <span class="item-list__actions">
              <a class="button button--small" :href="`/admin/map-editor.html?room=${r.id}`">配置を編集</a>
              <button type="button" class="button button--ghost button--small" @click="openRoomDialog(floor, r)">設定</button>
              <button type="button" class="button button--ghost button--small button--danger-text" @click="removeRoom(r)">削除</button>
            </span>
          </li>
        </ul>
      </section>
    </div>
  </main>

  <!-- フロア名 -->
  <dialog ref="floorDialog" class="dialog">
    <form class="form" novalidate @submit.prevent="saveFloor">
      <h2 class="dialog__title">{{ editingFloor ? "フロア名の変更" : "フロアを追加" }}</h2>
      <div v-if="errors.form" class="alert alert--error">{{ errors.form }}</div>
      <label class="field">
        <span class="field__label">フロア名</span>
        <input v-model="floorName" class="field__input" type="text" name="name" maxlength="50" placeholder="例：1F" required>
        <span class="field__error">{{ errors.fields.name }}</span>
      </label>
      <div class="dialog__actions">
        <button type="button" class="button button--ghost" @click="floorDialog?.close()">キャンセル</button>
        <button type="submit" class="button" :disabled="sending">保存する</button>
      </div>
    </form>
  </dialog>

  <!-- 部屋 -->
  <dialog ref="roomDialog" class="dialog">
    <form class="form" novalidate @submit.prevent="saveRoom">
      <h2 class="dialog__title">{{ editingRoom ? "部屋の設定" : `部屋を追加（${roomFloor?.name ?? ""}）` }}</h2>
      <div v-if="errors.form" class="alert alert--error">{{ errors.form }}</div>
      <label class="field">
        <span class="field__label">部屋名</span>
        <input v-model="room.name" class="field__input" type="text" name="name" maxlength="50" placeholder="例：執務室A" required>
        <span class="field__error">{{ errors.fields.name }}</span>
      </label>
      <div class="field-row">
        <label class="field">
          <span class="field__label">横幅（マス）</span>
          <input v-model.number="room.width" class="field__input" type="number" name="width" min="5" max="200" required>
          <span class="field__error">{{ errors.fields.width }}</span>
        </label>
        <label class="field">
          <span class="field__label">奥行き（マス）</span>
          <input v-model.number="room.height" class="field__input" type="number" name="height" min="5" max="200" required>
          <span class="field__error">{{ errors.fields.height }}</span>
        </label>
      </div>
      <span class="field__hint">1マスは椅子1脚分の大きさです。5〜200マスで指定できます。</span>
      <div class="dialog__actions">
        <button type="button" class="button button--ghost" @click="roomDialog?.close()">キャンセル</button>
        <button type="submit" class="button" :disabled="sending">保存する</button>
      </div>
    </form>
  </dialog>
</template>
