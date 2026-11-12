<script setup lang="ts">
/**
 * 従業員のプロフィールをポップアップ（ダイアログ）で表示する。
 * 使い方: popup.value.open(userId, { actions })
 *   actions: ポップアップに追加するボタン。onClick が true を返すとポップアップを閉じる
 */
import { computed, ref, useTemplateRef } from "vue";

import { profileApi, SKILL_CATEGORIES } from "@/api";
import { STATUS_LABELS } from "@/lib/map";
import type { ProfileView } from "@/types/api";

export interface PopupAction {
  label: string;
  danger?: boolean;
  onClick: () => Promise<boolean>;
}

const dialog = useTemplateRef<HTMLDialogElement>("dialog");
const profile = ref<ProfileView | null>(null);
const error = ref("");
const actions = ref<PopupAction[]>([]);
const busy = ref(false);

const status = computed(() => profile.value?.presence?.status ?? "not_working");
const meta = computed(() => {
  const p = profile.value;
  return p ? [`${p.age}歳`, p.position, p.job_type].filter(Boolean).join(" ・ ") : error.value;
});
const skillGroups = computed(() => {
  const p = profile.value;
  if (!p?.is_engineer) return [];
  return SKILL_CATEGORIES.map((c) => ({ ...c, items: p.skills.filter((s) => s.category === c.value) })).filter(
    (g) => g.items.length,
  );
});

async function open(userId: number, options: { actions?: PopupAction[] } = {}) {
  profile.value = null;
  error.value = "";
  actions.value = options.actions ?? [];
  dialog.value?.showModal();
  try {
    profile.value = await profileApi.get(userId);
  } catch (err) {
    error.value = err instanceof Error ? err.message : "";
  }
}

async function run(action: PopupAction) {
  busy.value = true;
  try {
    if (await action.onClick()) dialog.value?.close();
  } finally {
    busy.value = false;
  }
}

/** 背景をクリックしたら閉じる */
function onClick(e: MouseEvent) {
  if (e.target === dialog.value) dialog.value?.close();
}

defineExpose({ open });
</script>

<template>
  <dialog ref="dialog" class="dialog profile-popup" @click="onClick">
    <div class="profile-popup__head">
      <img v-if="profile?.avatar_url" class="avatar avatar--lg" :src="profile.avatar_url" alt="">
      <div v-else class="avatar avatar--lg avatar--placeholder">{{ profile?.name.charAt(0) }}</div>
      <div>
        <h2 class="dialog__title" data-name>
          {{ profile ? profile.name : error ? "プロフィールを表示できません" : "読み込み中..." }}
        </h2>
        <p class="profile-popup__meta">{{ meta }}</p>
        <span v-if="profile" :class="['status-badge', `status-badge--${status}`]">{{ STATUS_LABELS[status] }}</span>
      </div>
    </div>
    <p v-if="profile?.presence?.comment" class="profile-popup__comment">💬 {{ profile.presence.comment }}</p>
    <div>
      <div v-for="g in skillGroups" :key="g.value" class="profile-popup__skills">
        <span class="profile-popup__skill-category">{{ g.label }}</span>
        <span v-for="s in g.items" :key="s.name" class="chip">{{ s.name }} {{ s.years }}年</span>
      </div>
    </div>
    <div class="dialog__actions">
      <span>
        <button
          v-for="a in actions"
          :key="a.label"
          type="button"
          :class="['button', 'button--ghost', { 'button--danger-text': a.danger }]"
          :disabled="busy"
          @click="run(a)"
        >{{ a.label }}</button>
      </span>
      <span class="editor__spacer"></span>
      <button type="button" class="button button--ghost" @click="dialog?.close()">閉じる</button>
    </div>
  </dialog>
</template>
