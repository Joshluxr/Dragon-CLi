"use client";

import { useState, useTransition } from "react";
import { format } from "date-fns";
import { usePageBreadcrumbs } from "@/hooks/usePageBreadcrumbs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  generateStripeCouponsForUsers,
  type GenerateCouponsResult,
} from "@/server-actions/admin/stripe-coupons";

interface ExistingCoupon {
  id: string;
  userEmail: string;
  code: string;
  stripeCouponId: string;
  stripePromotionCodeId: string;
  createdAt: string;
}

interface AdminStripeCouponsProps {
  totalCodes: number;
  recentCodes: ExistingCoupon[];
}

export function AdminStripeCoupons({
  totalCodes,
  recentCodes,
}: AdminStripeCouponsProps) {
  usePageBreadcrumbs([
    { label: "Admin", href: "/internal/admin" },
    { label: "Stripe Coupons" },
  ]);

  const [beforeDate, setBeforeDate] = useState("");
  const [result, setResult] = useState<GenerateCouponsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [codes, setCodes] = useState<ExistingCoupon[]>(recentCodes);
  const [totalCount, setTotalCount] = useState(totalCodes);

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    if (!beforeDate) {
      setError("Select a cutoff date before generating coupons.");
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const response = await generateStripeCouponsForUsers({
          beforeDate,
        });
        setResult(response);
        if (response.created > 0) {
          setTotalCount((count) => count + response.created);
        }
        if (response.promotionCodes.length > 0) {
          const newEntries: ExistingCoupon[] = response.promotionCodes.map(
            (record) => ({
              id: record.id,
              userEmail: record.email,
              code: record.code,
              stripeCouponId: record.stripeCouponId,
              stripePromotionCodeId: record.stripePromotionCodeId,
              createdAt: record.createdAt,
            }),
          );
          setCodes((existing) => {
            const combined = [...newEntries, ...existing];
            const unique: ExistingCoupon[] = [];
            const seen = new Set<string>();
            for (const entry of combined) {
              if (seen.has(entry.id)) continue;
              seen.add(entry.id);
              unique.push(entry);
              if (unique.length >= 50) break;
            }
            return unique;
          });
        }
      } catch (err) {
        setResult(null);
        setError(
          err instanceof Error
            ? err.message
            : "Failed to generate coupons. Please try again.",
        );
      }
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Create Stripe coupons</CardTitle>
          <CardDescription>
            Generate one-time promotion codes that give eligible users two free
            billing cycles on Stripe. Users created before the selected date
            (inclusive) will receive a unique code if they do not already have
            one stored.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4 max-w-md"
            onSubmit={handleSubmit}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="beforeDate">Eligible user cutoff date</Label>
              <Input
                id="beforeDate"
                type="date"
                value={beforeDate}
                onChange={(event) => setBeforeDate(event.target.value)}
                disabled={isPending}
                required
              />
              <p className="text-sm text-muted-foreground">
                Users created before the start of the next day after this date
                will receive a promotion code. Existing codes are not
                duplicated.
              </p>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {result ? (
              <div className="space-y-1 text-sm">
                <p className="font-medium text-foreground">
                  Created {result.created} new code
                  {result.created === 1 ? "" : "s"}
                  {result.skipped > 0
                    ? ` and skipped ${result.skipped} existing user${
                        result.skipped === 1 ? "" : "s"
                      }`
                    : ""}
                  .
                </p>
                {result.couponId ? (
                  <p className="text-muted-foreground">
                    Stripe coupon ID: {result.couponId}
                  </p>
                ) : null}
              </div>
            ) : null}
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating coupons…" : "Create coupons"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stored promotion codes</CardTitle>
          <CardDescription>
            {totalCount} code{totalCount === 1 ? "" : "s"} saved in the
            database.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {codes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No Stripe promotion codes have been generated yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User email</TableHead>
                    <TableHead>Coupon ID</TableHead>
                    <TableHead>Promotion code</TableHead>
                    <TableHead>Stored at</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {codes.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-medium">
                        {entry.userEmail}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {entry.stripeCouponId}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {entry.code}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {format(new Date(entry.createdAt), "yyyy-MM-dd HH:mm")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
