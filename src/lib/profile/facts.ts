import type {
  PublicProfile,
  BusinessEvent,
  ProfileFacts,
  ProfileDossier,
  ParticipationEvent,
  FactPhase,
} from "./types";
import { parseLooseDate } from "./mapping";

// ──────────────────────────────────────────────────────────────
// Safe deep-access helpers — never assume a path exists
// ──────────────────────────────────────────────────────────────

function getArr(obj: unknown, key: string): unknown[] {
  if (obj !== null && typeof obj === "object" && !Array.isArray(obj)) {
    const val = (obj as Record<string, unknown>)[key];
    if (Array.isArray(val)) return val;
  }
  return [];
}

function getObj(obj: unknown, key: string): Record<string, unknown> {
  if (obj !== null && typeof obj === "object" && !Array.isArray(obj)) {
    const val = (obj as Record<string, unknown>)[key];
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      return val as Record<string, unknown>;
    }
  }
  return {};
}

function getStr(obj: unknown, key: string): string | null {
  if (obj !== null && typeof obj === "object" && !Array.isArray(obj)) {
    const val = (obj as Record<string, unknown>)[key];
    if (typeof val === "string") return val;
  }
  return null;
}

function getNum(obj: unknown, key: string): number | null {
  if (obj !== null && typeof obj === "object" && !Array.isArray(obj)) {
    const val = (obj as Record<string, unknown>)[key];
    if (typeof val === "number") return val;
  }
  return null;
}

// ──────────────────────────────────────────────────────────────
// deriveFacts
// ──────────────────────────────────────────────────────────────

export function deriveFacts(
  profile: PublicProfile,
  events: BusinessEvent[],
  opts?: { now?: Date }
): ProfileFacts {
  const now = opts?.now ?? new Date();

  // tenureYear: max membership_year from community.attendance.forums[]
  const community = getObj(profile, "community");
  const attendance = getObj(community, "attendance");
  const forums = getArr(attendance, "forums");

  let tenureYear: number | null = null;

  if (forums.length > 0) {
    for (const forum of forums) {
      const year = getNum(forum, "membership_year");
      if (year !== null && (tenureYear === null || year > tenureYear)) {
        tenureYear = year;
      }
    }
  }

  // Fallback: whole years between earliest deals[].begin_at and now
  if (tenureYear === null) {
    const membership = getObj(profile, "membership");
    const deals = getArr(membership, "deals");
    let earliest: Date | null = null;
    for (const deal of deals) {
      const beginAt = getStr(deal, "begin_at");
      const d = parseLooseDate(beginAt);
      if (d !== null && (earliest === null || d < earliest)) {
        earliest = d;
      }
    }
    if (earliest !== null) {
      const msPerYear = 1000 * 60 * 60 * 24 * 365.25;
      const wholeYears = Math.floor((now.getTime() - earliest.getTime()) / msPerYear);
      if (wholeYears >= 0) tenureYear = wholeYears;
    }
  }

  // paymentPhase: find current or latest deal
  const membership = getObj(profile, "membership");
  const deals = getArr(membership, "deals");

  let paymentPhase: FactPhase | null = null;

  // Try to find a deal whose [begin_at, close_at] window contains now
  let selectedDeal: unknown = null;
  for (const deal of deals) {
    const beginDate = parseLooseDate(getStr(deal, "begin_at"));
    const closeDate = parseLooseDate(getStr(deal, "close_at"));
    if (beginDate && closeDate && now >= beginDate && now <= closeDate) {
      selectedDeal = deal;
      break;
    }
  }

  // If no current deal, pick latest by begin_at
  if (selectedDeal === null && deals.length > 0) {
    let latestBegin: Date | null = null;
    for (const deal of deals) {
      const beginDate = parseLooseDate(getStr(deal, "begin_at"));
      if (beginDate && (latestBegin === null || beginDate > latestBegin)) {
        latestBegin = beginDate;
        selectedDeal = deal;
      }
    }
  }

  if (selectedDeal !== null) {
    const begin = parseLooseDate(getStr(selectedDeal, "begin_at"));
    const close = parseLooseDate(getStr(selectedDeal, "close_at"));
    if (begin && close && close.getTime() > begin.getTime()) {
      const frac =
        (now.getTime() - begin.getTime()) /
        (close.getTime() - begin.getTime());
      if (frac < 0.34) {
        paymentPhase = "start";
      } else if (frac < 0.67) {
        paymentPhase = "mid";
      } else {
        paymentPhase = "end";
      }
    }
  }

  // retention: ALWAYS null — API does not expose it yet
  const retention: null = null;

  // attendance: ALWAYS null — modelled, not computed yet
  const attendance_fact: null = null;

  // businessBand: parse business.companies[0].revenue
  // TODO: refine via employee_count enum once known
  let businessBand: number | null = null;
  const business = getObj(profile, "business");
  const companies = getArr(business, "companies");
  if (companies.length > 0) {
    const revenueStr = getStr(companies[0], "revenue");
    if (revenueStr !== null) {
      const digits = revenueStr.replace(/\D/g, "");
      const revenue = digits.length > 0 ? Number(digits) : 0;
      if (revenue > 0) {
        if (revenue < 50_000_000) {
          businessBand = 1;
        } else if (revenue < 300_000_000) {
          businessBand = 2;
        } else if (revenue < 1_000_000_000) {
          businessBand = 3;
        } else {
          businessBand = 4;
        }
      }
    }
  }

  return {
    tenureYear,
    retention,
    attendance: attendance_fact,
    paymentPhase,
    businessBand,
  };
}

// ──────────────────────────────────────────────────────────────
// deriveDossier
// ──────────────────────────────────────────────────────────────

export function deriveDossier(profile: PublicProfile): ProfileDossier {
  const bizExp = getArr(profile, "business_experience");
  const business = getObj(profile, "business");
  const companies = getArr(business, "companies");
  const firstCompany = companies.length > 0 ? companies[0] : null;

  // company
  const company =
    getStr(bizExp[0] ?? null, "company") ??
    getStr(firstCompany, "company") ??
    null;

  // revenue — null if falsy or "0"
  const rawRevenue = getStr(firstCompany, "revenue");
  const revenue =
    rawRevenue && rawRevenue !== "0" ? rawRevenue : null;

  // industry
  const industries = firstCompany ? getArr(firstCompany, "industries") : [];
  const industry =
    getStr(industries[0] ?? null, "display_name") ??
    getStr(bizExp[0] ?? null, "description") ??
    null;

  // position
  const position = getStr(bizExp[0] ?? null, "position") ?? null;

  // city
  const locations = getArr(profile, "locations");
  const firstLocation = locations.length > 0 ? locations[0] : null;
  const cityObj = firstLocation ? getObj(firstLocation, "city") : {};
  const city = getStr(cityObj, "name") ?? null;

  // age
  const demographics = getObj(profile, "demographics");
  const ages = getArr(demographics, "ages");
  const age = getNum(ages[0] ?? null, "age") ?? null;

  // interests
  const reqRes = getObj(profile, "requests_resources");
  const interests_arr = getArr(reqRes, "interests");
  const interestText = getStr(interests_arr[0] ?? null, "text");

  let interests: string | null = null;
  if (interestText) {
    interests = interestText;
  } else {
    const hobbies = getArr(profile, "hobbies");
    if (hobbies.length > 0) {
      const names = hobbies
        .map((h) => getStr(h, "display_name"))
        .filter((n): n is string => n !== null);
      interests = names.length > 0 ? names.join(", ") : null;
    }
  }

  // canBeUseful
  const profileText = getObj(profile, "profile_text");
  const canBeUseful = getStr(profileText, "can_be_useful") ?? null;

  // clubGoals
  const clubGoals = getStr(profileText, "club_goals") ?? null;

  // telegram — prefer social_profiles[network==="telegram"].username
  let telegram: string | null = null;
  const socialProfiles = getArr(profile, "social_profiles");
  for (const sp of socialProfiles) {
    if (getStr(sp, "network") === "telegram") {
      telegram = getStr(sp, "username") ?? null;
      break;
    }
  }
  if (telegram === null) {
    const contactChannels = getArr(profile, "contact_channels");
    for (const cc of contactChannels) {
      if (getStr(cc, "channel") === "telegram") {
        telegram = getStr(cc, "external_id") ?? null;
        break;
      }
    }
  }

  return {
    company,
    revenue,
    industry,
    position,
    city,
    age,
    interests,
    canBeUseful,
    clubGoals,
    telegram,
  };
}

// ──────────────────────────────────────────────────────────────
// deriveParticipation
// ──────────────────────────────────────────────────────────────

const PARTICIPATION_EVENT_TYPES = new Set([
  "community.event_attended",
]);

export function deriveParticipation(events: BusinessEvent[]): ParticipationEvent[] {
  const filtered = events.filter((e) =>
    PARTICIPATION_EVENT_TYPES.has(e.event_type)
  );

  const mapped: ParticipationEvent[] = filtered.map((e) => {
    const date = e.happened_at ?? e.observed_at;
    const title =
      e.title ?? e.event_type_label ?? e.event_type;
    const eventName =
      e.current_value["event_name"] != null
        ? String(e.current_value["event_name"])
        : null;
    const category = e.category != null ? String(e.category) : null;
    const detail = eventName ?? category ?? "";
    return { date, title, detail };
  });

  // Sort DESC by date — undated last (empty string sorts last lexicographically)
  mapped.sort((a, b) => {
    const da = parseLooseDate(a.date);
    const db = parseLooseDate(b.date);
    if (da === null && db === null) return 0;
    if (da === null) return 1;
    if (db === null) return -1;
    return db.getTime() - da.getTime();
  });

  return mapped;
}
