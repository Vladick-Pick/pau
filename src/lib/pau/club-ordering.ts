import type { Club } from "@prisma/client";

export const DEFAULT_ACTIVE_PARTICIPANTS_CLUB_ID = "ws_cf1";

export function sortClubsForDefaultSelection(clubs: Club[]): Club[] {
  return [...clubs].sort((a, b) => {
    if (
      a.id === DEFAULT_ACTIVE_PARTICIPANTS_CLUB_ID &&
      b.id !== DEFAULT_ACTIVE_PARTICIPANTS_CLUB_ID
    ) {
      return -1;
    }
    if (
      b.id === DEFAULT_ACTIVE_PARTICIPANTS_CLUB_ID &&
      a.id !== DEFAULT_ACTIVE_PARTICIPANTS_CLUB_ID
    ) {
      return 1;
    }

    const byName = a.name.localeCompare(b.name, ["ru", "en"], {
      sensitivity: "base",
    });
    if (byName !== 0) return byName;

    return a.id.localeCompare(b.id);
  });
}
