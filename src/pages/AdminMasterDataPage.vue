<script setup lang="ts">
/**
 * 候補の管理（マスター）：プロフィール登録で選べる役職・職種・スキルの候補。
 * 従業員が新しい名前を入力した場合も、ここに自動で追加される。
 */
import { computed, onMounted, reactive, ref, useTemplateRef } from "vue";

import { type MasterData, masterDataApi, SKILL_CATEGORIES } from "@/api";
import { type FormErrors, noErrors, toFormErrors } from "@/lib/errors";
import { showToast, toastError } from "@/lib/toast";
import type { JobType, Position, Skill, SkillCategory } from "@/types/api";

type Tab = "positions" | "jobTypes" | "skills";
type Item = Position | JobType | Skill;

const TAB_LABELS: Record<Tab, string> = { positions: "役職", jobTypes: "職種", skills: "スキル" };
const CATEGORY_LABEL = Object.fromEntries(SKILL_CATEGORIES.map((c) => [c.value, c.label])) as Record<SkillCategory, string>;

// タブごとの API 呼び出しの違いをここにまとめる
const TABS: Record<
  Tab,
  {
    create: () => Promise<unknown>;
    rename: (item: Item, name: string) => Promise<unknown>;
    remove: (item: Item) => Promise<unknown>;
    deleteNote: string;
  }
> = {
  positions: {
    create: () => masterDataApi.createPosition(addForm.name.trim()),
    rename: (item, name) => masterDataApi.renamePosition(item.id, name),
    remove: (item) => masterDataApi.deletePosition(item.id),
    deleteNote: "この役職を設定している従業員は「役職なし」になります。",
  },
  jobTypes: {
    create: () => masterDataApi.createJobType(addForm.name.trim(), addForm.isEngineer),
    rename: (item, name) => masterDataApi.updateJobType(item.id, name, (item as JobType).is_engineer),
    remove: (item) => masterDataApi.deleteJobType(item.id),
    deleteNote: "この職種を設定している従業員は「職種なし」になります。",
  },
  skills: {
    create: () => masterDataApi.createSkill(addForm.category, addForm.name.trim()),
    rename: (item, name) => masterDataApi.renameSkill(item.id, name),
    remove: (item) => masterDataApi.deleteSkill(item.id),
    deleteNote: "このスキルを登録している従業員からも削除されます。",
  },
};

const data = ref<MasterData | null>(null);
const tab = ref<Tab>("positions");
const skillFilter = ref<SkillCategory | "">("");

async function reload() {
  data.value = await masterDataApi.loadAll();
}
onMounted(reload);

const items = computed<Item[]>(() => {
  if (!data.value) return [];
  const list = data.value[tab.value];
  if (tab.value === "skills" && skillFilter.value) {
    return (list as Skill[]).filter((s) => s.category === skillFilter.value);
  }
  return list;
});

function selectTab(next: Tab) {
  tab.value = next;
  Object.assign(addForm, { name: "", isEngineer: false, category: "language" });
  addError.value = "";
}

// ───────── 追加 ─────────

const addForm = reactive({ name: "", isEngineer: false, category: "language" as SkillCategory });
const addError = ref("");

async function add() {
  addError.value = "";
  const name = addForm.name.trim();
  if (!name) {
    addError.value = "名前を入力してください";
    return;
  }
  try {
    await TABS[tab.value].create();
    addForm.name = "";
    await reload();
    showToast(`「${name}」を追加しました`);
  } catch (err) {
    addError.value = toFormErrors(err).form || "追加できませんでした";
  }
}

// ───────── エンジニアかどうか（職種） ─────────

async function toggleEngineer(item: JobType, event: Event) {
  const checkbox = event.target as HTMLInputElement;
  try {
    await masterDataApi.updateJobType(item.id, item.name, checkbox.checked);
    await reload();
    showToast(`「${item.name}」を${checkbox.checked ? "エンジニア" : "エンジニア以外"}にしました`);
  } catch (err) {
    checkbox.checked = !checkbox.checked;
    toastError(err);
  }
}

// ───────── 名前変更・削除 ─────────

const renameDialog = useTemplateRef<HTMLDialogElement>("renameDialog");
const renameTarget = ref<Item | null>(null);
const renameName = ref("");
const renameErrors = ref<FormErrors>(noErrors());
const renaming = ref(false);

function openRename(item: Item) {
  renameTarget.value = item;
  renameName.value = item.name;
  renameErrors.value = noErrors();
  renameDialog.value?.showModal();
}

async function rename() {
  renameErrors.value = noErrors();
  renaming.value = true;
  try {
    await TABS[tab.value].rename(renameTarget.value!, renameName.value.trim());
    renameDialog.value?.close();
    await reload();
    showToast("名前を変更しました");
  } catch (err) {
    renameErrors.value = toFormErrors(err, ["name"]);
  } finally {
    renaming.value = false;
  }
}

async function remove(item: Item) {
  if (!confirm(`「${item.name}」を削除しますか？\n${TABS[tab.value].deleteNote}`)) return;
  try {
    await TABS[tab.value].remove(item);
    await reload();
    showToast(`「${item.name}」を削除しました`);
  } catch (err) {
    toastError(err);
  }
}
</script>

<template>
  <main class="page page--narrow">
    <div class="page__head">
      <div>
        <h1 class="page__title">候補の管理</h1>
        <p class="page__lead">プロフィール登録で選べる役職・職種・スキルの候補です。従業員が新しい名前を入力した場合も、ここに自動で追加されます。</p>
      </div>
    </div>

    <div class="tabs" role="tablist">
      <button
        v-for="(label, key) in TAB_LABELS"
        :key="key"
        type="button"
        class="tabs__tab"
        role="tab"
        :aria-selected="tab === key"
        @click="selectTab(key)"
      >{{ label }}</button>
    </div>

    <section class="panel">
      <form class="inline-form" novalidate @submit.prevent="add">
        <select v-if="tab === 'skills'" v-model="addForm.category" class="field__input" name="category" aria-label="分類">
          <option v-for="c in SKILL_CATEGORIES" :key="c.value" :value="c.value">{{ c.label }}</option>
        </select>
        <input v-model="addForm.name" class="field__input" type="text" name="name" maxlength="50" placeholder="追加する名前" aria-label="追加する名前" required>
        <label v-if="tab === 'jobTypes'" class="checkbox">
          <input v-model="addForm.isEngineer" type="checkbox" name="is_engineer"> エンジニア
        </label>
        <button type="submit" class="button">追加</button>
      </form>
      <div v-if="addError" class="alert alert--error">{{ addError }}</div>

      <div v-if="tab === 'skills'" class="filter">
        <span>表示：</span>
        <select v-model="skillFilter" class="field__input" aria-label="表示する分類">
          <option value="">すべて</option>
          <option v-for="c in SKILL_CATEGORIES" :key="c.value" :value="c.value">{{ c.label }}</option>
        </select>
      </div>

      <ul id="item-list" class="item-list">
        <li v-if="data && items.length === 0" class="item-list__empty">登録されていません</li>
        <li v-for="item in items" :key="item.id" class="item-list__item">
          <span class="item-list__name">{{ item.name }}</span>
          <span v-if="tab === 'skills'" class="badge badge--muted">{{ CATEGORY_LABEL[(item as Skill).category] }}</span>
          <label v-if="tab === 'jobTypes'" class="checkbox">
            <input type="checkbox" :checked="(item as JobType).is_engineer" @change="toggleEngineer(item as JobType, $event)"> エンジニア
          </label>
          <span class="item-list__actions">
            <button type="button" class="button button--ghost button--small" @click="openRename(item)">名前変更</button>
            <button type="button" class="button button--ghost button--small button--danger-text" @click="remove(item)">削除</button>
          </span>
        </li>
      </ul>
    </section>
  </main>

  <dialog ref="renameDialog" class="dialog">
    <form class="form" novalidate @submit.prevent="rename">
      <h2 class="dialog__title">名前の変更</h2>
      <div v-if="renameErrors.form" class="alert alert--error">{{ renameErrors.form }}</div>
      <label class="field">
        <span class="field__label">名前</span>
        <input v-model="renameName" class="field__input" type="text" name="name" maxlength="50" required>
        <span class="field__error">{{ renameErrors.fields.name }}</span>
      </label>
      <div class="dialog__actions">
        <button type="button" class="button button--ghost" @click="renameDialog?.close()">キャンセル</button>
        <button type="submit" class="button" :disabled="renaming">変更する</button>
      </div>
    </form>
  </dialog>
</template>
