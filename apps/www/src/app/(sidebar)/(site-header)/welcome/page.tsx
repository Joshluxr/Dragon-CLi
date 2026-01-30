import { Onboarding } from "@/components/onboarding";
import { getUserInfoOrNull } from "@/lib/auth-server";
import { redirect } from "next/navigation";

export default async function WelcomePage() {
  const userInfo = await getUserInfoOrNull();
  if (!userInfo) {
    redirect(`/login?returnUrl=${encodeURIComponent("/welcome")}`);
  }
  if (userInfo.userFlags.hasSeenOnboarding) {
    redirect("/dashboard");
  }
  return <Onboarding />;
}
