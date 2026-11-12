import "@/styles/map.css";

import { mountPage } from "@/lib/page";
import ProfilePage from "@/pages/ProfilePage.vue";

await mountPage(ProfilePage, { auth: { role: "general" } });
