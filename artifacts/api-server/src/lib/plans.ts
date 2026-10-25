export const PLAN_OPTIONS = [
  {
    id: "free",
    name: "Free Forever",
    monthlyPriceNgn: 0,
    generationLimit: 10,
    brandLimit: 1,
    featureFlags: {
      calendar: "basic",
      export: "basic",
    },
    calendarDescription: "Basic content calendar",
    exportDescription: "Basic content export",
    availableForUpgrade: false,
    features: [
      "₦0/month",
      "10 successful AI generations per UTC calendar month",
      "Maximum 1 brand profile",
      "Basic content calendar",
      "Basic content export",
      "Free forever; no payment required",
    ],
  },
  {
    id: "starter",
    name: "Starter",
    monthlyPriceNgn: 3000,
    generationLimit: 100,
    brandLimit: 3,
    featureFlags: {
      calendar: "full",
      export: "full",
    },
    calendarDescription: "Full content calendar",
    exportDescription: "Full available export functionality",
    availableForUpgrade: false,
    features: [
      "Planned ₦3,000/month · Coming Soon",
      "100 successful AI generations per UTC calendar month",
      "Maximum 3 brand profiles",
      "Full content calendar",
      "Full available export functionality",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    monthlyPriceNgn: 7000,
    generationLimit: 300,
    brandLimit: 10,
    featureFlags: {
      calendar: "full",
      export: "full",
    },
    calendarDescription: "Full content calendar",
    exportDescription: "Full available export functionality",
    availableForUpgrade: false,
    features: [
      "Planned ₦7,000/month · Coming Soon",
      "300 successful AI generations per UTC calendar month",
      "Maximum 10 brand profiles",
      "Full content calendar",
      "Full available export functionality",
    ],
  },
] as const;

export type PlanId = (typeof PLAN_OPTIONS)[number]["id"];
export type PlanOption = (typeof PLAN_OPTIONS)[number];
export type PlanFeatureLevel = "basic" | "full";

export function getPlanOption(planId: string) {
  const plan = PLAN_OPTIONS.find((option) => option.id === planId);
  if (!plan) {
    throw new Error(`Unsupported ContentFlow plan: ${planId}`);
  }
  return plan;
}

export function getPlanForWorkspace(planId: string | null | undefined) {
  return PLAN_OPTIONS.find((option) => option.id === planId) ?? PLAN_OPTIONS[0];
}
