<script setup lang="ts">
/**
 * オフィスマップ：部屋ごとに座席と座っている人を表示する（30秒ごとに自動で更新）。
 * 一般ユーザーは、ここで出社（座席の選択）・離席・リモート・退勤・コメントを操作する。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef } from "vue";

import { ApiError, officesApi, presenceApi, profileApi } from "@/api";
import FurnitureShape from "@/components/map/FurnitureShape.vue";
import OccupantMarker from "@/components/map/OccupantMarker.vue";
import RoomMap from "@/components/map/RoomMap.vue";
import ProfilePopup, { type PopupAction } from "@/components/ProfilePopup.vue";
import SampleDataBanner from "@/components/SampleDataBanner.vue";
import { STATUS_LABELS, seatText, staleLabel } from "@/lib/map";
import { currentUser } from "@/lib/session";
import { showToast, toastError } from "@/lib/toast";
import type { Floor, Furniture, Layout, Occupant, Presence, PresenceStatus, Seat } from "@/types/api";

const POLL_INTERVAL_MS = 30_000;
const LAST_ROOM_KEY = "map:lastRoomId";

const me = currentUser();
const isGeneral = me.role === "general";
const popup = useTemplateRef<InstanceType<typeof ProfilePopup>>("popup");

// ───────── 状態 ─────────

const loaded = ref(false);
const floors = ref<Floor[]>([]);
const rooms = computed(() => floors.value.flatMap((f) => f.rooms));
const layout = ref<Layout | null>(null);
const occupants = ref<Occupant[]>([]);
const entries = ref<Presence[]>([]);
const updatedText = ref("");
/** 自分の勤務状況（一般ユーザーのみ） */
const myPresence = ref<Presence | null>(null);
/** デフォルト座席の場所（一般ユーザーのみ） */
const defaultSeat = ref<Seat | null>(null);
/** 座席の選択中（出社・座席変更） */
const picking = ref<{ seatId: number | null; isChange: boolean } | null>(null);
const comment = ref("");
const commentFocused = ref(false);
const focusedSeatId = ref<number | null>(null);

const title = computed(() => (layout.value ? `${layout.value.floor_name} / ${layout.value.room.name}` : "マップ"));
const seats = computed(
  () => new Map((layout.value?.furniture ?? []).filter((f) => f.type === "chair").map((f) => [f.id!, f])),
);
const remote = computed(() => entries.value.filter((e) => e.status === "remote"));

/** 自分以外が座っている座席 */
const takenByOthers = computed(
  () => new Set(occupants.value.filter((o) => o.user_id !== myPresence.value?.user_id).map((o) => o.seat_id)),
);

// ───────── 部屋の表示 ─────────

async function showRoom(roomId: number) {
  const next = await officesApi.getLayout(roomId);
  try {
    localStorage.setItem(LAST_ROOM_KEY, String(roomId));
  } catch {
    // 保存できない環境でも動くようにする
  }
  layout.value = next;
  occupants.value = [];
  await refreshOccupants();
}

async function refreshOccupants() {
  const roomId = layout.value?.room.id;
  if (roomId === undefined) return;
  const result = await officesApi.getOccupancy(roomId);
  if (layout.value?.room.id === roomId) occupants.value = result; // 取得中に部屋が切り替わったら捨てる
}

async function refreshAll() {
  try {
    const [list] = await Promise.all([presenceApi.list(), refreshOccupants()]);
    entries.value = list;
    if (isGeneral && myPresence.value) {
      myPresence.value = list.find((e) => e.user_id === myPresence.value!.user_id) ?? myPresence.value;
      if (!commentFocused.value) comment.value = myPresence.value.comment ?? "";
    }
    updatedText.value = `${new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })} 時点`;
  } catch (err) {
    updatedText.value = `更新できませんでした（${err instanceof Error ? err.message : ""}）`;
  }
}

// ───────── 自分の状態（一般ユーザー） ─────────

type Action = { label: string; ghost?: boolean; run: () => unknown };
const actions = computed<Action[]>(() => {
  const p = myPresence.value;
  if (!p) return [];
  const leave = { label: "退勤", ghost: true, run: () => changeStatus("not_working") };
  return {
    not_working: [
      { label: "出社", run: () => startPicking() },
      { label: "リモート", run: () => changeStatus("remote") },
    ],
    present: [
      { label: "離席", run: () => changeStatus("away") },
      { label: "座席変更", run: () => startPicking() },
      leave,
    ],
    away: [
      { label: "在席に戻る", run: () => changeStatus("present", p.seat?.seat_id ?? null) },
      { label: "座席変更", run: () => startPicking() },
      leave,
    ],
    remote: [{ label: "出社", run: () => startPicking() }, leave],
  }[p.status];
});

async function changeStatus(
  status: PresenceStatus,
  seatId: number | null = null,
  options: { comment?: string | null } = {},
): Promise<boolean> {
  try {
    myPresence.value = await presenceApi.update(status, { seatId, ...options });
    if (!commentFocused.value) comment.value = myPresence.value.comment ?? "";
    await refreshAll();
    return true;
  } catch (err) {
    toastError(err);
    if (err instanceof ApiError && err.code === "SEAT_OCCUPIED") await refreshAll();
    return false;
  }
}

async function saveComment() {
  const p = myPresence.value;
  if (!p) return;
  const text = comment.value.trim();
  if (await changeStatus(p.status, p.seat?.seat_id ?? null, { comment: text || null })) {
    showToast("コメントを保存しました");
  }
}

// ───────── 座席の選択（出社・座席変更） ─────────

async function startPicking() {
  const p = myPresence.value;
  if (!p) return;
  if (rooms.value.length === 0) {
    showToast("オフィスマップがまだ作成されていません", "error");
    return;
  }
  const isChange = p.status === "present" || p.status === "away";
  picking.value = { seatId: null, isChange };
  // 出社のときは、空いていればデフォルト座席を最初から選んでおく
  const seat = defaultSeat.value;
  if (!isChange && seat) {
    if (layout.value?.room.id !== seat.room_id) await showRoom(seat.room_id);
    if (picking.value && !takenByOthers.value.has(seat.seat_id)) picking.value.seatId = seat.seat_id;
  }
}

function stopPicking() {
  picking.value = null;
}

const pickText = computed(() => {
  const id = picking.value?.seatId;
  if (!id) return "空いている椅子をクリックして選んでください";
  const seat = seats.value.get(id);
  if (!seat) return "選択中の座席は別の部屋にあります";
  return `選択中：${title.value}${seat.label ? ` / ${seat.label}` : ""}`;
});
const pickSending = ref(false);

function onSeatClick(item: Furniture) {
  if (!picking.value || item.type !== "chair" || item.id == null) return;
  if (takenByOthers.value.has(item.id)) {
    showToast("この座席は使用中です", "error");
    return;
  }
  picking.value.seatId = item.id;
}

async function confirmSeat() {
  const seatId = picking.value?.seatId;
  if (!seatId) return;
  pickSending.value = true;
  try {
    if (await changeStatus("present", seatId)) {
      stopPicking();
      showToast("出社しました");
    } else if (picking.value) {
      picking.value.seatId = null;
    }
  } finally {
    pickSending.value = false;
  }
}

/** 座席の選択中は、空いている椅子・使用中の椅子・選んだ椅子を見分けられるようにする */
function seatClasses(item: Furniture) {
  if (!picking.value || item.type !== "chair" || item.id == null) return {};
  const id = item.id;
  return {
    "furniture--taken": takenByOthers.value.has(id),
    "furniture--picked": picking.value.seatId === id,
    "furniture--highlight": defaultSeat.value?.seat_id === id && picking.value.seatId !== id,
  };
}

// ───────── プロフィールの表示 ─────────

function onOccupantClick(occupant: Occupant) {
  const popupActions: PopupAction[] = [];
  if (me.role === "master") {
    popupActions.push({
      label: "座席を空ける",
      danger: true,
      onClick: async () => {
        if (!confirm(`${occupant.name ?? "この人"}の座席を空けますか？\nこの人は「未出勤」になります。`)) return false;
        try {
          await presenceApi.releaseSeat(occupant.seat_id);
          showToast("座席を空けました");
          await refreshAll();
          return true;
        } catch (err) {
          toastError(err);
          return false;
        }
      },
    });
  }
  popup.value?.open(occupant.user_id, { actions: popupActions });
}

/** 指定した座席に座っている人を目立たせ、画面内に表示する */
async function focusSeat(seatId: number) {
  if (!occupants.value.some((o) => o.seat_id === seatId)) {
    showToast("その座席には今は誰も座っていません", "error");
    return;
  }
  focusedSeatId.value = seatId;
  await nextTick();
  document
    .querySelector(`.occupant[data-seat-id="${seatId}"]`)
    ?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
  setTimeout(() => (focusedSeatId.value = null), 4000);
}

// ───────── 開始・自動更新 ─────────

const reload = () => window.location.reload();

let timer: ReturnType<typeof setInterval> | undefined;
const onVisible = () => {
  if (!document.hidden) refreshAll();
};

onMounted(async () => {
  floors.value = await officesApi.listFloors();
  if (isGeneral) {
    const [presence, profile] = await Promise.all([presenceApi.getMine(), profileApi.getMine()]);
    myPresence.value = presence;
    comment.value = presence.comment ?? "";
    defaultSeat.value = profile.default_seat;
  }

  if (rooms.value.length === 0) {
    entries.value = await presenceApi.list();
  } else {
    let saved = 0;
    try {
      saved = Number(localStorage.getItem(LAST_ROOM_KEY));
    } catch {
      // 無視
    }
    // 開く部屋の優先順：URL で指定された部屋（メンバー画面の「マップで見る」）→
    // 出社中なら自分の座席がある部屋 → 前回の部屋
    const params = new URLSearchParams(window.location.search);
    const requested = Number(params.get("room"));
    const mine = myPresence.value?.seat?.room_id;
    const initial = [requested, mine, saved].find((id) => rooms.value.some((r) => r.id === id)) ?? rooms.value[0].id;
    await showRoom(initial);
    await refreshAll();
    if (requested === initial && params.get("seat")) await focusSeat(Number(params.get("seat")));
  }
  loaded.value = true;

  timer = setInterval(() => {
    if (!document.hidden) refreshAll();
  }, POLL_INTERVAL_MS);
  // タブを開き直したときは、すぐに最新の状態にする
  document.addEventListener("visibilitychange", onVisible);
});

onBeforeUnmount(() => {
  clearInterval(timer);
  document.removeEventListener("visibilitychange", onVisible);
});
</script>

<template>
  <main class="map-page">
    <nav class="map-page__rooms" aria-label="フロアと部屋">
      <ul class="room-nav">
        <template v-for="f in floors" :key="f.id">
          <li class="room-nav__floor">{{ f.name }}</li>
          <li v-for="r in f.rooms" :key="r.id">
            <button
              type="button"
              class="room-nav__room"
              :aria-current="r.id === layout?.room.id"
              @click="showRoom(r.id)"
            >{{ r.name }}</button>
          </li>
        </template>
      </ul>
    </nav>

    <section class="map-page__main">
      <div class="map-page__title">
        <h1>{{ title }}</h1>
        <span class="map-page__updated">{{ updatedText }}</span>
      </div>
      <!-- 座席を選んでいる間だけ表示する -->
      <div v-if="picking" class="pick-bar">
        <span class="pick-bar__text">{{ pickText }}</span>
        <button type="button" class="button button--ghost" @click="stopPicking">キャンセル</button>
        <button type="button" class="button" :disabled="!picking.seatId || pickSending" @click="confirmSeat">
          {{ picking.isChange ? "この座席に移動" : "この座席で出社" }}
        </button>
      </div>
      <div class="map-page__stage">
        <RoomMap v-if="layout" :room="layout.room" fixed-width :class="{ 'room-map--pickable': picking }">
          <FurnitureShape
            v-for="(item, i) in layout.furniture"
            :key="item.id ?? `new-${i}`"
            :item="item"
            :class="seatClasses(item)"
            :data-seat-id="item.type === 'chair' ? item.id : undefined"
            @click="onSeatClick(item)"
          />
          <template #overlay>
            <template v-for="o in occupants" :key="o.seat_id">
              <OccupantMarker
                v-if="seats.get(o.seat_id)"
                :occupant="o"
                :seat="seats.get(o.seat_id)!"
                :focused="focusedSeatId === o.seat_id"
                @select="onOccupantClick"
              />
            </template>
          </template>
        </RoomMap>
        <div v-else-if="loaded && rooms.length === 0" class="empty-state">
          <p>まだオフィスマップがありません。</p>
          <template v-if="me.role === 'master'">
            <a class="button" href="/admin/offices.html">フロア・部屋を作成する</a>
            <!-- サンプルデータを作成できる場合は、そのボタンも出す -->
            <SampleDataBanner @created="reload" />
          </template>
          <p v-else class="field__hint">管理者がマップを作成すると、ここに表示されます。リモートの登録はできます。</p>
        </div>
      </div>
    </section>

    <aside class="map-page__side">
      <!-- 一般ユーザーだけに表示 -->
      <section v-if="myPresence" class="side-section">
        <h2 class="editor__heading">自分の状態</h2>
        <div class="my-status__current">
          <span id="my-badge" :class="['status-badge', `status-badge--${myPresence.status}`]">{{ STATUS_LABELS[myPresence.status] }}</span>
          <span id="my-seat" class="my-status__seat">{{ myPresence.seat ? seatText(myPresence.seat) : "" }}</span>
        </div>
        <p v-if="myPresence.is_stale" class="stale-notice">前日の状態のままです。今日の状態に更新してください。</p>
        <div class="my-status__actions">
          <button
            v-for="a in actions"
            :key="a.label"
            type="button"
            :class="a.ghost ? 'button button--ghost' : 'button'"
            :disabled="Boolean(picking)"
            @click="a.run()"
          >{{ a.label }}</button>
        </div>
        <form class="my-status__comment" novalidate @submit.prevent="saveComment">
          <label class="field">
            <span class="field__label">ひとことコメント</span>
            <div class="input-row">
              <input
                v-model="comment"
                class="field__input"
                type="text"
                name="comment"
                maxlength="100"
                placeholder="例：14時まで会議です"
                @focus="commentFocused = true"
                @blur="commentFocused = false"
              >
              <button type="submit" class="button button--ghost">保存</button>
            </div>
          </label>
        </form>
      </section>

      <section class="side-section">
        <h2 class="editor__heading">リモート <span class="count">({{ remote.length }})</span></h2>
        <ul class="people-list">
          <li v-if="!remote.length" class="people-list__empty">いません</li>
          <li v-for="e in remote" :key="e.user_id">
            <button type="button" class="people-list__person" @click="popup?.open(e.user_id)">
              <span class="people-list__name">
                {{ e.name ?? "名前未登録" }}
                <span v-if="e.is_stale" class="stale-tag" :title="staleLabel(e.updated_at)">前日から</span>
              </span>
              <span v-if="e.comment" class="people-list__comment">{{ e.comment }}</span>
            </button>
          </li>
        </ul>
      </section>

      <section class="side-section">
        <h2 class="editor__heading">表示の見方</h2>
        <ul class="legend">
          <li><span class="legend__dot legend__dot--present"></span>在席中</li>
          <li><span class="legend__dot legend__dot--away"></span>離席中</li>
          <li><span class="legend__dot legend__dot--remote"></span>リモート（上の一覧）</li>
          <li><span class="legend__dot legend__dot--stale"></span>薄い点線：前日から更新なし</li>
        </ul>
        <p class="field__hint">アイコンをクリックするとプロフィールを表示します。表示は30秒ごとに自動で更新されます。</p>
      </section>
    </aside>
  </main>
  <ProfilePopup ref="popup" />
</template>
