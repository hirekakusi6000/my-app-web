// 画面右上に一時的に表示するお知らせ。
let container: HTMLDivElement | undefined;

function ensureContainer(): HTMLDivElement {
  if (!container) {
    container = document.createElement("div");
    container.className = "toast-container";
    container.setAttribute("role", "status");
    container.setAttribute("aria-live", "polite");
    document.body.append(container);
  }
  return container;
}

export function showToast(message: string, type: "success" | "error" = "success"): void {
  const el = document.createElement("div");
  el.className = `toast toast--${type}`;
  el.textContent = message;
  ensureContainer().append(el);
  setTimeout(() => el.remove(), 4000);
}

/** API などのエラーをお知らせで表示する */
export function toastError(err: unknown): void {
  showToast(err instanceof Error ? err.message : "通信に失敗しました", "error");
}
