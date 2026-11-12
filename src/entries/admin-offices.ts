import { mountPage } from "@/lib/page";
import AdminOfficesPage from "@/pages/AdminOfficesPage.vue";

await mountPage(AdminOfficesPage, { auth: { role: "master" } });
