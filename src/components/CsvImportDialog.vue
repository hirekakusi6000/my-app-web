<script setup lang="ts">
/**
 * ユーザーの CSV 一括登録ダイアログ。
 * ファイルを選ぶ → サーバーで内容を確認（dry_run）→ 問題がなければ登録 → 初期パスワードの一覧を保存、の順に進む。
 */
import { computed, ref, useTemplateRef } from "vue";

import { usersApi } from "@/api";
import { showToast, toastError } from "@/lib/toast";
import type { ImportResult, ImportRow } from "@/types/api";

const emit = defineEmits<{ imported: [] }>();

const TEMPLATE = "メールアドレス,初期パスワード\r\ntaro@example.com,\r\nhanako@example.com,\r\n";

const dialog = useTemplateRef<HTMLDialogElement>("dialog");
const fileInput = useTemplateRef<HTMLInputElement>("file");
const file = ref<File | null>(null);
const result = ref<ImportResult | null>(null);
const summary = ref("");
const canImport = ref(false);
const importing = ref(false);
/** 登録した人（初期パスワード付き） */
const created = ref<ImportRow[]>([]);
const showPasswords = computed(() => created.value.length > 0);

/** 文字列を CSV ファイルとして保存させる（Excel で文字化けしないよう BOM を付ける） */
function downloadCsv(filename: string, text: string) {
  const blob = new Blob(["﻿", text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvEscape(value: string | null): string {
  const s = String(value ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function reset() {
  file.value = null;
  result.value = null;
  created.value = [];
  canImport.value = false;
  summary.value = "";
  if (fileInput.value) fileInput.value.value = "";
}

function open() {
  reset();
  dialog.value?.showModal();
}

async function onFileChange() {
  file.value = fileInput.value?.files?.[0] ?? null;
  if (!file.value) return;
  try {
    const r = await usersApi.importCsv(file.value, { dryRun: true });
    const errors = r.rows.filter((row) => row.error).length;
    canImport.value = !r.error && errors === 0;
    summary.value = canImport.value
      ? `${r.rows.length}人を登録できます。内容を確認して「登録する」を押してください。`
      : `エラーがあるため登録できません（エラー ${errors} 行）。CSV を直してから、もう一度選んでください。`;
    result.value = r;
  } catch (err) {
    // ファイル全体の問題（文字コード・見出しなど）
    toastError(err);
    reset();
  }
}

async function runImport() {
  if (!file.value) return;
  importing.value = true;
  try {
    const r = await usersApi.importCsv(file.value, { dryRun: false });
    result.value = r;
    if (!r.created) {
      // 確認した後に状況が変わった場合（他の人が同じメールアドレスを登録したなど）
      summary.value = "状況が変わったため登録できませんでした。内容を確認してください。";
      canImport.value = false;
      return;
    }
    created.value = r.rows;
    summary.value = `${r.rows.length}人を登録しました。初期パスワードはこの画面を閉じると再表示できないため、「結果を CSV で保存」してから本人に伝えてください。`;
    showToast(`${r.rows.length}人を登録しました`);
    emit("imported");
  } catch (err) {
    toastError(err);
  } finally {
    importing.value = false;
  }
}

function download() {
  const lines = [
    "メールアドレス,初期パスワード",
    ...created.value.map((r) => `${csvEscape(r.email)},${csvEscape(r.initial_password)}`),
  ];
  downloadCsv("初期パスワード一覧.csv", `${lines.join("\r\n")}\r\n`);
}

function close() {
  if (created.value.length && !confirm("初期パスワードの一覧を保存しましたか？\n閉じると再表示できません。")) return;
  dialog.value?.close();
}

function passwordCell(r: ImportRow) {
  if (showPasswords.value) return r.initial_password ?? "";
  return r.password_provided ? "（CSV の値）" : "（自動で作成）";
}

defineExpose({ open });
</script>

<template>
  <dialog id="import-dialog" ref="dialog" class="dialog dialog--wide" @cancel.prevent="close">
    <div class="form">
      <h2 class="dialog__title">CSV で一括登録</h2>

      <div v-show="!result">
        <p class="dialog__text">1行目に見出し、2行目から1人1行で書いた CSV ファイルを選んでください。初期パスワードが空欄の人には自動で作成します。</p>
        <pre class="csv-example">メールアドレス,初期パスワード
taro@example.com,
hanako@example.com,hanako-pass-1</pre>
        <p class="field__hint">
          Excel で保存した CSV（Shift_JIS）も読み込めます。一度に50人まで。
          <a href="#" @click.prevent="downloadCsv('ユーザー一括登録のひな形.csv', TEMPLATE)">ひな形をダウンロード</a>
        </p>
        <input ref="file" type="file" accept=".csv,text/csv" data-file aria-label="CSV ファイル" @change="onFileChange">
      </div>

      <div v-if="result">
        <p class="dialog__text" data-summary>{{ summary }}</p>
        <div v-if="result.error" class="alert alert--error">{{ result.error }}</div>
        <div class="table-wrap table-wrap--scroll">
          <table class="table">
            <thead><tr><th>行</th><th>メールアドレス</th><th>初期パスワード</th><th>確認結果</th></tr></thead>
            <tbody>
              <tr v-for="r in result.rows" :key="r.line">
                <td>{{ r.line }}</td>
                <td>{{ r.email || "（空欄）" }}</td>
                <td :class="{ mono: showPasswords }">{{ passwordCell(r) }}</td>
                <td :class="r.error ? 'text-danger' : 'text-ok'">{{ r.error ?? (showPasswords ? "登録しました" : "OK") }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="dialog__actions">
        <button type="button" class="button button--ghost" @click="close">閉じる</button>
        <button v-if="created.length" type="button" class="button button--ghost" @click="download">結果を CSV で保存</button>
        <button
          v-else-if="result"
          type="button"
          class="button"
          :disabled="!canImport || importing"
          @click="runImport"
        >登録する</button>
      </div>
    </div>
  </dialog>
</template>
