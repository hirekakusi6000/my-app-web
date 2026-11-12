<script setup lang="ts">
/** ユーザー管理（マスター）：従業員のアカウントの作成・メール変更・パスワードリセット・削除、CSV での一括登録 */
import { onMounted, reactive, ref, useTemplateRef } from "vue";

import { usersApi } from "@/api";
import CsvImportDialog from "@/components/CsvImportDialog.vue";
import SampleDataBanner from "@/components/SampleDataBanner.vue";
import { type FormErrors, noErrors, toFormErrors } from "@/lib/errors";
import { generatePassword } from "@/lib/password";
import { showToast } from "@/lib/toast";
import type { UserItem, UserList } from "@/types/api";

const list = ref<UserList | null>(null);

async function reload() {
  list.value = await usersApi.list();
}
onMounted(reload);

const formatDate = (iso: string) => new Date(iso).toLocaleDateString("ja-JP");

function statusLabel(user: UserItem) {
  if (user.role === "master") return { text: "管理者", cls: "badge--muted" };
  if (user.must_change_password) return { text: "初回ログイン待ち", cls: "badge--warn" };
  if (!user.profile_completed) return { text: "プロフィール未登録", cls: "badge--warn" };
  return { text: "利用中", cls: "badge--ok" };
}

const targetLabel = (u: UserItem) => (u.name ? `${u.name}（${u.email}）` : u.email);

// ───────── ダイアログ ─────────

type DialogName = "create" | "edit" | "reset" | "delete" | "credential";
const dialogs: Record<DialogName, ReturnType<typeof useTemplateRef<HTMLDialogElement>>> = {
  create: useTemplateRef("createDialog"),
  edit: useTemplateRef("editDialog"),
  reset: useTemplateRef("resetDialog"),
  delete: useTemplateRef("deleteDialog"),
  credential: useTemplateRef("credentialDialog"),
};
const importDialog = useTemplateRef<InstanceType<typeof CsvImportDialog>>("importDialog");

/** 操作対象のユーザー（編集・リセット・削除のダイアログで使う） */
const target = ref<UserItem | null>(null);
const form = reactive({ email: "", password: "" });
const errors = ref<FormErrors>(noErrors());
const sending = ref(false);
const credential = reactive({ title: "", email: "", password: "" });

function open(name: DialogName, user: UserItem | null = null) {
  target.value = user;
  errors.value = noErrors();
  form.email = name === "edit" && user ? user.email : "";
  form.password = name === "create" || name === "reset" ? generatePassword() : "";
  dialogs[name].value?.showModal();
}

function close(name: DialogName) {
  dialogs[name].value?.close();
}

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

function showCredential(title: string, email: string, password: string) {
  Object.assign(credential, { title, email, password });
  dialogs.credential.value?.showModal();
}

async function copyCredential() {
  try {
    await navigator.clipboard.writeText(`メールアドレス: ${credential.email}\n初期パスワード: ${credential.password}`);
    showToast("コピーしました");
  } catch {
    showToast("コピーできませんでした。手動で控えてください", "error");
  }
}

// ───────── 作成・メール変更・パスワードリセット・削除 ─────────

const create = () =>
  send(["email", "initial_password"], async () => {
    const password = form.password;
    const user = await usersApi.create(form.email.trim(), password);
    close("create");
    await reload();
    showCredential("ユーザーを作成しました", user.email, password);
  });

const updateEmail = () =>
  send(["email"], async () => {
    await usersApi.updateEmail(target.value!.id, form.email.trim());
    close("edit");
    await reload();
    showToast("メールアドレスを変更しました");
  });

const resetPassword = () =>
  send(["new_password"], async () => {
    const user = target.value!;
    const password = form.password;
    await usersApi.resetPassword(user.id, password);
    close("reset");
    await reload();
    showCredential("パスワードをリセットしました", user.email, password);
  });

const remove = () =>
  send([], async () => {
    await usersApi.remove(target.value!.id);
    close("delete");
    await reload();
    showToast("ユーザーを削除しました");
  });
</script>

<template>
  <main class="page">
    <div class="page__head">
      <div>
        <h1 class="page__title">ユーザー管理</h1>
        <p class="page__lead">
          従業員のアカウントを作成・管理します。
          <span v-if="list">（一般ユーザー {{ list.general_user_count }} / {{ list.general_user_limit }} 名）</span>
        </p>
      </div>
      <div class="page__head-actions">
        <button type="button" class="button button--ghost" @click="importDialog?.open()">CSV で一括登録</button>
        <button
          type="button"
          class="button"
          :disabled="!list || list.general_user_count >= list.general_user_limit"
          @click="open('create')"
        >＋ ユーザーを作成</button>
      </div>
    </div>

    <!-- 何もない組織には、お試し用のサンプルデータを案内する -->
    <SampleDataBanner @created="reload" />

    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>名前</th>
            <th>メールアドレス</th>
            <th>権限</th>
            <th>状態</th>
            <th>作成日</th>
            <th class="table__actions">操作</th>
          </tr>
        </thead>
        <tbody id="user-rows">
          <tr v-if="!list"><td colspan="6" class="table__empty">読み込み中...</td></tr>
          <tr v-for="user in list?.items ?? []" :key="user.id">
            <td :class="{ table__muted: !user.name }">{{ user.name ?? "—" }}</td>
            <td>{{ user.email }}</td>
            <td>{{ user.role === "master" ? "マスター" : "一般" }}</td>
            <td><span :class="['badge', statusLabel(user).cls]">{{ statusLabel(user).text }}</span></td>
            <td>{{ formatDate(user.created_at) }}</td>
            <td class="table__actions">
              <template v-if="user.role === 'general'">
                <button type="button" class="button button--ghost button--small" @click="open('edit', user)">メール変更</button>
                <button type="button" class="button button--ghost button--small" @click="open('reset', user)">パスワードリセット</button>
                <button type="button" class="button button--ghost button--small button--danger-text" @click="open('delete', user)">削除</button>
              </template>
              <span v-else class="table__muted">（あなた）</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </main>

  <!-- ユーザー作成 -->
  <dialog ref="createDialog" class="dialog">
    <form class="form" novalidate @submit.prevent="create">
      <h2 class="dialog__title">ユーザーを作成</h2>
      <div v-if="errors.form" class="alert alert--error">{{ errors.form }}</div>
      <label class="field">
        <span class="field__label">メールアドレス</span>
        <input v-model="form.email" class="field__input" type="email" name="email" required>
        <span class="field__error">{{ errors.fields.email }}</span>
      </label>
      <div class="field">
        <span class="field__label">初期パスワード</span>
        <div class="input-row">
          <input v-model="form.password" class="field__input" type="text" name="initial_password" minlength="8" maxlength="128" autocomplete="off" aria-label="初期パスワード" required>
          <button type="button" class="button button--ghost" @click="form.password = generatePassword()">自動生成</button>
        </div>
        <span class="field__hint">8文字以上。本人は初回ログイン時に変更します。</span>
        <span class="field__error">{{ errors.fields.initial_password }}</span>
      </div>
      <div class="dialog__actions">
        <button type="button" class="button button--ghost" @click="close('create')">キャンセル</button>
        <button type="submit" class="button" :disabled="sending">作成する</button>
      </div>
    </form>
  </dialog>

  <!-- メールアドレスの変更 -->
  <dialog ref="editDialog" class="dialog">
    <form class="form" novalidate @submit.prevent="updateEmail">
      <h2 class="dialog__title">メールアドレスの変更</h2>
      <div v-if="errors.form" class="alert alert--error">{{ errors.form }}</div>
      <label class="field">
        <span class="field__label">メールアドレス</span>
        <input v-model="form.email" class="field__input" type="email" name="email" required>
        <span class="field__error">{{ errors.fields.email }}</span>
      </label>
      <div class="dialog__actions">
        <button type="button" class="button button--ghost" @click="close('edit')">キャンセル</button>
        <button type="submit" class="button" :disabled="sending">変更する</button>
      </div>
    </form>
  </dialog>

  <!-- パスワードのリセット -->
  <dialog ref="resetDialog" class="dialog">
    <form class="form" novalidate @submit.prevent="resetPassword">
      <h2 class="dialog__title">パスワードのリセット</h2>
      <p class="dialog__text">
        <strong>{{ target ? targetLabel(target) : "" }}</strong> のパスワードを再設定します。本人は次回ログイン時に変更が必要になり、ログイン中の端末はログアウトされます。
      </p>
      <div v-if="errors.form" class="alert alert--error">{{ errors.form }}</div>
      <div class="field">
        <span class="field__label">新しい初期パスワード</span>
        <div class="input-row">
          <input v-model="form.password" class="field__input" type="text" name="new_password" minlength="8" maxlength="128" autocomplete="off" aria-label="新しい初期パスワード" required>
          <button type="button" class="button button--ghost" @click="form.password = generatePassword()">自動生成</button>
        </div>
        <span class="field__error">{{ errors.fields.new_password }}</span>
      </div>
      <div class="dialog__actions">
        <button type="button" class="button button--ghost" @click="close('reset')">キャンセル</button>
        <button type="submit" class="button" :disabled="sending">リセットする</button>
      </div>
    </form>
  </dialog>

  <!-- 削除の確認 -->
  <dialog ref="deleteDialog" class="dialog">
    <form class="form" novalidate @submit.prevent="remove">
      <h2 class="dialog__title">ユーザーの削除</h2>
      <p class="dialog__text">
        <strong>{{ target ? targetLabel(target) : "" }}</strong> を削除します。プロフィール・スキル・在席状態も完全に削除され、<strong>元に戻せません</strong>。
      </p>
      <div v-if="errors.form" class="alert alert--error">{{ errors.form }}</div>
      <div class="dialog__actions">
        <button type="button" class="button button--ghost" @click="close('delete')">キャンセル</button>
        <button type="submit" class="button button--danger" :disabled="sending">削除する</button>
      </div>
    </form>
  </dialog>

  <!-- 作成・リセット後に初期パスワードを伝える -->
  <dialog ref="credentialDialog" class="dialog">
    <div class="form">
      <h2 class="dialog__title">{{ credential.title }}</h2>
      <p class="dialog__text">次の内容を本人に伝えてください。初期パスワードはこの画面を閉じると再表示できません。</p>
      <dl class="credential">
        <dt>メールアドレス</dt><dd>{{ credential.email }}</dd>
        <dt>初期パスワード</dt><dd><code>{{ credential.password }}</code></dd>
      </dl>
      <div class="dialog__actions">
        <button type="button" class="button button--ghost" @click="copyCredential">コピー</button>
        <button type="button" class="button" @click="close('credential')">閉じる</button>
      </div>
    </div>
  </dialog>

  <CsvImportDialog ref="importDialog" @imported="reload" />
</template>
