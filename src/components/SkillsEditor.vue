<script setup lang="ts">
/**
 * 技術スキルの入力欄。分類ごとに「スキル名＋経験年数」の行を追加・削除できる。
 * 入力内容は getValue() で受け取る（不正な値があればメッセージ付きの例外を投げる）。
 */
import { nextTick, reactive, useId } from "vue";

import { SKILL_CATEGORIES } from "@/api";
import type { Skill, SkillCategory, UserSkill } from "@/types/api";

const props = defineProps<{
  /** スキルの候補（GET /skills） */
  candidates: Skill[];
  /** 登録済みのスキル */
  initial: UserSkill[];
}>();

interface Row {
  key: number;
  name: string;
  years: number | string;
}

const id = useId();
let nextKey = 0;
const rows = reactive(
  Object.fromEntries(SKILL_CATEGORIES.map(({ value }) => [value, [] as Row[]])) as Record<SkillCategory, Row[]>,
);
for (const s of props.initial) rows[s.category].push({ key: nextKey++, name: s.name, years: s.years });

async function addRow(category: SkillCategory) {
  const key = nextKey++;
  rows[category].push({ key, name: "", years: 1 });
  await nextTick();
  document.getElementById(`skill-${id}-${key}`)?.focus();
}

function removeRow(category: SkillCategory, key: number) {
  rows[category] = rows[category].filter((r) => r.key !== key);
}

function getValue(): UserSkill[] {
  const result: UserSkill[] = [];
  const seen = new Set<string>();
  for (const { value: category } of SKILL_CATEGORIES) {
    for (const row of rows[category]) {
      const name = row.name.trim();
      if (!name) continue; // 空の行は無視する
      const years = Number(row.years);
      if (row.years === "" || !Number.isInteger(years) || years < 0 || years > 50) {
        throw new Error(`「${name}」の経験年数は0〜50の整数で入力してください`);
      }
      const key = `${category}:${name.toLowerCase()}`;
      if (seen.has(key)) throw new Error(`「${name}」が重複しています`);
      seen.add(key);
      result.push({ category, name, years });
    }
  }
  return result;
}

defineExpose({ getValue });
</script>

<template>
  <div class="skills-editor">
    <fieldset v-for="c in SKILL_CATEGORIES" :key="c.value" class="skills-editor__group">
      <legend>{{ c.label }}</legend>
      <datalist :id="`skill-options-${id}-${c.value}`">
        <option v-for="s in candidates.filter((x) => x.category === c.value)" :key="s.id" :value="s.name" />
      </datalist>
      <div class="skills-editor__rows">
        <div v-for="row in rows[c.value]" :key="row.key" class="skills-editor__row">
          <input
            :id="`skill-${id}-${row.key}`"
            v-model="row.name"
            class="field__input"
            type="text"
            maxlength="50"
            placeholder="スキル名"
            :list="`skill-options-${id}-${c.value}`"
            :aria-label="`${c.label}のスキル名`"
          >
          <input
            v-model="row.years"
            class="field__input skills-editor__years"
            type="number"
            min="0"
            max="50"
            :aria-label="`${row.name || 'スキル'}の経験年数`"
          >
          <span>年</span>
          <button type="button" class="button button--ghost button--small" @click="removeRow(c.value, row.key)">削除</button>
        </div>
      </div>
      <button type="button" class="button button--ghost button--small" @click="addRow(c.value)">＋ 追加</button>
    </fieldset>
  </div>
</template>
