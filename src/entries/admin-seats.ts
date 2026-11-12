import { mountPage } from "@/lib/page";
import AdminSeatsPage from "@/pages/AdminSeatsPage.vue";

await mountPage(AdminSeatsPage, { auth: { role: "master" } });
