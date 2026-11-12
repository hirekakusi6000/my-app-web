import { mountPage } from "@/lib/page";
import AdminMasterDataPage from "@/pages/AdminMasterDataPage.vue";

await mountPage(AdminMasterDataPage, { auth: { role: "master" } });
