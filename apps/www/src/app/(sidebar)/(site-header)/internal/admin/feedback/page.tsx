import { AdminFeedback } from "@/components/admin/feedback";
import { getFeedbackList } from "@/server-actions/admin/feedback";
import { getAdminUserOrThrow } from "@/lib/auth-server";

export default async function FeedbackPage() {
  await getAdminUserOrThrow();
  const feedbackList = await getFeedbackList();
  return <AdminFeedback feedbackList={feedbackList} />;
}
