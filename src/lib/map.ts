// 部屋のマップの共通の定義と計算（閲覧・編集・座席選択で使う）。
//
// 座標はグリッドの単位。家具の x, y は「床に占める範囲」の左上で、
// 向きが 90 度・270 度のときは幅と奥行きが入れ替わる（サーバー側の定義と同じ）。
import type { Furniture, FurnitureType, PresenceStatus } from "@/types/api";

/** 1マスの大きさ（px） */
export const CELL = 32;

export const FURNITURE_TYPES: Record<FurnitureType, { label: string; width: number; height: number }> = {
  desk: { label: "机", width: 4, height: 2 },
  chair: { label: "椅子", width: 1, height: 1 },
  wall: { label: "壁", width: 6, height: 1 },
  door: { label: "ドア", width: 2, height: 1 },
  other: { label: "その他", width: 2, height: 2 },
};

export const STATUS_LABELS: Record<PresenceStatus, string> = {
  present: "在席中",
  away: "離席中",
  remote: "リモート",
  not_working: "未出勤",
};

/** 「前日から更新なし」の説明（最終更新の日時つき） */
export function staleLabel(updatedAt: string): string {
  const when = new Date(updatedAt).toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `前日から更新なし（最終更新 ${when}）`;
}

/** 床に占める範囲の { w, h }（グリッド単位） */
export function footprint(item: Pick<Furniture, "width" | "height" | "rotation">): { w: number; h: number } {
  return item.rotation === 90 || item.rotation === 270
    ? { w: item.height, h: item.width }
    : { w: item.width, h: item.height };
}

/** 画面上の座標をグリッドの座標（小数）に変換する */
export function clientToGrid(svg: SVGSVGElement, clientX: number, clientY: number): { x: number; y: number } {
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const p = point.matrixTransform(svg.getScreenCTM()!.inverse());
  return { x: p.x / CELL, y: p.y / CELL };
}

/** 座席の位置（座席の中心、px） */
export function seatCenter(seat: Furniture): { cx: number; cy: number } {
  const { w, h } = footprint(seat);
  return { cx: (seat.x + w / 2) * CELL, cy: (seat.y + h / 2) * CELL };
}

/** 座席の場所の表示（例：1F / 執務室 / A-1） */
export function seatText(seat: { floor_name: string; room_name: string; label: string | null } | null): string {
  if (!seat) return "未設定";
  return `${seat.floor_name} / ${seat.room_name}${seat.label ? ` / ${seat.label}` : ""}`;
}
