/** Proposed ContentFlow AI monthly allowances. Connect these to the existing plan service. */
export const CONTENTFLOW_PLAN_ALLOWANCES = {
  free: { monthlyPriceNaira: 0, textGenerations: 10, imageGenerations: 2 },
  starter: { monthlyPriceNaira: 3000, textGenerations: 100, imageGenerations: 20 },
  pro: { monthlyPriceNaira: 7000, textGenerations: 300, imageGenerations: 50 },
} as const;

export type ContentFlowPlan = keyof typeof CONTENTFLOW_PLAN_ALLOWANCES;

export function getImageAllowance(plan: ContentFlowPlan): number {
  return CONTENTFLOW_PLAN_ALLOWANCES[plan].imageGenerations;
}
