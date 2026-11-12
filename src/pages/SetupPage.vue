<script setup lang="ts">
/** 初回設定（一般ユーザー）：① パスワード変更 → ② プロフィール → ③ 技術スキル（エンジニアのみ）→ ④ デフォルト座席 */
import { onMounted, reactive, ref, useTemplateRef } from "vue";

import { authApi, type MasterData, masterDataApi, profileApi } from "@/api";
import ProfileFields from "@/components/ProfileFields.vue";
import SeatPickerDialog from "@/components/SeatPickerDialog.vue";
import SkillsEditor from "@/components/SkillsEditor.vue";
import { type FormErrors, noErrors, toFormErrors } from "@/lib/errors";
import { seatText } from "@/lib/map";
import { currentUser } from "@/lib/session";
import { showToast, toastError } from "@/lib/toast";
import type { MyProfile } from "@/types/api";

type Step = "password" | "profile" | "skills" | "seat";
const STEPS: { step: Step; label: string }[] = [
  { step: "password", label: "① パスワード変更" },
  { step: "profile", label: "② プロフィール" },
  { step: "skills", label: "③ 技術スキル" },
  { step: "seat", label: "④ デフォルト座席" },
];

const step = ref<Step | null>(null);
const stepIndex = (s: Step) => STEPS.findIndex((x) => x.step === s);
const errors = ref<FormErrors>(noErrors());
const sending = ref(false);

/** フォームの送信の共通処理（二重送信の防止とエラー表示） */
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

// ───────── ① パスワード変更 ─────────

const passwords = reactive({ current: "", next: "", confirm: "" });

function changePassword() {
  if (passwords.next !== passwords.confirm) {
    errors.value = { fields: { new_password_confirm: "パスワードが一致しません" }, form: "" };
    return;
  }
  return send(["current_password", "new_password"], async () => {
    await authApi.changePassword(passwords.current, passwords.next);
    await startProfileStep();
  });
}

// ───────── ② プロフィール ─────────

const masterData = ref<MasterData | null>(null);
const profile = ref<MyProfile | null>(null);
const profileFields = useTemplateRef<InstanceType<typeof ProfileFields>>("profileFields");

async function startProfileStep() {
  masterData.value = await masterDataApi.loadAll();
  step.value = "profile";
}

function saveProfile() {
  const values = profileFields.value?.validate();
  if (!values) return;
  return send(["name", "birth_date", "position_name", "job_type_name"], async () => {
    profile.value = await profileApi.save(values);
    if (values.avatarFile) {
      try {
        profile.value = await profileApi.uploadAvatar(values.avatarFile);
      } catch (err) {
        // 画像だけ失敗しても、プロフィールの登録は済んでいるので先に進める
        const message = err instanceof Error ? err.message : "";
        showToast(`画像を登録できませんでした（${message}）。マイプロフィールから再度登録できます`, "error");
      }
    }
    step.value = profile.value.is_engineer ? "skills" : "seat";
  });
}

// ───────── ③ 技術スキル ─────────

const skillsEditor = useTemplateRef<InstanceType<typeof SkillsEditor>>("skillsEditor");

function saveSkills() {
  let skills;
  try {
    skills = skillsEditor.value!.getValue();
  } catch (err) {
    errors.value = { fields: {}, form: (err as Error).message };
    return;
  }
  return send([], async () => {
    await profileApi.saveSkills(skills);
    step.value = "seat";
  });
}

// ───────── ④ デフォルト座席 ─────────

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
  } catch (err) {
    toastError(err);
  }
}

onMounted(async () => {
  if (currentUser().must_change_password) step.value = "password";
  else await startProfileStep();
});
</script>

<template>
  <main class="auth-page">
    <section class="card card--wide">
      <ol class="steps">
        <li
          v-for="s in STEPS"
          :key="s.step"
          :data-done="step && stepIndex(s.step) < stepIndex(step) ? '' : undefined"
          :aria-current="s.step === step ? 'step' : undefined"
        >{{ s.label }}</li>
      </ol>

      <!-- ① パスワード変更 -->
      <div v-if="step === 'password'">
        <h1 class="card__title">パスワードの変更</h1>
        <p class="card__lead">管理者から受け取った初期パスワードを、自分だけのパスワードに変更してください。</p>
        <form id="password-form" class="form" novalidate @submit.prevent="changePassword">
          <div v-if="errors.form" class="alert alert--error">{{ errors.form }}</div>
          <label class="field">
            <span class="field__label">現在のパスワード（初期パスワード）</span>
            <input v-model="passwords.current" class="field__input" type="password" name="current_password" autocomplete="current-password" required>
            <span class="field__error">{{ errors.fields.current_password }}</span>
          </label>
          <label class="field">
            <span class="field__label">新しいパスワード</span>
            <input v-model="passwords.next" class="field__input" type="password" name="new_password" autocomplete="new-password" minlength="8" maxlength="128" required>
            <span class="field__hint">8文字以上</span>
            <span class="field__error">{{ errors.fields.new_password }}</span>
          </label>
          <label class="field">
            <span class="field__label">新しいパスワード（確認）</span>
            <input v-model="passwords.confirm" class="field__input" type="password" name="new_password_confirm" autocomplete="new-password" required>
            <span class="field__error">{{ errors.fields.new_password_confirm }}</span>
          </label>
          <button type="submit" class="button button--block" :disabled="sending">変更して次へ</button>
        </form>
      </div>

      <!-- ② プロフィール -->
      <div v-else-if="step === 'profile' && masterData">
        <h1 class="card__title">プロフィールの登録</h1>
        <p class="card__lead">同じオフィスのメンバーに表示されます。</p>
        <form id="profile-form" class="form" novalidate @submit.prevent="saveProfile">
          <div v-if="errors.form" class="alert alert--error">{{ errors.form }}</div>
          <div class="form">
            <ProfileFields ref="profileFields" :master-data="masterData" :profile="null" :errors="errors.fields" />
          </div>
          <button type="submit" class="button button--block" :disabled="sending">登録して次へ</button>
        </form>
      </div>

      <!-- ③ 技術スキル -->
      <div v-else-if="step === 'skills' && masterData">
        <h1 class="card__title">技術スキルの登録</h1>
        <p class="card__lead">使ったことのある技術と経験年数を登録してください。あとからマイプロフィールで変更できます。</p>
        <form id="skills-form" class="form" novalidate @submit.prevent="saveSkills">
          <div v-if="errors.form" class="alert alert--error">{{ errors.form }}</div>
          <SkillsEditor ref="skillsEditor" :candidates="masterData.skills" :initial="[]" />
          <button type="submit" class="button button--block" :disabled="sending">登録して次へ</button>
        </form>
      </div>

      <!-- ④ デフォルト座席 -->
      <div v-else-if="step === 'seat'">
        <h1 class="card__title">デフォルト座席</h1>
        <p class="card__lead">よく座る座席を設定しておくと、出社するときに最初から選ばれた状態になります。</p>
        <div class="input-row input-row--center seat-step">
          <span>現在の設定：<strong id="seat-label">{{ seatText(profile?.default_seat ?? null) }}</strong></span>
          <button type="button" class="button button--ghost" @click="pickSeat">座席を選ぶ</button>
        </div>
        <p class="field__hint">あとからマイプロフィールで変更できます。設定しなくても始められます。</p>
        <a class="button button--block" href="/map.html">はじめる</a>
      </div>
    </section>
  </main>
  <SeatPickerDialog ref="picker" />
</template>
