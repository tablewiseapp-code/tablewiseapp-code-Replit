// Parses the YouTube links we accept. Only the real hostname is trusted; the video id is the only thing kept.
const HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "www.youtu.be"]);
const ID = /^[A-Za-z0-9_-]{11}$/;

export type YouTubeVideo = { videoId: string; canonicalUrl: string };

export function parseYouTubeUrl(input: string): YouTubeVideo | undefined {
  let url: URL;
  try { url = new URL(input.trim()); } catch { return undefined; }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || !HOSTS.has(url.hostname.toLowerCase())) return undefined;
  const parts = url.pathname.split("/").filter(Boolean);
  const candidate = url.hostname.toLowerCase().endsWith("youtu.be") ? parts[0]
    : parts[0] === "watch" && parts.length === 1 ? url.searchParams.get("v")
    : parts[0] === "shorts" && parts.length === 2 ? parts[1] : null;
  if (!candidate || !ID.test(candidate)) return undefined;
  return { videoId: candidate, canonicalUrl: `https://www.youtube.com/watch?v=${candidate}` };
}

export const embedUrl = (videoId: string) => `https://www.youtube-nocookie.com/embed/${videoId}?rel=0`;
