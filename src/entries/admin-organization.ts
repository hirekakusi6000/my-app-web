import { mountPage } from "@/lib/page";
import AdminOrganization from "@/pages/AdminOrganization.vue";

await mountPage(AdminOrganization, { auth: { role: "master" } });
