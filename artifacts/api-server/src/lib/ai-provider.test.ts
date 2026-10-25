import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  generateDraft,
  fingerprintGenerationPrompt,
  isAiProviderConfigured,
  mapProviderError,
  MAX_GENERATION_PROMPT_CHARS,
  parseGeneratedDraft,
  serializeGenerationPrompt,
} from "./ai-provider";

const originalProvider = process.env.AI_PROVIDER;
const originalNodeEnv = process.env.NODE_ENV;
const originalGeminiKey = process.env.GEMINI_API_KEY;

afterEach(() => {
  if (originalProvider === undefined) delete process.env.AI_PROVIDER;
  else process.env.AI_PROVIDER = originalProvider;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalGeminiKey;
});

test("mock provider returns a bounded draft in local development", async () => {
  process.env.AI_PROVIDER = "mock";
  process.env.NODE_ENV = "development";
  delete process.env.GEMINI_API_KEY;

  assert.equal(isAiProviderConfigured(), true);
  const draft = await generateDraft({
    prompt: JSON.stringify({ topic: "A product launch" }),
    topic: "A product launch",
    brandName: "Northstar",
  });
  assert.match(draft.title, /A product launch/);
  assert.match(draft.title, /Northstar/);
  assert.match(draft.body, /A product launch/);
});

test("mock provider is disabled in production", () => {
  process.env.AI_PROVIDER = "mock";
  process.env.NODE_ENV = "production";
  delete process.env.GEMINI_API_KEY;
  assert.equal(isAiProviderConfigured(), false);
});

test("mock provider is disabled outside development and test environments", () => {
  process.env.AI_PROVIDER = "mock";
  process.env.NODE_ENV = "staging";
  delete process.env.GEMINI_API_KEY;
  assert.equal(isAiProviderConfigured(), false);
});

test("prompt serialization preserves the existing brand and request context", () => {
  const prompt = serializeGenerationPrompt({
    brand: {
      name: "Northstar",
      industry: "Education",
      voice: "Warm and direct",
      targetAudience: "Independent teachers",
      contentPillars: ["Practical lessons"],
    },
    request: {
      platform: "linkedin",
      contentType: "post",
      topic: "A product launch",
      objective: "Build awareness",
      tone: "Confident",
      callToAction: "Read more",
    },
  });
  assert.deepEqual(JSON.parse(prompt), {
    brand: {
      name: "Northstar",
      industry: "Education",
      voice: "Warm and direct",
      targetAudience: "Independent teachers",
      contentPillars: ["Practical lessons"],
    },
    request: {
      platform: "linkedin",
      contentType: "post",
      topic: "A product launch",
      objective: "Build awareness",
      tone: "Confident",
      callToAction: "Read more",
    },
  });
  assert.ok(prompt.length < MAX_GENERATION_PROMPT_CHARS);
});

test("generation fingerprints are stable and change with the prompt", () => {
  const prompt = '{"topic":"First brief"}';
  assert.equal(fingerprintGenerationPrompt(prompt), fingerprintGenerationPrompt(prompt));
  assert.notEqual(
    fingerprintGenerationPrompt(prompt),
    fingerprintGenerationPrompt('{"topic":"Different brief"}'),
  );
});

test("provider response parser accepts valid JSON and rejects invalid shapes", () => {
  assert.deepEqual(parseGeneratedDraft('{"title":"A title","body":"A body"}'), {
    title: "A title",
    body: "A body",
  });
  assert.throws(() => parseGeneratedDraft("not-json"), /invalid JSON/);
  assert.throws(() => parseGeneratedDraft('{"title":"","body":"A body"}'), /allowed limits/);
});

test("oversized prompts are rejected before any provider request", async () => {
  await assert.rejects(
    generateDraft({
      prompt: "x".repeat(MAX_GENERATION_PROMPT_CHARS + 1),
      topic: "A topic",
      brandName: "Northstar",
    }),
    /configured input limit/,
  );
});

test("provider rate limits and timeouts map to retryable HTTP errors", () => {
  assert.equal(mapProviderError({ status: 429 }).statusCode, 429);
  assert.equal(mapProviderError({ code: "DEADLINE_EXCEEDED" }).statusCode, 504);
});

test("provider credentials and missing models are reported as configuration failures", () => {
  assert.equal(mapProviderError({ status: 401 }).statusCode, 503);
  assert.equal(mapProviderError({ status: 401 }).code, "GEMINI_AUTHENTICATION");
  assert.equal(mapProviderError({ status: 404 }).statusCode, 503);
  assert.equal(mapProviderError({ status: 404 }).code, "GEMINI_MODEL_CONFIGURATION");
});

test("a cancelled request does not enter mock generation", async () => {
  process.env.AI_PROVIDER = "mock";
  process.env.NODE_ENV = "test";
  const controller = new AbortController();
  controller.abort();

  await assert.rejects(
    generateDraft({
      prompt: "{}",
      topic: "A topic",
      brandName: "Northstar",
      signal: controller.signal,
    }),
    { name: "AbortError" },
  );
});
