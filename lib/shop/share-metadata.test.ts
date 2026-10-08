import { test } from "node:test";
import assert from "node:assert/strict";
import { shareMetadata } from "./share-metadata";

const image = (name: string) => ({ url: `https://assets.example/${name}.png`, access: "public", contentType: "image/png" });
const base = { title: "ร้านทดสอบ", description: "รับวาดภาพ", path: "/@artist/s/portrait", cover: image("cover"), avatar: image("avatar"), ownerImage: "https://lh3.googleusercontent.com/avatar" };
function chosen(input: Parameters<typeof shareMetadata>[0]) {
  const metadata = shareMetadata(input);
  const images = metadata.openGraph?.images as Array<{ url: string }>;
  assert.deepEqual(metadata.twitter?.images, images);
  return images[0].url;
}
test("service cover, shop avatar, Google avatar and generic fallback are selected in order", () => {
  assert.equal(chosen(base), base.cover.url);
  assert.equal(chosen({ ...base, cover: null }), base.avatar.url);
  assert.equal(chosen({ ...base, cover: null, avatar: null }), base.ownerImage);
  assert.ok(chosen({ ...base, cover: null, avatar: null, ownerImage: null }).endsWith("/share-image"));
});
test("private media, videos and unsafe URLs cannot become share images", () => {
  assert.equal(chosen({ ...base, cover: { ...base.cover, access: "private" } }), base.avatar.url);
  assert.equal(chosen({ ...base, cover: { ...base.cover, contentType: "video/mp4" } }), base.avatar.url);
  assert.equal(chosen({ ...base, cover: { ...base.cover, url: "javascript:alert(1)" } }), base.avatar.url);
  assert.ok(chosen({ ...base, cover: null, avatar: null, ownerImage: "https://user:secret@example.com/x" }).endsWith("/share-image"));
});
