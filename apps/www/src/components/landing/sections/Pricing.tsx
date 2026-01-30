"use client";

import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  SUBSCRIPTION_PLAN_CONFIG,
  type SubscriptionPlanConfig,
} from "@/lib/subscription-plan-config";

type PricingPlan = SubscriptionPlanConfig & {
  cta: React.ReactNode;
};

const CORE_PLAN: PricingPlan = {
  ...SUBSCRIPTION_PLAN_CONFIG.core,
  cta: (
    <Button asChild className="w-full" size="lg">
      <Link href="/login">Start a 14-day free trial</Link>
    </Button>
  ),
};

const PRO_PLAN = {
  ...SUBSCRIPTION_PLAN_CONFIG.pro,
  cta: (
    <Button asChild className="w-full" size="lg">
      <Link href="/login">Start a 14-day free trial</Link>
    </Button>
  ),
};

const ENTERPRISE_PLAN: PricingPlan = {
  ...SUBSCRIPTION_PLAN_CONFIG.enterprise,
  cta: (
    <Button asChild variant="outline" className="w-full" size="lg">
      <Link
        href="mailto:enterprise@terragonlabs.com?subject=[Terragon]%20Enterprise%20Plan%20Request"
        target="_blank"
      >
        Contact Us
      </Link>
    </Button>
  ),
};

const getPricingPlans = () => {
  return [CORE_PLAN, PRO_PLAN, ENTERPRISE_PLAN];
};

export function Pricing() {
  const pricingPlans = getPricingPlans();
  const gridClassName =
    "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto";

  return (
    <section
      id="pricing"
      className="container mx-auto px-4 max-w-7xl pt-24 pb-8"
    >
      <div className="text-center mb-12 md:mb-16">
        <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
          Pricing
        </h2>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
          Choose the plan that's right for you
        </p>
      </div>

      <div className={gridClassName}>
        {pricingPlans.map((plan) => (
          <div
            key={plan.name}
            className={`relative rounded-2xl border ${
              plan.badge
                ? "border-primary shadow-lg shadow-primary/10"
                : "border-border"
            } bg-card p-8 flex flex-col`}
          >
            {plan.badge && (
              <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                <span className="bg-primary text-primary-foreground px-4 py-1 rounded-full text-sm font-medium">
                  {plan.badge}
                </span>
              </div>
            )}

            <div className="mb-6">
              <h3 className="text-2xl font-bold text-foreground mb-2">
                {plan.name}
              </h3>
              <p className="text-muted-foreground text-sm mb-4">
                {plan.description}
              </p>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold text-foreground">
                  {plan.price}
                </span>
                {plan.period && (
                  <span className="text-muted-foreground text-sm">
                    /{plan.period}
                  </span>
                )}
              </div>
            </div>

            <ul className="space-y-3 mb-8 flex-1">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <span className="text-foreground text-sm">{feature}</span>
                </li>
              ))}
            </ul>
            {plan.cta}
          </div>
        ))}
      </div>
    </section>
  );
}
