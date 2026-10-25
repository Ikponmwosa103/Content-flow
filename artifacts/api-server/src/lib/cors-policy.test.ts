import assert from "node:assert/strict";
import test from "node:test";
import { getAllowedCorsOrigins, isAllowedCorsOrigin } from "./cors-policy";

test("CORS allowlist accepts configured Netlify production and deploy URLs", () => {
  const origins = getAllowedCorsOrigins({
    CORS_ALLOWED_ORIGINS: "https://content.example, https://staging.example/",
    NETLIFY_URL: "https://contentflow.netlify.app/",
    DEPLOY_PRIME_URL: "https://deploy-preview-42--contentflow.netlify.app",
  });

  assert.equal(origins.has("https://content.example"), true);
  assert.equal(origins.has("https://staging.example"), true);
  assert.equal(origins.has("https://contentflow.netlify.app"), true);
  assert.equal(
    origins.has("https://deploy-preview-42--contentflow.netlify.app"),
    true,
  );
});

test("CORS rejects wildcard, unsafe schemes, and URL paths in configuration", () => {
  const origins = getAllowedCorsOrigins({
    CORS_ALLOWED_ORIGINS:
      "*, javascript:alert(1), https://content.example/path, https://valid.example",
  });

  assert.deepEqual([...origins], ["https://valid.example"]);
});

test("CORS allows the request host or an explicit origin, not forwarded-host input", () => {
  const origins = new Set(["https://contentflow.netlify.app"]);

  assert.equal(
    isAllowedCorsOrigin("https://api.example.com", "api.example.com", origins),
    true,
  );
  assert.equal(
    isAllowedCorsOrigin(
      "https://contentflow.netlify.app",
      "api.example.com",
      origins,
    ),
    true,
  );
  assert.equal(
    isAllowedCorsOrigin(
      "https://attacker.example",
      "api.example.com",
      origins,
    ),
    false,
  );
  assert.equal(isAllowedCorsOrigin(undefined, undefined, origins), true);
});
