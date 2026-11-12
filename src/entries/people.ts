import { mountPage } from "@/lib/page";
import PeoplePage from "@/pages/PeoplePage.vue";

await mountPage(PeoplePage, { auth: {} });
