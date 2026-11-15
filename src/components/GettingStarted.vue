<script setup lang="ts">
/**
 * 新しく組織を作った管理者向けの「はじめにすること」。
 * 使い始めるまでの手順を、終わったかどうかと一緒に表示する。すべて終わったら表示しない。
 * 「閉じる」を押すと、このブラウザでは表示しない（終わっていない手順があっても）。
 */
import { computed, onMounted, ref, watch } from "vue";

import { officesApi } from "@/api";
import { currentUser } from "@/lib/session";
import type { UserList } from "@/types/api";

const props = defineProps<{
  /** ユーザーの一覧（ユーザー管理の画面で読み込んだもの。作成・削除すると変わる） */
  users: UserList | null;
}>();
const emit = defineEmits<{ "create-user": [] }>();

const HIDDEN_KEY = `getting-started:hidden:${currentUser().organization.id}`;

const loaded = ref(false);
const hasRoom = ref(false);
const hasChair = ref(false);
const hidden = ref(false);

try {
  hidden.value = localStorage.getItem(HIDDEN_KEY) === "1";
} catch {
  // 保存できない環境では、毎回表示する
}

/** フロア・部屋と、椅子（座席）があるかを調べる */
async function refreshOffice() {
  try {
    const rooms = (await officesApi.listFloors()).flatMap((f) => f.rooms);
    hasRoom.value = rooms.length > 0;
    hasChair.value = false;
    for (const room of rooms) {
      const layout = await officesApi.getLayout(room.id);
      if (layout.furniture.some((f) => f.type === "chair")) {
        hasChair.value = true;
        break;
      }
    }
  } catch {
    // 調べられなくても、画面の他の機能には影響させない
  } finally {
    loaded.value = true;
  }
}
onMounted(refreshOffice);
// サンプルを作成したときなど、ユーザーの一覧が変わったら部屋と椅子も調べ直す
watch(
  () => props.users?.general_user_count,
  () => refreshOffice(),
);

const generalUsers = computed(() => props.users?.items.filter((u) => u.role === "general") ?? []);

const steps = computed(() => [
  {
    title: "フロアと部屋を作る",
    text: "オフィスのフロア（例：1F）と、その中の部屋（例：執務室）を作ります。",
    done: hasRoom.value,
    link: { href: "/admin/offices.html", label: "フロア・部屋へ" },
  },
  {
    title: "マップに机と椅子を置く",
    text: "部屋に机・椅子・壁などを配置します。椅子が座席になり、従業員は椅子を選んで出社します。",
    done: hasChair.value,
    link: { href: "/admin/map-editor.html", label: "マップ編集へ" },
  },
  {
    title: "従業員のアカウントを作る",
    text: "メールアドレスと初期パスワードで作成し、本人に伝えます。CSV でまとめて登録もできます。",
    done: generalUsers.value.length > 0,
    action: { label: "＋ ユーザーを作成", run: () => emit("create-user") },
  },
  {
    title: "従業員が初回ログインする",
    text: "本人がログインすると、パスワードの変更とプロフィールの登録を案内されます。終わると、この一覧の状態が「利用中」になります。",
    done: generalUsers.value.some((u) => u.profile_completed),
  },
]);

const doneCount = computed(() => steps.value.filter((s) => s.done).length);
const visible = computed(() => loaded.value && props.users !== null && !hidden.value && doneCount.value < steps.value.length);

function hide() {
  hidden.value = true;
  try {
    localStorage.setItem(HIDDEN_KEY, "1");
  } catch {
    // 保存できなくても、今は閉じる
  }
}
</script>

<template>
  <section v-if="visible" class="panel getting-started" aria-labelledby="getting-started-title">
    <div class="panel__head">
      <h2 id="getting-started-title" class="panel__title">
        はじめにすること <span class="getting-started__count">{{ doneCount }} / {{ steps.length }} 完了</span>
      </h2>
      <button type="button" class="button button--ghost button--small" @click="hide">閉じる</button>
    </div>
    <p class="field__hint">
      次の順に準備すると、従業員がマップで出社・在席を登録できるようになります。
      <!-- サンプルは、まだ何もない組織でだけ作れる -->
      <template v-if="doneCount === 0">まずは下の「サンプルを作成」で試すこともできます。</template>
    </p>
    <ol class="getting-started__steps">
      <li v-for="(s, i) in steps" :key="s.title" :class="['getting-started__step', { 'getting-started__step--done': s.done }]">
        <span class="getting-started__mark" :aria-label="s.done ? '完了' : '未完了'">{{ s.done ? "✓" : i + 1 }}</span>
        <div class="getting-started__body">
          <strong>{{ s.title }}</strong>
          <span class="getting-started__text">{{ s.text }}</span>
        </div>
        <a v-if="s.link && !s.done" class="button button--small" :href="s.link.href">{{ s.link.label }}</a>
        <button v-else-if="s.action && !s.done" type="button" class="button button--small" @click="s.action.run()">{{ s.action.label }}</button>
      </li>
    </ol>
  </section>
</template>
