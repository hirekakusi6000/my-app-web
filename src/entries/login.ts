import { mountPage } from "@/lib/page";
import LoginPage from "@/pages/LoginPage.vue";

await mountPage(LoginPage, { auth: false });
