import type { EventMatchProfile, EventMatchResult } from "./client";

const localActiveParticipants = [
  {
    id: "local-active-1",
    fullName: "Алексей Морозов",
    score: 0.92,
    rationale: "Сильный опыт в B2B-продажах и похожая аудитория.",
    profile: {
      company: "Морозов Консалтинг",
      position: "Основатель",
      city: "Москва",
      businessMain: "B2B консалтинг и продажи",
    },
  },
  {
    id: "local-active-2",
    fullName: "Елена Волкова",
    score: 0.86,
    rationale: "Может дать гостям практичные интро по сервисному бизнесу.",
    profile: {
      company: "Service Lab",
      position: "Управляющий партнер",
      city: "Санкт-Петербург",
      businessMain: "Сервисные компании и операционное управление",
    },
  },
  {
    id: "local-active-3",
    fullName: "Игорь Кузнецов",
    score: 0.79,
    rationale: "Релевантен для обсуждения производства и найма руководителей.",
    profile: {
      company: "Кузнецов Индастри",
      position: "CEO",
      city: "Москва",
      businessMain: "Производство и B2B-дистрибуция",
    },
  },
];

export function buildLocalEventMatchResult(
  profile: EventMatchProfile
): EventMatchResult {
  return {
    activeParticipants: localActiveParticipants,
    rationale: `Локальный шаблон matching для события "${profile.event.title}".`,
  };
}
