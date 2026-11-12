<script setup lang="ts">
/** 共通ヘッダー（組織名・ナビゲーション・ログイン中のユーザー・ログアウト） */
import { authApi } from "@/api";
import { PATHS } from "@/lib/auth";
import { currentUser } from "@/lib/session";
import type { Role } from "@/types/api";

defineProps<{
  /** false でナビゲーションを表示しない（初回設定画面など） */
  nav: boolean;
}>();

const NAV: Record<Role, { href: string; label: string }[]> = {
  master: [
    { href: "/map.html", label: "マップ" },
    { href: "/people.html", label: "メンバー" },
    { href: "/admin/users.html", label: "ユーザー管理" },
    { href: "/admin/offices.html", label: "フロア・部屋" },
    { href: "/admin/map-editor.html", label: "マップ編集" },
    { href: "/admin/seats.html", label: "座席の管理" },
    { href: "/admin/master-data.html", label: "候補の管理" },
    { href: "/admin/organization.html", label: "組織の設定" },
  ],
  general: [
    { href: "/map.html", label: "マップ" },
    { href: "/people.html", label: "メンバー" },
    { href: "/profile.html", label: "プロフィール" },
  ],
};

const me = currentUser();
const here = window.location.pathname;

async function logout() {
  try {
    await authApi.logout();
  } finally {
    window.location.replace(PATHS.login);
  }
}
</script>

<template>
  <header class="app-header">
    <div class="app-header__brand">{{ me.organization.name }}</div>
    <nav class="app-header__nav">
      <template v-if="nav">
        <a
          v-for="item in NAV[me.role]"
          :key="item.href"
          :href="item.href"
          :aria-current="item.href === here ? 'page' : undefined"
        >{{ item.label }}</a>
      </template>
    </nav>
    <div class="app-header__user">
      <span class="app-header__email">{{ me.email }}</span>
      <button type="button" class="button button--ghost" @click="logout">ログアウト</button>
    </div>
  </header>
</template>
