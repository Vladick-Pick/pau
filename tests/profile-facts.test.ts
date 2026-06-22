import { describe, it, expect } from "vitest";
import { deriveFacts, deriveDossier, deriveParticipation } from "@/lib/profile/facts";
import type { BusinessEvent } from "@/lib/profile/types";
import profile from "./fixtures/profile-cf1-member.json";
import events from "./fixtures/profile-business-events.json";

const typedEvents = events as unknown as BusinessEvent[];

describe("deriveFacts", () => {
  it("derives tenureYear as max membership_year from forums (=2)", () => {
    const facts = deriveFacts(profile, typedEvents);
    expect(facts.tenureYear).toBe(2);
  });

  it("paymentPhase is 'mid' when now is 2025-04-01 (within the deal window)", () => {
    // deal: begin 2024-07-09, close 2026-01-17
    // frac = (2025-04-01 - 2024-07-09) / (2026-01-17 - 2024-07-09)
    // duration ≈ 557 days; elapsed ≈ 266 days; frac ≈ 0.48 → "mid"
    const facts = deriveFacts(profile, typedEvents, { now: new Date("2025-04-01T00:00:00Z") });
    expect(facts.paymentPhase).toBe("mid");
  });

  it("retention is always null", () => {
    const facts = deriveFacts(profile, typedEvents);
    expect(facts.retention).toBeNull();
  });

  it("attendance is always null", () => {
    const facts = deriveFacts(profile, typedEvents);
    expect(facts.attendance).toBeNull();
  });

  it("businessBand is null when revenue is '0'", () => {
    const facts = deriveFacts(profile, typedEvents);
    expect(facts.businessBand).toBeNull();
  });

  it("handles empty profile and events without throwing, returns all-null", () => {
    const facts = deriveFacts({}, []);
    expect(facts.tenureYear).toBeNull();
    expect(facts.paymentPhase).toBeNull();
    expect(facts.retention).toBeNull();
    expect(facts.attendance).toBeNull();
    expect(facts.businessBand).toBeNull();
  });
});

describe("deriveDossier", () => {
  it("company comes from business_experience[0].company", () => {
    const d = deriveDossier(profile);
    expect(d.company).toBe("ООО Смарт Питание");
  });

  it("revenue is null when revenue is '0'", () => {
    const d = deriveDossier(profile);
    expect(d.revenue).toBeNull();
  });

  it("industry comes from business.companies[0].industries[0].display_name", () => {
    const d = deriveDossier(profile);
    expect(d.industry).toBe("Еда и питание");
  });

  it("position comes from business_experience[0].position", () => {
    const d = deriveDossier(profile);
    expect(d.position).toBe("Владелец");
  });

  it("city comes from locations[0].city.name", () => {
    const d = deriveDossier(profile);
    expect(d.city).toBe("Москва");
  });

  it("age is 46", () => {
    const d = deriveDossier(profile);
    expect(d.age).toBe(46);
  });

  it("interests contains 'Сквош' from requests_resources.interests[0].text", () => {
    const d = deriveDossier(profile);
    expect(d.interests).toContain("Сквош");
  });

  it("canBeUseful is truthy", () => {
    const d = deriveDossier(profile);
    expect(d.canBeUseful).toBeTruthy();
  });

  it("clubGoals is truthy", () => {
    const d = deriveDossier(profile);
    expect(d.clubGoals).toBeTruthy();
  });

  it("telegram is '@Zhenya_Tsimbalyuk' from social_profiles (preferred over contact_channels)", () => {
    const d = deriveDossier(profile);
    expect(d.telegram).toBe("@Zhenya_Tsimbalyuk");
  });

  it("handles empty profile without throwing, returns all-null", () => {
    const d = deriveDossier({});
    expect(d.company).toBeNull();
    expect(d.revenue).toBeNull();
    expect(d.industry).toBeNull();
    expect(d.position).toBeNull();
    expect(d.city).toBeNull();
    expect(d.age).toBeNull();
    expect(d.interests).toBeNull();
    expect(d.canBeUseful).toBeNull();
    expect(d.clubGoals).toBeNull();
    expect(d.telegram).toBeNull();
  });
});

describe("deriveParticipation", () => {
  it("returns only forum_attended events, excludes membership.payment", () => {
    const participation = deriveParticipation(typedEvents);
    expect(participation).toHaveLength(2);
  });

  it("sorts by date DESC — first item title contains Ф19", () => {
    const participation = deriveParticipation(typedEvents);
    expect(participation[0].title).toContain("Ф19");
  });

  it("excludes the payment event entirely", () => {
    const participation = deriveParticipation(typedEvents);
    const hasPay = participation.some((e) => e.title === "Оплата");
    expect(hasPay).toBe(false);
  });

  it("returns [] for empty events", () => {
    expect(deriveParticipation([])).toEqual([]);
  });
});
