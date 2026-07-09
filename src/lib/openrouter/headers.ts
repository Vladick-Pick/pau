export function toOpenRouterTitleHeader(appTitle: string) {
  const title = appTitle.trim();
  if (!title) {
    return "PAU";
  }

  return /^[\x20-\x7E]+$/.test(title) ? title : encodeURIComponent(title);
}
