/** 主な利用の流れを、本物のブラウザで最初から最後まで操作して確認する。 */
import { MASTER_EMAIL, MASTER_PASSWORD, expect, login, test } from "./fixtures";

const CELL = 32; // マップの1マスの大きさ（px）

// ───────── マスター ─────────

test("マスターが新規登録してサンプルを作成する", async ({ page }) => {
  await page.goto("/signup.html");
  await page.getByLabel("組織名").fill("テスト株式会社");
  await page.getByLabel("メールアドレス").fill(MASTER_EMAIL);
  await page.locator('[name="password"]').fill(MASTER_PASSWORD);
  await page.locator('[name="password_confirm"]').fill(MASTER_PASSWORD);
  await page.getByRole("button", { name: "登録する" }).click();

  // 新規登録するとユーザー管理画面に移り、サンプルの案内が出る
  await expect(page).toHaveURL(/\/admin\/users\.html$/);
  await expect(page.locator(".app-header__brand")).toHaveText("テスト株式会社");
  await page.getByRole("button", { name: "サンプルを作成" }).click();
  await expect(page.locator("#user-rows tr")).toHaveCount(7); // マスター＋サンプルの6人

  // マップには在席中・離席中の4人が表示される
  await page.getByRole("link", { name: "マップ", exact: true }).click();
  await expect(page.locator(".occupant")).toHaveCount(4);
  await page.getByRole("button", { name: "山田 太郎（在席中）" }).click();
  const popup = page.locator(".profile-popup");
  await expect(popup.locator("[data-name]")).toHaveText("山田 太郎");
  await expect(popup).toContainText("Python 10年");
});

test("CSP の制限の下でも、すべての画面がエラーなく表示される", async ({ page, withSample: _ }) => {
  await login(page, MASTER_EMAIL, MASTER_PASSWORD);
  const checks: Record<string, string> = {
    "/map.html": ".occupant",
    "/people.html": ".person-card",
    "/admin/users.html": "#user-rows tr",
    "/admin/offices.html": "#floors .panel",
    "/admin/map-editor.html": ".furniture",
    "/admin/seats.html": "#rows tr",
    "/admin/master-data.html": "#item-list li",
    "/admin/organization.html": "#rename-form",
  };
  for (const [path, selector] of Object.entries(checks)) {
    await page.goto(path);
    await expect(page.locator(selector).first()).toBeVisible();
  }
});

test("CSV でユーザーを一括登録する", async ({ page, api: _ }) => {
  await login(page, MASTER_EMAIL, MASTER_PASSWORD);
  await page.getByRole("button", { name: "CSV で一括登録" }).click();
  const csv = "メールアドレス,初期パスワード\r\ntaro@example.com,\r\nhanako@example.com,hanako-pass-1\r\n";
  await page.locator("#import-dialog [data-file]").setInputFiles({
    name: "users.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf-8"),
  });
  const dialog = page.locator("#import-dialog");
  await expect(dialog.locator("[data-summary]")).toContainText("2人を登録できます");
  await dialog.getByRole("button", { name: "登録する" }).click();
  await expect(dialog.locator("[data-summary]")).toContainText("2人を登録しました");
  await expect(dialog.getByRole("button", { name: "結果を CSV で保存" })).toBeVisible();
  await expect(page.locator("#user-rows tr")).toHaveCount(3);
});

test("組織名を変更すると、ヘッダーの組織名も変わる（Vue の画面）", async ({ page, api: _ }) => {
  await login(page, MASTER_EMAIL, MASTER_PASSWORD);
  await page.goto("/admin/organization.html");
  const name = page.locator('#rename-form [name="name"]');
  await expect(name).toHaveValue("テスト株式会社");
  await name.fill("新しい組織");
  await page.getByRole("button", { name: "保存する" }).click();
  await expect(page.locator(".app-header__brand")).toHaveText("新しい組織");

  // 削除のボタンは、組織名とパスワードを入力するまで押せない
  await page.getByRole("button", { name: "組織を削除する" }).click();
  const submit = page.getByRole("button", { name: "完全に削除する" });
  await expect(submit).toBeDisabled();
  await page.locator('[name="confirm_name"]').fill("新しい組織");
  await page.locator('#delete-form [name="password"]').fill(MASTER_PASSWORD);
  await expect(submit).toBeEnabled();
});

// ───────── 従業員 ─────────

async function firstLogin(
  page: import("@playwright/test").Page,
  email: string,
  initialPassword: string,
  name: string,
  jobType?: string,
) {
  await login(page, email, initialPassword);
  await expect(page).toHaveURL(/\/setup\.html$/);
  await page.getByLabel("現在のパスワード（初期パスワード）").fill(initialPassword);
  await page.locator('[name="new_password"]').fill("my-new-pass-1");
  await page.locator('[name="new_password_confirm"]').fill("my-new-pass-1");
  await page.getByRole("button", { name: "変更して次へ" }).click();

  await page.getByLabel("名前").fill(name);
  await page.getByLabel("生年月日").fill("1998-05-10");
  if (jobType) await page.getByLabel("職種").fill(jobType);
  await page.getByRole("button", { name: "登録して次へ" }).click();
  await page.getByRole("link", { name: "はじめる" }).click();
  await expect(page).toHaveURL(/\/map\.html$/);
}

test("従業員が初回ログインして、出社・離席・退勤する", async ({ page, withSample }) => {
  await withSample.post("/users", { email: "newcomer@example.com", initial_password: "initial-pass-1" });

  // 初回ログイン → パスワード変更 → プロフィール登録 → デフォルト座席（後で）→ マップ
  await firstLogin(page, "newcomer@example.com", "initial-pass-1", "新人 花子", "営業");
  await expect(page.locator("#my-badge")).toHaveText("未出勤");

  // 出社：空いている椅子 A-3 を選んで出社する
  await page.getByRole("button", { name: "出社", exact: true }).click();
  await page.locator(".furniture--chair", { hasText: "A-3" }).click();
  await page.getByRole("button", { name: "この座席で出社" }).click();
  await expect(page.locator("#my-badge")).toHaveText("在席中");
  await expect(page.locator("#my-seat")).toContainText("A-3");
  await expect(page.locator(".occupant")).toHaveCount(5);

  // 離席 → 在席に戻る → 退勤
  await page.getByRole("button", { name: "離席", exact: true }).click();
  await expect(page.locator("#my-badge")).toHaveText("離席中");
  await page.getByRole("button", { name: "在席に戻る", exact: true }).click();
  await expect(page.locator("#my-badge")).toHaveText("在席中");
  await page.getByRole("button", { name: "退勤", exact: true }).click();
  await expect(page.locator("#my-badge")).toHaveText("未出勤");
  await expect(page.locator(".occupant")).toHaveCount(4);
});

test("使用中の座席では出社できない", async ({ page, withSample }) => {
  await withSample.post("/users", { email: "u@example.com", initial_password: "initial-1" });
  await firstLogin(page, "u@example.com", "initial-1", "新人");

  // 山田さんが座っている A-1 は選べない
  await page.getByRole("button", { name: "出社", exact: true }).click();
  await page.locator(".furniture--chair", { hasText: "A-1" }).click({ force: true });
  await expect(page.locator(".toast--error")).toHaveText("この座席は使用中です");
  await expect(page.getByRole("button", { name: "この座席で出社" })).toBeDisabled();
});

// ───────── マップ編集・メンバー検索 ─────────

test("マップ編集：範囲選択・複製・元に戻す・保存", async ({ page, withSample }) => {
  await login(page, MASTER_EMAIL, MASTER_PASSWORD);
  await page.goto("/admin/map-editor.html");
  const furniture = page.locator(".furniture");
  await expect(furniture).toHaveCount(18);

  // 何もない所からドラッグして、机の島A（机1＋椅子6）を範囲選択する
  const box = (await page.locator(".room-map").boundingBox())!;
  await page.mouse.move(box.x + 1.2 * CELL, box.y + 2.5 * CELL);
  await page.mouse.down();
  await page.mouse.move(box.x + 8.6 * CELL, box.y + 7.4 * CELL, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator(".furniture--selected")).toHaveCount(7);
  await expect(page.locator("#props [data-type]")).toHaveText("7個を選択中");

  // 複製 → 元に戻す → やり直す
  await page.keyboard.press("Control+d");
  await expect(furniture).toHaveCount(25);
  await page.keyboard.press("Control+z");
  await expect(furniture).toHaveCount(18);
  await page.keyboard.press("Control+y");
  await expect(furniture).toHaveCount(25);

  // 保存すると、サーバーにも25個が保存される
  await page.getByRole("button", { name: "保存する" }).click();
  await expect(page.locator("#status")).toHaveText("保存済み");
  const floors = await withSample.get("/floors");
  const layout = await withSample.get(`/rooms/${floors[0].rooms[0].id}/layout`);
  expect(layout.furniture).toHaveLength(25);
});

test("スキルでメンバーを探し、マップで場所を表示する", async ({ page, withSample: _ }) => {
  await login(page, MASTER_EMAIL, MASTER_PASSWORD);
  await page.goto("/people.html");
  await expect(page.locator(".person-card")).toHaveCount(6);

  const skill = page.getByPlaceholder("例：Python");
  await skill.fill("python");
  await skill.press("Enter");
  const cards = page.locator(".person-card");
  await expect(cards).toHaveCount(2);
  await expect(cards.locator(".chip--matched")).toHaveCount(2);

  await cards.filter({ hasText: "山田 太郎" }).getByRole("link").click();
  await expect(page).toHaveURL(/\/map\.html\?room=\d+&seat=\d+$/);
  await expect(page.locator(".occupant--focus")).toHaveCount(1);
});
