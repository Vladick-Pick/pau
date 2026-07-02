export const FORMAT_SLUG_ERROR =
  "Format slug must contain latin letters, numbers, dashes, or underscores";

const FORMAT_SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

export function isSafeFormatSlug(slug: string) {
  return FORMAT_SLUG_PATTERN.test(slug.trim());
}
