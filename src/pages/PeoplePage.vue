<script setup lang="ts">
/** メンバー：名前・技術スキル・在席状態で、同じ組織のメンバーを探す */
import { computed, onMounted, reactive, ref, useTemplateRef, watch } from "vue";

import { masterDataApi, peopleApi } from "@/api";
import ProfilePopup from "@/components/ProfilePopup.vue";
import { STATUS_LABELS, seatText, staleLabel } from "@/lib/map";
import { showToast, toastError } from "@/lib/toast";
import type { Person, PresenceStatus } from "@/types/api";

const MAX_SKILLS = 5;
const STATUS_OPTIONS: PresenceStatus[] = ["present", "away", "remote", "not_working"];

const popup = useTemplateRef<InstanceType<typeof ProfilePopup>>("popup");
const query = reactive({
  name: "",
  /** 検索条件に入れたスキル名 */
  skills: [] as string[],
  minYears: 0,
  statuses: [] as PresenceStatus[],
});
const skillInput = ref("");
const candidates = ref<string[]>([]);
const people = ref<Person[] | null>(null);
/** 検索したときの条件のスキル（結果の中で目立たせる） */
const wanted = ref(new Set<string>());

// ───────── 条件 ─────────

function addSkill() {
  const name = skillInput.value.trim();
  skillInput.value = "";
  if (!name) return;
  if (query.skills.some((s) => s.toLowerCase() === name.toLowerCase())) return;
  if (query.skills.length >= MAX_SKILLS) {
    showToast(`スキルは${MAX_SKILLS}つまで指定できます`, "error");
    return;
  }
  query.skills.push(name);
}

function removeSkill(name: string) {
  query.skills = query.skills.filter((s) => s !== name);
}

/** 候補の一覧から選んだときもすぐに追加する */
function onSkillChange() {
  if (candidates.value.includes(skillInput.value.trim())) addSkill();
}

// ───────── 検索 ─────────

let latestRequest = 0;
async function search() {
  const requestId = ++latestRequest;
  const skills = [...query.skills];
  try {
    const result = await peopleApi.search({ ...query, skills });
    if (requestId !== latestRequest) return; // 古い検索の結果は捨てる
    people.value = result;
    wanted.value = new Set(skills.map((s) => s.toLowerCase()));
  } catch (err) {
    toastError(err);
  }
}

// 名前は入力が止まってから、それ以外の条件はすぐに検索する
let typingTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => query.name,
  () => {
    clearTimeout(typingTimer);
    typingTimer = setTimeout(search, 300);
  },
);
watch(() => [query.skills.length, ...query.skills, query.minYears, ...query.statuses], search);

const meta = (p: Person) => [p.position, p.job_type].filter(Boolean).join(" ・ ");
const count = computed(() => (people.value ? `${people.value.length}人` : ""));

onMounted(async () => {
  masterDataApi
    .loadAll()
    .then((d) => (candidates.value = [...new Set(d.skills.map((s) => s.name))]))
    .catch(() => {});
  await search();
});
</script>

<template>
  <main class="page">
    <div class="page__head">
      <div>
        <h1 class="page__title">メンバー</h1>
        <p class="page__lead">名前・技術スキル・在席状態で、同じ組織のメンバーを探せます。</p>
      </div>
    </div>

    <section class="panel search-panel">
      <form class="search-form" novalidate @submit.prevent>
        <label class="field">
          <span class="field__label">名前</span>
          <input v-model="query.name" class="field__input" type="search" name="name" maxlength="50" placeholder="名前の一部">
        </label>

        <div class="field">
          <span class="field__label">スキル（すべてを持つ人）</span>
          <div class="input-row">
            <input
              v-model="skillInput"
              class="field__input"
              type="text"
              maxlength="50"
              list="skill-options"
              placeholder="例：Python"
              aria-label="スキル"
              @keydown.enter.prevent="addSkill"
              @change="onSkillChange"
            >
            <datalist id="skill-options">
              <option v-for="name in candidates" :key="name" :value="name" />
            </datalist>
            <button type="button" class="button button--ghost" @click="addSkill">追加</button>
          </div>
          <div class="chips">
            <span v-for="name in query.skills" :key="name" class="chip chip--removable">
              {{ name }}
              <button type="button" :aria-label="`${name} を条件から外す`" @click="removeSkill(name)">×</button>
            </span>
          </div>
        </div>

        <label class="field">
          <span class="field__label">経験年数</span>
          <select v-model.number="query.minYears" class="field__input" name="min_years">
            <option :value="0">指定なし</option>
            <option :value="1">1年以上</option>
            <option :value="3">3年以上</option>
            <option :value="5">5年以上</option>
            <option :value="10">10年以上</option>
          </select>
        </label>

        <fieldset class="field status-filter">
          <legend class="field__label">在席状態</legend>
          <label v-for="s in STATUS_OPTIONS" :key="s" class="checkbox">
            <input v-model="query.statuses" type="checkbox" name="status" :value="s"> {{ STATUS_LABELS[s] }}
          </label>
        </fieldset>
      </form>
    </section>

    <p class="result-count">{{ count }}</p>
    <div class="people-grid">
      <p v-if="people && !people.length" class="empty-state">条件に合うメンバーはいません</p>
      <article v-for="p in people ?? []" :key="p.user_id" class="person-card">
        <button type="button" class="person-card__head" @click="popup?.open(p.user_id)">
          <img v-if="p.avatar_url" class="avatar avatar--md" :src="p.avatar_url" alt="">
          <span v-else class="avatar avatar--md avatar--placeholder">{{ p.name.charAt(0) }}</span>
          <span class="person-card__who">
            <strong>{{ p.name }}</strong>
            <span class="person-card__meta">{{ meta(p) }}</span>
          </span>
        </button>
        <div class="person-card__status">
          <span :class="['status-badge', `status-badge--${p.status}`]">{{ STATUS_LABELS[p.status] }}</span>
          <span v-if="p.is_stale" class="stale-tag" :title="staleLabel(p.updated_at)">前日から</span>
          <a
            v-if="p.seat"
            class="person-card__seat"
            :href="`/map.html?room=${p.seat.room_id}&seat=${p.seat.seat_id}`"
          >{{ seatText(p.seat) }}（マップで見る）</a>
        </div>
        <p v-if="p.comment" class="person-card__comment">💬 {{ p.comment }}</p>
        <div v-if="p.skills.length" class="chips">
          <!-- 検索条件のスキルは目立たせる -->
          <span
            v-for="s in p.skills"
            :key="`${s.category}:${s.name}`"
            :class="['chip', { 'chip--matched': wanted.has(s.name.toLowerCase()) }]"
          >{{ s.name }} {{ s.years }}年</span>
        </div>
      </article>
    </div>
  </main>
  <ProfilePopup ref="popup" />
</template>
