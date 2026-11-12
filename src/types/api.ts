/** API の入出力の型（API のリポジトリの app/schemas と対応させる）。 */

export type Role = "master" | "general";
export type PresenceStatus = "not_working" | "present" | "away" | "remote";
export type SkillCategory = "language" | "framework" | "database" | "cloud";
export type FurnitureType = "desk" | "chair" | "wall" | "door" | "other";
export type Rotation = 0 | 90 | 180 | 270;

// ───────── ログイン・自分 ─────────

export interface OrganizationSummary {
  id: number;
  name: string;
}

/** GET /me */
export interface Me {
  id: number;
  email: string;
  role: Role;
  must_change_password: boolean;
  profile_completed: boolean;
  organization: OrganizationSummary;
}

// ───────── 組織 ─────────

/** GET /organization */
export interface Organization {
  id: number;
  name: string;
  created_at: string;
}

export interface SampleDataStatus {
  available: boolean;
}

// ───────── ユーザー管理 ─────────

export interface UserItem {
  id: number;
  email: string;
  role: Role;
  name: string | null;
  must_change_password: boolean;
  profile_completed: boolean;
  created_at: string;
}

export interface UserList {
  items: UserItem[];
  general_user_count: number;
  general_user_limit: number;
}

export interface ImportRow {
  line: number;
  email: string;
  initial_password: string | null;
  /** CSV に初期パスワードが書かれていたか（false なら自動生成） */
  password_provided: boolean;
  error: string | null;
}

export interface ImportResult {
  created: boolean;
  error: string | null;
  rows: ImportRow[];
}

// ───────── 候補（役職・職種・スキル） ─────────

export interface Position {
  id: number;
  name: string;
}

export interface JobType {
  id: number;
  name: string;
  is_engineer: boolean;
}

export interface Skill {
  id: number;
  category: SkillCategory;
  name: string;
}

// ───────── フロア・部屋・マップ ─────────

export interface Room {
  id: number;
  floor_id: number;
  name: string;
  width: number;
  height: number;
  sort_order: number;
}

export interface Floor {
  id: number;
  name: string;
  sort_order: number;
  rooms: Room[];
}

export interface Furniture {
  /** 新しく置いた家具は、保存するまで id がない */
  id?: number | null;
  type: FurnitureType;
  label: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: Rotation;
}

export interface Layout {
  room: Room;
  floor_name: string;
  furniture: Furniture[];
}

/** GET /rooms/{id}/occupancy */
export interface Occupant {
  seat_id: number;
  user_id: number;
  name: string | null;
  status: PresenceStatus;
  avatar_url: string | null;
  updated_at: string;
  is_stale: boolean;
}

// ───────── 在席 ─────────

export interface Seat {
  seat_id: number;
  label: string | null;
  room_id: number;
  room_name: string;
  floor_name: string;
}

export interface Presence {
  user_id: number;
  name: string | null;
  avatar_url: string | null;
  status: PresenceStatus;
  comment: string | null;
  seat: Seat | null;
  updated_at: string;
  /** 出勤中のまま、日本時間の今日になってから一度も更新していない */
  is_stale: boolean;
}

// ───────── プロフィール ─────────

export interface UserSkill {
  category: SkillCategory;
  name: string;
  years: number;
}

export interface MyProfile {
  user_id: number;
  name: string;
  birth_date: string;
  age: number;
  position: string | null;
  job_type: string | null;
  is_engineer: boolean;
  default_seat_id: number | null;
  default_seat: Seat | null;
  avatar_url: string | null;
  skills: UserSkill[];
}

export interface ProfileView {
  user_id: number;
  name: string;
  age: number;
  position: string | null;
  job_type: string | null;
  is_engineer: boolean;
  avatar_url: string | null;
  skills: UserSkill[];
  presence: { status: PresenceStatus; comment: string | null } | null;
}

// ───────── メンバー ─────────

export interface Person {
  user_id: number;
  name: string;
  avatar_url: string | null;
  position: string | null;
  job_type: string | null;
  status: PresenceStatus;
  comment: string | null;
  seat: Seat | null;
  skills: UserSkill[];
  updated_at: string;
  is_stale: boolean;
}

// ───────── エラー ─────────

/** エラーの応答 {"detail", "code", "errors"} の errors の1件 */
export interface FieldError {
  field: string;
  message: string;
}
