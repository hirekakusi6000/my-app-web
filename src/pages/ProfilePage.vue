<script setup lang="ts">
/** マイプロフィール（一般ユーザー）：プロフィール・デフォルト座席・技術スキル・パスワード */
import { onMounted, reactive, ref, useTemplateRef } from "vue";

import { authApi, type MasterData, masterDataApi, profileApi } from "@/api";
import ProfileFields from "@/components/ProfileFields.vue";
import SeatPickerDialog from "@/components/SeatPickerDialog.vue";
import SkillsEditor from "@/components/SkillsEditor.vue";
import { type FormErrors, noErrors, toFormErrors } from "@/lib/errors";
import { seatText } from "@/lib/map";
import { showToast, toastError } from "@/lib/toast";
import type { MyProfile } from "@/types/api";

const masterData = ref<MasterData | null>(null);
const profile = ref<MyProfile | null>(null);
/** 保存したら入力欄を作り直す（保存した内容と新しい候補を反映するため） */
const renderKey = ref(0);

async function reload() {
  [masterData.value, profile.value] = await Promise.all([masterDataApi.loadAll(), profileApi.getMine()]);
  renderKey.value++;
}
onMounted(reload);

// ───────── プロフィール ─────────

const profileFields = useTemplateRef<InstanceType<typeof ProfileFields>>("profileFields");
const profileErrors = ref<FormErrors>(noErrors());
const savingProfile = ref(false);

async function saveProfile() {
  const values = profileFields.value?.validate();
  if (!values || !profile.value) return;
  profileErrors.value = noErrors();
  savingProfile.value = true;
  try {
    await profileApi.save({ ...values, defaultSeatId: profile.value.default_seat_id });
    if (values.avatarFile) await profileApi.uploadAvatar(values.avatarFile);
    else if (values.deleteAvatar) await profileApi.deleteAvatar();
    // 新しい役職・職種が候補に追加されている可能性があるので読み直す
    await reload();
    showToast("プロフィールを保存しました");
  } catch (err) {
    profileErrors.value = toFormErrors(err, ["name", "birth_date", "position_name", "job_type_name"]);
  } finally {
    savingProfile.value = false;
  }
}

// ───────── デフォルト座席 ─────────

const picker = useTemplateRef<InstanceType<typeof SeatPickerDialog>>("picker");

async function pickSeat() {
  const p = profile.value;
  if (!p || !picker.value) return;
  const result = await picker.value.open({
    currentSeatId: p.default_seat_id,
    currentRoomId: p.default_seat?.room_id ?? null,
    title: "デフォルト座席を選ぶ",
  });
  if (!result) return;
  try {
    profile.value = await profileApi.save({
      name: p.name,
      birthDate: p.birth_date,
      positionName: p.position ?? "",
      jobTypeName: p.job_type ?? "",
      defaultSeatId: result.seatId,
    });
    showToast(result.seatId ? "デフォルト座席を設定しました" : "デフォルト座席の設定を外しました");
  } catch (err) {
    toastError(err);
  }
}

// ───────── 技術スキル ─────────

const skillsEditor = useTemplateRef<InstanceType<typeof SkillsEditor>>("skillsEditor");
const skillsError = ref("");
const savingSkills = ref(false);

async function saveSkills() {
  skillsError.value = "";
  let skills;
  try {
    skills = skillsEditor.value!.getValue();
  } catch (err) {
    skillsError.value = (err as Error).message;
    return;
  }
  savingSkills.value = true;
  try {
    await profileApi.saveSkills(skills);
    await reload();
    showToast("技術スキルを保存しました");
  } catch (err) {
    skillsError.value = toFormErrors(err).form;
  } finally {
    savingSkills.value = false;
  }
}

// ───────── パスワード ─────────

const passwords = reactive({ current: "", next: "", confirm: "" });
const passwordErrors = ref<FormErrors>(noErrors());
const savingPassword = ref(false);

async function changePassword() {
  passwordErrors.value = noErrors();
  if (passwords.next !== passwords.confirm) {
    passwordErrors.value.fields.new_password_confirm = "パスワードが一致しません";
    return;
  }
  savingPassword.value = true;
  try {
    await authApi.changePassword(passwords.current, passwords.next);
    Object.assign(passwords, { current: "", next: "", confirm: "" });
    showToast("パスワードを変更しました");
  } catch (err) {
    passwordErrors.value = toFormErrors(err, ["current_password", "new_password"]);
  } finally {
    savingPassword.value = false;
  }
}
</script>

<template>
  <main class="page page--narrow">
    <h1 class="page__title">マイプロフィール</h1>

    <template v-if="profile && masterData">
      <section class="panel">
        <h2 class="panel__title">プロフィール</h2>
        <form id="profile-form" class="form" novalidate @submit.prevent="saveProfile">
          <div v-if="profileErrors.form" class="alert alert--error">{{ profileErrors.form }}</div>
          <div class="form">
            <ProfileFields
              :key="renderKey"
              ref="profileFields"
              :master-data="masterData"
              :profile="profile"
              allow-avatar-delete
              :errors="profileErrors.fields"
            />
          </div>
          <div class="field">
            <span class="field__label">デフォルト座席</span>
            <div class="input-row input-row--center">
              <span id="default-seat">{{ seatText(profile.default_seat) }}</span>
              <button type="button" class="button button--ghost button--small" @click="pickSeat">座席を選ぶ</button>
            </div>
            <span class="field__hint">出社するときに、最初から選ばれた状態になる座席です。</span>
          </div>
          <div class="panel__actions">
            <button type="submit" class="button" :disabled="savingProfile">保存する</button>
          </div>
        </form>
      </section>

      <!-- 技術スキルの欄は、保存済みの職種がエンジニアの場合に表示する -->
      <section v-if="profile.is_engineer" class="panel">
        <h2 class="panel__title">技術スキル</h2>
        <form id="skills-form" class="form" novalidate @submit.prevent="saveSkills">
          <div v-if="skillsError" class="alert alert--error">{{ skillsError }}</div>
          <SkillsEditor :key="renderKey" ref="skillsEditor" :candidates="masterData.skills" :initial="profile.skills" />
          <div class="panel__actions">
            <button type="submit" class="button" :disabled="savingSkills">保存する</button>
          </div>
        </form>
      </section>
    </template>

    <section class="panel">
      <h2 class="panel__title">パスワードの変更</h2>
      <form id="password-form" class="form" novalidate @submit.prevent="changePassword">
        <div v-if="passwordErrors.form" class="alert alert--error">{{ passwordErrors.form }}</div>
        <label class="field">
          <span class="field__label">現在のパスワード</span>
          <input v-model="passwords.current" class="field__input" type="password" name="current_password" autocomplete="current-password" required>
          <span class="field__error">{{ passwordErrors.fields.current_password }}</span>
        </label>
        <div class="field-row">
          <label class="field">
            <span class="field__label">新しいパスワード</span>
            <input v-model="passwords.next" class="field__input" type="password" name="new_password" autocomplete="new-password" minlength="8" maxlength="128" required>
            <span class="field__error">{{ passwordErrors.fields.new_password }}</span>
          </label>
          <label class="field">
            <span class="field__label">新しいパスワード（確認）</span>
            <input v-model="passwords.confirm" class="field__input" type="password" name="new_password_confirm" autocomplete="new-password" required>
            <span class="field__error">{{ passwordErrors.fields.new_password_confirm }}</span>
          </label>
        </div>
        <div class="panel__actions">
          <button type="submit" class="button" :disabled="savingPassword">変更する</button>
        </div>
      </form>
    </section>
  </main>
  <SeatPickerDialog ref="picker" />
</template>
