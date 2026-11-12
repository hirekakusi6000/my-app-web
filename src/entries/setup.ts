import "@/styles/map.css";

import { mountPage } from "@/lib/page";
import SetupPage from "@/pages/SetupPage.vue";

await mountPage(SetupPage, { auth: { role: "general", setupPage: true }, nav: false });
