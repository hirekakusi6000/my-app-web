import "@/styles/map.css";

import { mountPage } from "@/lib/page";
import AdminMapEditorPage from "@/pages/AdminMapEditorPage.vue";

await mountPage(AdminMapEditorPage, { auth: { role: "master" } });
