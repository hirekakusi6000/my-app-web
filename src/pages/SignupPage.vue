<script setup lang="ts">
/** 新規登録（組織を作成し、登録した人がマスターになる） */
import { reactive, ref } from "vue";

import { authApi } from "@/api";
import { homePathFor } from "@/lib/auth";
import { type FormErrors, noErrors, toFormErrors } from "@/lib/errors";

const form = reactive({ organizationName: "", email: "", password: "", passwordConfirm: "" });
const errors = ref<FormErrors>(noErrors());
const sending = ref(false);

async function submit() {
  errors.value = noErrors();
  if (form.password !== form.passwordConfirm) {
    errors.value.fields.password_confirm = "パスワードが一致しません";
    return;
  }
  sending.value = true;
  try {
    const me = await authApi.signup(form.organizationName.trim(), form.email.trim(), form.password);
    window.location.replace(homePathFor(me));
  } catch (err) {
    errors.value = toFormErrors(err, ["organization_name", "email", "password"]);
    sending.value = false;
  }
}
</script>

<template>
  <main class="auth-page">
    <section class="card">
      <h1 class="card__title">新規登録</h1>
      <p class="card__lead">組織を作成し、あなたが管理者（マスター）になります。従業員のアカウントは登録後に作成できます。</p>

      <form id="signup-form" class="form" novalidate @submit.prevent="submit">
        <div v-if="errors.form" class="alert alert--error">{{ errors.form }}</div>
        <label class="field">
          <span class="field__label">組織名</span>
          <input v-model="form.organizationName" class="field__input" type="text" name="organization_name" maxlength="100" placeholder="例：株式会社サンプル" required>
          <span class="field__error">{{ errors.fields.organization_name }}</span>
        </label>
        <label class="field">
          <span class="field__label">メールアドレス</span>
          <input v-model="form.email" class="field__input" type="email" name="email" autocomplete="username" required>
          <span class="field__error">{{ errors.fields.email }}</span>
        </label>
        <label class="field">
          <span class="field__label">パスワード</span>
          <input v-model="form.password" class="field__input" type="password" name="password" autocomplete="new-password" minlength="8" maxlength="128" required>
          <span class="field__hint">8文字以上</span>
          <span class="field__error">{{ errors.fields.password }}</span>
        </label>
        <label class="field">
          <span class="field__label">パスワード（確認）</span>
          <input v-model="form.passwordConfirm" class="field__input" type="password" name="password_confirm" autocomplete="new-password" required>
          <span class="field__error">{{ errors.fields.password_confirm }}</span>
        </label>
        <button type="submit" class="button button--block" :disabled="sending">登録する</button>
      </form>

      <p class="card__footer">
        アカウントをお持ちの方は <a href="/login.html">ログイン</a>
      </p>
    </section>
  </main>
</template>
