import { AdminStripeCoupons } from "@/components/admin/stripe-coupons";
import { getAdminUserOrThrow } from "@/lib/auth-server";
import { db } from "@/lib/db";
import * as schema from "@terragon/shared/db/schema";
import { count, desc, eq } from "drizzle-orm";

export default async function AdminStripeCouponsPage() {
  await getAdminUserOrThrow();

  const [totalResult, recentCodes] = await Promise.all([
    db.select({ count: count() }).from(schema.userStripePromotionCode),
    db
      .select({
        id: schema.userStripePromotionCode.id,
        code: schema.userStripePromotionCode.code,
        stripeCouponId: schema.userStripePromotionCode.stripeCouponId,
        stripePromotionCodeId:
          schema.userStripePromotionCode.stripePromotionCodeId,
        createdAt: schema.userStripePromotionCode.createdAt,
        email: schema.user.email,
      })
      .from(schema.userStripePromotionCode)
      .innerJoin(
        schema.user,
        eq(schema.user.id, schema.userStripePromotionCode.userId),
      )
      .orderBy(desc(schema.userStripePromotionCode.createdAt))
      .limit(50),
  ]);

  const totalCodes = totalResult[0]?.count ?? 0;

  return (
    <AdminStripeCoupons
      totalCodes={totalCodes}
      recentCodes={recentCodes.map((record) => ({
        id: record.id,
        userEmail: record.email ?? "",
        code: record.code,
        stripeCouponId: record.stripeCouponId,
        stripePromotionCodeId: record.stripePromotionCodeId,
        createdAt: record.createdAt?.toISOString() ?? new Date().toISOString(),
      }))}
    />
  );
}
