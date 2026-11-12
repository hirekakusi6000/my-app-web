<script setup lang="ts">
/** ログイン */
import { reactive, ref } from "vue";

import { authApi } from "@/api";
import { homePathFor } from "@/lib/auth";
import { type FormErrors, noErrors, toFormErrors } from "@/lib/errors";

const form = reactive({ email: "", password: "" });
const errors = ref<FormErrors>(noErrors());
const sending = ref(false);

async function submit() {
  errors.value = noErrors();
  sending.value = true;
  try {
    const me = await authApi.login(form.email.trim(), form.password);
    window.location.replace(homePathFor(me));
  } catch (err) {
    errors.value = toFormErrors(err, ["email", "password"]);
    sending.value = false;
  }
}
</script>

<template>
  <main class="auth-page">
    <section class="card">
      <h1 class="card__title">ログイン</h1>
      <p class="card__lead">オフィス座席・従業員管理</p>

      <form id="login-form" class="form" novalidate @submit.prevent="submit">
        <div v-if="errors.form" class="alert alert--error">{{ errors.form }}</div>
        <label class="field">
          <span class="field__label">メールアドレス</span>
          <input v-model="form.email" class="field__input" type="email" name="email" autocomplete="username" required>
          <span class="field__error">{{ errors.fields.email }}</span>
        </label>
        <label class="field">
          <span class="field__label">パスワード</span>
          <input v-model="form.password" class="field__input" type="password" name="password" autocomplete="current-password" required>
          <span class="field__error">{{ errors.fields.password }}</span>
        </label>
        <button type="submit" class="button button--block" :disabled="sending">ログイン</button>
      </form>

      <p class="card__footer">
        はじめて使う管理者の方は <a href="/signup.html">新規登録</a>
      </p>
    </section>
  </main>
</template>
