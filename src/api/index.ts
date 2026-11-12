// リソースごとの API 呼び出し。
import type {
  Floor,
  ImportResult,
  JobType,
  Layout,
  Me,
  MyProfile,
  Occupant,
  Organization,
  Person,
  Position,
  Presence,
  PresenceStatus,
  ProfileView,
  Room,
  SampleDataStatus,
  Skill,
  SkillCategory,
  Furniture,
  UserItem,
  UserList,
  UserSkill,
} from "@/types/api";

import { api } from "./client";

export { ApiError } from "./client";

export const authApi = {
  signup: (organizationName: string, email: string, password: string) =>
    api.post<Me>("/auth/signup", { organization_name: organizationName, email, password }),
  login: (email: string, password: string) => api.post<Me>("/auth/login", { email, password }),
  logout: () => api.post<null>("/auth/logout"),
  me: () => api.get<Me>("/me"),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.put<Me>("/me/password", { current_password: currentPassword, new_password: newPassword }),
};

export const organizationApi = {
  get: () => api.get<Organization>("/organization"),
  rename: (name: string) => api.patch<Organization>("/organization", { name }),
  remove: (password: string, confirmName: string) =>
    api.delete("/organization", { password, confirm_name: confirmName }),
  sampleDataStatus: () => api.get<SampleDataStatus>("/organization/sample-data"),
  createSampleData: () => api.post<SampleDataStatus>("/organization/sample-data"),
};

export const usersApi = {
  list: () => api.get<UserList>("/users"),
  create: (email: string, initialPassword: string) =>
    api.post<UserItem>("/users", { email, initial_password: initialPassword }),
  updateEmail: (id: number, email: string) => api.patch<UserItem>(`/users/${id}`, { email }),
  resetPassword: (id: number, newPassword: string) =>
    api.post<null>(`/users/${id}/password-reset`, { new_password: newPassword }),
  remove: (id: number) => api.delete(`/users/${id}`),
  /** CSV で一括登録する。dryRun=true なら確認だけ行う */
  importCsv: (file: File, { dryRun }: { dryRun: boolean }) => {
    const body = new FormData();
    body.append("file", file);
    return api.post<ImportResult>(`/users/import?dry_run=${dryRun}`, body);
  },
};

export const SKILL_CATEGORIES: { value: SkillCategory; label: string }[] = [
  { value: "language", label: "プログラミング言語" },
  { value: "framework", label: "フレームワーク" },
  { value: "database", label: "データベース" },
  { value: "cloud", label: "クラウド" },
];

export interface MasterData {
  positions: Position[];
  jobTypes: JobType[];
  skills: Skill[];
}

export const masterDataApi = {
  async loadAll(): Promise<MasterData> {
    const [positions, jobTypes, skills] = await Promise.all([
      api.get<Position[]>("/positions"),
      api.get<JobType[]>("/job-types"),
      api.get<Skill[]>("/skills"),
    ]);
    return { positions, jobTypes, skills };
  },
  createPosition: (name: string) => api.post<Position>("/positions", { name }),
  renamePosition: (id: number, name: string) => api.patch<Position>(`/positions/${id}`, { name }),
  deletePosition: (id: number) => api.delete(`/positions/${id}`),
  createJobType: (name: string, isEngineer: boolean) =>
    api.post<JobType>("/job-types", { name, is_engineer: isEngineer }),
  updateJobType: (id: number, name: string, isEngineer: boolean) =>
    api.patch<JobType>(`/job-types/${id}`, { name, is_engineer: isEngineer }),
  deleteJobType: (id: number) => api.delete(`/job-types/${id}`),
  createSkill: (category: SkillCategory, name: string) =>
    api.post<Skill>("/skills", { category, name }),
  renameSkill: (id: number, name: string) => api.patch<Skill>(`/skills/${id}`, { name }),
  deleteSkill: (id: number) => api.delete(`/skills/${id}`),
};

export const officesApi = {
  listFloors: () => api.get<Floor[]>("/floors"),
  createFloor: (name: string) => api.post<Floor>("/floors", { name }),
  updateFloor: (id: number, fields: { name?: string; sort_order?: number }) =>
    api.patch<Floor>(`/floors/${id}`, fields),
  deleteFloor: (id: number) => api.delete(`/floors/${id}`),
  createRoom: (floorId: number, room: { name: string; width: number; height: number }) =>
    api.post<Room>(`/floors/${floorId}/rooms`, room),
  updateRoom: (
    id: number,
    fields: { name?: string; width?: number; height?: number; sort_order?: number },
  ) => api.patch<Room>(`/rooms/${id}`, fields),
  deleteRoom: (id: number) => api.delete(`/rooms/${id}`),
  getLayout: (roomId: number) => api.get<Layout>(`/rooms/${roomId}/layout`),
  saveLayout: (roomId: number, furniture: Furniture[]) =>
    api.put<Layout>(`/rooms/${roomId}/layout`, { furniture }),
  getOccupancy: (roomId: number) => api.get<Occupant[]>(`/rooms/${roomId}/occupancy`),
};

export const presenceApi = {
  getMine: () => api.get<Presence>("/me/presence"),
  /** comment を省略するとコメントは変わらない */
  update(
    status: PresenceStatus,
    { seatId = null, comment }: { seatId?: number | null; comment?: string | null } = {},
  ) {
    const body: Record<string, unknown> = { status, seat_id: seatId };
    if (comment !== undefined) body.comment = comment;
    return api.put<Presence>("/me/presence", body);
  },
  list: () => api.get<Presence[]>("/presence"),
  releaseSeat: (seatId: number) => api.delete(`/seats/${seatId}/occupant`),
  resetStale: () => api.post<{ count: number }>("/presence/reset-stale"),
};

export interface ProfileInput {
  name: string;
  birthDate: string;
  positionName: string;
  jobTypeName: string;
  defaultSeatId?: number | null;
}

export const profileApi = {
  getMine: () => api.get<MyProfile>("/me/profile"),
  save: ({ name, birthDate, positionName, jobTypeName, defaultSeatId = null }: ProfileInput) =>
    api.put<MyProfile>("/me/profile", {
      name,
      birth_date: birthDate,
      position_name: positionName || null,
      job_type_name: jobTypeName || null,
      default_seat_id: defaultSeatId,
    }),
  saveSkills: (skills: UserSkill[]) => api.put<MyProfile>("/me/skills", { skills }),
  uploadAvatar: (file: File) => {
    const body = new FormData();
    body.append("file", file);
    return api.put<MyProfile>("/me/avatar", body);
  },
  deleteAvatar: () => api.delete<MyProfile>("/me/avatar"),
  get: (userId: number) => api.get<ProfileView>(`/profiles/${userId}`),
};

export interface PeopleQuery {
  name?: string;
  skills?: string[];
  minYears?: number;
  statuses?: PresenceStatus[];
}

export const peopleApi = {
  search({ name = "", skills = [], minYears = 0, statuses = [] }: PeopleQuery = {}) {
    const params = new URLSearchParams();
    if (name.trim()) params.set("q", name.trim());
    for (const s of skills) params.append("skill", s);
    if (minYears > 0) params.set("min_years", String(minYears));
    for (const s of statuses) params.append("status", s);
    const query = params.toString();
    return api.get<Person[]>(`/people${query ? `?${query}` : ""}`);
  },
};
