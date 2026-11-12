<script setup lang="ts">
/**
 * プロフィールの入力欄（初回設定とマイプロフィールで共通）。
 * 役職・職種は候補から選ぶか、新しい名前を入力できる（<datalist>）。
 * 入力内容は validate() で検証して受け取る。
 */
import { computed, reactive, ref, useId, useTemplateRef } from "vue";

import type { MasterData, ProfileInput } from "@/api";
import type { MyProfile } from "@/types/api";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp"];

const props = defineProps<{
  masterData: MasterData;
  profile: MyProfile | null;
  /** 画像の削除ボタンを出すか（マイプロフィールだけ） */
  allowAvatarDelete?: boolean;
  /** API から返った項目ごとのエラー */
  errors?: Record<string, string>;
}>();

export interface ProfileValues extends ProfileInput {
  avatarFile: File | null;
  deleteAvatar: boolean;
}

const id = useId();
const form = reactive({
  name: props.profile?.name ?? "",
  birthDate: props.profile?.birth_date ?? "",
  positionName: props.profile?.position ?? "",
  jobTypeName: props.profile?.job_type ?? "",
});

const fileInput = useTemplateRef<HTMLInputElement>("file");
const avatarFile = ref<File | null>(null);
const previewUrl = ref<string | null>(props.profile?.avatar_url ?? null);
const deleteAvatar = ref(false);
const avatarError = ref("");

function todayIso() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const today = todayIso();

function onFileChange() {
  const file = fileInput.value?.files?.[0] ?? null;
  avatarError.value = "";
  avatarFile.value = file;
  if (!file) {
    previewUrl.value = props.profile?.avatar_url ?? null;
    return;
  }
  deleteAvatar.value = false;
  previewUrl.value = URL.createObjectURL(file);
}

function removeAvatar() {
  deleteAvatar.value = true;
  previewUrl.value = null;
}

/** 職種がエンジニアかどうか（候補にない新しい名前はエンジニア以外として扱う） */
const isEngineer = computed(() => {
  const name = form.jobTypeName.trim().toLowerCase();
  return props.masterData.jobTypes.some((j) => j.is_engineer && j.name.toLowerCase() === name);
});

/** 入力内容を検証し、問題があればエラーを表示して null を返す */
function validate(): ProfileValues | null {
  const file = avatarFile.value;
  if (file && !AVATAR_TYPES.includes(file.type)) {
    avatarError.value = "PNG / JPEG / WebP の画像を選んでください";
    return null;
  }
  if (file && file.size > MAX_AVATAR_BYTES) {
    avatarError.value = "画像のサイズは2MBまでです";
    return null;
  }
  return {
    name: form.name.trim(),
    birthDate: form.birthDate,
    positionName: form.positionName.trim(),
    jobTypeName: form.jobTypeName.trim(),
    avatarFile: file,
    deleteAvatar: deleteAvatar.value,
  };
}

defineExpose({ validate, isEngineer });
</script>

<template>
  <div class="avatar-field">
    <img v-if="previewUrl" class="avatar avatar--lg" :src="previewUrl" alt="">
    <div v-else class="avatar avatar--lg avatar--placeholder">画像なし</div>
    <div class="field">
      <span class="field__label">プロフィール画像（任意）</span>
      <input ref="file" type="file" name="avatar" accept="image/png,image/jpeg,image/webp" @change="onFileChange">
      <span class="field__hint">PNG / JPEG / WebP、2MBまで</span>
      <span class="field__error">{{ avatarError }}</span>
      <button
        v-if="allowAvatarDelete && previewUrl && !avatarFile"
        type="button"
        class="button button--ghost button--small"
        @click="removeAvatar"
      >画像を削除</button>
    </div>
  </div>

  <label class="field">
    <span class="field__label">名前</span>
    <input v-model="form.name" class="field__input" type="text" name="name" maxlength="50" required>
    <span class="field__error">{{ errors?.name }}</span>
  </label>

  <label class="field">
    <span class="field__label">生年月日</span>
    <input v-model="form.birthDate" class="field__input" type="date" name="birth_date" min="1900-01-01" :max="today" required>
    <span class="field__hint">他の人には年齢だけが表示されます</span>
    <span class="field__error">{{ errors?.birth_date }}</span>
  </label>

  <div class="field-row">
    <label class="field">
      <span class="field__label">役職</span>
      <input
        v-model="form.positionName"
        class="field__input"
        type="text"
        name="position_name"
        maxlength="50"
        :list="`position-options-${id}`"
        placeholder="選択または入力"
      >
      <datalist :id="`position-options-${id}`">
        <option v-for="p in masterData.positions" :key="p.id" :value="p.name" />
      </datalist>
      <span class="field__error">{{ errors?.position_name }}</span>
    </label>
    <label class="field">
      <span class="field__label">職種</span>
      <input
        v-model="form.jobTypeName"
        class="field__input"
        type="text"
        name="job_type_name"
        maxlength="50"
        :list="`job-type-options-${id}`"
        placeholder="選択または入力"
      >
      <datalist :id="`job-type-options-${id}`">
        <option v-for="j in masterData.jobTypes" :key="j.id" :value="j.name" />
      </datalist>
      <span v-if="isEngineer" class="field__hint">エンジニアの職種です。技術スキルを登録できます。</span>
      <span class="field__error">{{ errors?.job_type_name }}</span>
    </label>
  </div>
</template>
