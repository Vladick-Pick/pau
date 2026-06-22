import type { ActiveRuleInput } from "@/lib/pau/active-rules";

export type ActiveRuleDefault = ActiveRuleInput & {
  description?: string;
  sortOrder: number;
};

export const DEFAULT_ACTIVE_RULES: ActiveRuleDefault[] = [
  {
    key: "tenure",
    label: "Стаж в клубе",
    description: "От 2-го года, лучше от 3-го.",
    type: "MIN_YEAR",
    config: { min: 2 },
    enabled: true,
    optional: false,
    sortOrder: 0,
  },
  {
    key: "retention",
    label: "Расчётный retention",
    type: "MIN_PERCENT",
    factKey: "retention",
    config: { min: 70 },
    enabled: true,
    optional: false,
    sortOrder: 1,
  },
  {
    key: "attendance",
    label: "Доходимость",
    type: "MIN_PERCENT",
    factKey: "attendance",
    config: { min: 70 },
    enabled: true,
    optional: false,
    sortOrder: 2,
  },
  {
    key: "payment",
    label: "Платёжный год",
    type: "PHASE",
    config: { pass: ["mid"] },
    enabled: true,
    optional: false,
    sortOrder: 3,
  },
  {
    key: "activity",
    label: "Клубная активность",
    type: "HAS_ROLE",
    config: {},
    enabled: false,
    optional: true,
    sortOrder: 4,
  },
];
