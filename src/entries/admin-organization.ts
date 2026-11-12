import { mountPage } from "@/lib/page";
import AdminOrganizationPage from "@/pages/AdminOrganizationPage.vue";

await mountPage(AdminOrganizationPage, { auth: { role: "master" } });
