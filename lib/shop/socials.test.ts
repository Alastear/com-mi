import { test } from "node:test";
import assert from "node:assert/strict";
import { SOCIAL_PLATFORMS, parseSocialLink, isSafeSocialUrl, socialKey } from "./socials";

test("social links accept each platform and allow removal", () => {
  for (const platform of SOCIAL_PLATFORMS) {
    assert.equal(parseSocialLink(platform, platform.placeholder), platform.placeholder);
    assert.equal(parseSocialLink(platform, "  "), "");
  }
  assert.equal(socialKey("Twitter"), "x");
});
test("social links reject unsafe protocols, credentials and lookalike hosts", () => {
  const facebook = SOCIAL_PLATFORMS[0];
  for (const url of ["javascript:alert(1)", "http://facebook.com/name", "https://facebook.com.evil.test/name", "https://user:pass@facebook.com/name", "https://instagram.com/name", "https://facebook.com/"]) {
    assert.equal(parseSocialLink(facebook, url), null);
  }
  assert.equal(isSafeSocialUrl("javascript:alert(1)"), false);
});
test("Discord accepts invitations and user profiles but rejects webhook URLs", () => {
  const discord = SOCIAL_PLATFORMS[3];
  assert.equal(parseSocialLink(discord, "https://discord.com/invite/abc"), "https://discord.com/invite/abc");
  assert.equal(parseSocialLink(discord, "https://discord.com/users/12345"), "https://discord.com/users/12345");
  assert.equal(parseSocialLink(discord, "https://discord.com/api/webhooks/123/secret"), null);
});
