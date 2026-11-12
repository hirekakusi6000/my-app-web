import { mountPage } from "@/lib/page";
import SignupPage from "@/pages/SignupPage.vue";

await mountPage(SignupPage, { auth: false });
