export function getInitials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function readinessLabel(r: string): string {
  if (r === "READY") return "Готов";
  if (r === "NOT_READY") return "Не готов";
  return "Не размечен";
}
