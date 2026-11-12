import "@/styles/map.css";

import { mountPage } from "@/lib/page";
import MapPage from "@/pages/MapPage.vue";

await mountPage(MapPage, { auth: {} });
