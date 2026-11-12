import { mountPage } from "@/lib/page";
import AdminUsersPage from "@/pages/AdminUsersPage.vue";

await mountPage(AdminUsersPage, { auth: { role: "master" } });
