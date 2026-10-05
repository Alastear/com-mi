export const SOCIAL_PLATFORMS = [
  { key: "facebook", label: "Facebook", placeholder: "https://www.facebook.com/yourname", hosts: ["facebook.com", "www.facebook.com", "m.facebook.com", "fb.com"] },
  { key: "instagram", label: "Instagram", placeholder: "https://www.instagram.com/yourname", hosts: ["instagram.com", "www.instagram.com"] },
  { key: "x", label: "X", placeholder: "https://x.com/yourname", hosts: ["x.com", "www.x.com", "twitter.com", "www.twitter.com"] },
  { key: "discord", label: "Discord", placeholder: "https://discord.gg/invite", hosts: ["discord.gg", "discord.com", "www.discord.com"] },
] as const;

export function socialKey(platform: string) {
  const key = platform.toLowerCase();
  return key === "twitter" ? "x" : key;
}

export function parseSocialLink(platform: typeof SOCIAL_PLATFORMS[number], input: string): string | null {
  const value = input.trim();
  if (!value) return "";
  if (value.length > 500) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port ||
      !(platform.hosts as readonly string[]).includes(url.hostname) || url.pathname === "/") return null;
    if (platform.key === "discord" && url.hostname !== "discord.gg" &&
      !/^\/(invite\/[^/]+|users\/\d+)\/?$/.test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}

export function isSafeSocialUrl(value: string) {
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; }
  catch { return false; }
}
