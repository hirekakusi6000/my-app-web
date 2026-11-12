<script setup lang="ts">
/**
 * 座席の管理（マスター）：使用中の座席の一覧。
 * 日付が変わっても状態はリセットされないため、退勤し忘れた人の座席はここで空けられる。
 */
import { computed, onMounted, ref } from "vue";

import { presenceApi } from "@/api";
import { STATUS_LABELS, seatText } from "@/lib/map";
import { showToast, toastError } from "@/lib/toast";
import type { Presence, PresenceStatus } from "@/types/api";

const entries = ref<Presence[] | null>(null);

async function reload() {
  entries.value = await presenceApi.list();
}
onMounted(reload);

const counts = computed(() => {
  const result: Record<PresenceStatus, number> = { present: 0, away: 0, remote: 0, not_working: 0 };
  for (const e of entries.value ?? []) result[e.status] += 1;
  return result;
});
const seated = computed(() => (entries.value ?? []).filter((e) => e.seat));
const stale = computed(() => (entries.value ?? []).filter((e) => e.is_stale));
const staleSeated = computed(() => stale.value.filter((e) => e.seat).length);

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

async function resetStale() {
  if (!confirm("前日から状態を更新していない人を、まとめて「未出勤」に戻しますか？\n座っていた座席は空きます。")) return;
  try {
    const { count } = await presenceApi.resetStale();
    showToast(`${count}名を未出勤に戻しました`);
  } catch (err) {
    toastError(err);
  }
  await reload();
}

async function release(e: Presence) {
  if (!e.seat) return;
  if (!confirm(`${e.name ?? "この人"}の座席（${seatText(e.seat)}）を空けますか？\nこの人は「未出勤」になります。`)) return;
  try {
    await presenceApi.releaseSeat(e.seat.seat_id);
    showToast("座席を空けました");
  } catch (err) {
    toastError(err);
  }
  await reload();
}

async function refresh() {
  await reload();
  showToast("最新の状態にしました");
}
</script>

<template>
  <main class="page">
    <div class="page__head">
      <div>
        <h1 class="page__title">座席の管理</h1>
        <p class="page__lead">使用中の座席の一覧です。日付が変わっても状態はリセットされないため、退勤し忘れた人の座席はここで空けられます。</p>
      </div>
      <button type="button" class="button button--ghost" @click="refresh">最新の状態にする</button>
    </div>

    <div class="summary">
      <div v-for="(n, status) in counts" :key="status" class="summary__item">
        <span :class="['status-badge', `status-badge--${status}`]">{{ STATUS_LABELS[status] }}</span>
        <strong>{{ n }}名</strong>
      </div>
    </div>

    <!-- 前日から状態を更新していない人がいるときだけ表示する -->
    <div v-if="stale.length" class="stale-banner">
      <span>前日から状態を更新していない人が {{ stale.length }}名 います（うち座席を使用中 {{ staleSeated }}名）。退勤し忘れの可能性があります。</span>
      <button type="button" class="button button--danger" @click="resetStale">まとめて未出勤に戻す</button>
    </div>

    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>名前</th>
            <th>状態</th>
            <th>座席</th>
            <th>ひとことコメント</th>
            <th>最終更新</th>
            <th class="table__actions">操作</th>
          </tr>
        </thead>
        <tbody id="rows">
          <tr v-if="!entries"><td colspan="6" class="table__empty">読み込み中...</td></tr>
          <tr v-else-if="!seated.length"><td colspan="6" class="table__empty">使用中の座席はありません</td></tr>
          <tr v-for="e in seated" :key="e.user_id">
            <td>{{ e.name ?? "名前未登録" }}</td>
            <td><span :class="['status-badge', `status-badge--${e.status}`]">{{ STATUS_LABELS[e.status] }}</span></td>
            <td>{{ seatText(e.seat) }}</td>
            <td :class="{ table__muted: !e.comment }">{{ e.comment ?? "—" }}</td>
            <td>
              {{ formatDateTime(e.updated_at) }}
              <span v-if="e.is_stale" class="stale-tag">前日から</span>
            </td>
            <td class="table__actions">
              <button type="button" class="button button--ghost button--small button--danger-text" @click="release(e)">座席を空ける</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </main>
</template>
