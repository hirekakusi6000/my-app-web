<script setup lang="ts">
/** まだ何もない組織のマスターに、お試し用のサンプルデータの作成を案内する（作成できる場合だけ表示） */
import { onMounted, ref } from "vue";

import { organizationApi } from "@/api";
import { showToast, toastError } from "@/lib/toast";

const emit = defineEmits<{ created: [] }>();

const visible = ref(false);
const creating = ref(false);

onMounted(async () => {
  try {
    visible.value = (await organizationApi.sampleDataStatus()).available;
  } catch {
    // 表示できなくても画面の他の機能には影響させない
  }
});

async function create() {
  creating.value = true;
  try {
    await organizationApi.createSampleData();
    visible.value = false;
    showToast("サンプルデータを作成しました");
    emit("created");
  } catch (err) {
    toastError(err);
  } finally {
    creating.value = false;
  }
}
</script>

<template>
  <div v-if="visible" class="sample-banner">
    <div class="sample-banner__text">
      <strong>まずはサンプルで試してみませんか？</strong>
      <span>机と椅子を並べたオフィスマップと、プロフィール・スキル・在席状態を登録した従業員6人をまとめて作成します。</span>
    </div>
    <button type="button" class="button" :disabled="creating" @click="create">サンプルを作成</button>
  </div>
</template>
