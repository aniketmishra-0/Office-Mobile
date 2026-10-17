/**
 * Utility to convert Google Drive shareable/preview links into direct viewable image URLs
 * so that <img> tags render them cleanly without authentication errors.
 */
export function getDirectImageUrl(url: string | null | undefined): string {
  if (!url) return "";
  const trimmed = url.trim();
  // Standard Google Drive file link: drive.google.com/file/d/{id}/view...
  const matchFile = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (matchFile) {
    return `https://lh3.googleusercontent.com/d/${matchFile[1]}`;
  }
  // Alternate Google Drive link: drive.google.com/open?id={id} or id={id}
  const matchId = trimmed.match(/drive\.google\.com\/(?:open\?id=|uc\?id=)([a-zA-Z0-9_-]+)/);
  if (matchId) {
    return `https://lh3.googleusercontent.com/d/${matchId[1]}`;
  }
  return trimmed;
}
