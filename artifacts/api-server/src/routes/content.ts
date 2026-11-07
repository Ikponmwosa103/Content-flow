import {
  and,
  eq,
  gte,
  ilike,
  lt,
  or,
} from "@workspace/db";
import { Router } from "express";
import {
  CreateContentBody,
  CreateContentResponse,
  DeleteContentParams,
  DeleteContentResponse,
  GenerateContentBody,
  GenerateContentResponse,
  GetCalendarQueryParams,
  GetCalendarResponse,
  GetContentParams,
  GetContentResponse,
  ListContentsQueryParams,
  ListContentsResponse,
  UpdateContentBody,
  UpdateContentParams,
  UpdateContentResponse,
} from "@workspace/api-zod";
import {
  contentsTable,
  db,
} from "@workspace/db";
import {
  getAuthenticatedUserId,
  requireAuth,
} from "../middlewares/requireAuth";
import {
  findBrandForWorkspace,
  findWorkspaceForUser,
  getContentItem,
  getContentItems,
  getUsageSummary,
} from "../lib/contentflow";
import { getPlanForWorkspace } from "../lib/plans";
import {
  completeGeneration,
  releaseGeneration,
  reserveGeneration,
} from "../lib/generation-usage";
import type { ReservationResult } from "../lib/generation-usage";
import {
  AiProviderError,
  generateDraft,
  generateImage,
  fingerprintGenerationPrompt,
  isAiProviderConfigured,
  MAX_GENERATION_PROMPT_CHARS,
  serializeGenerationPrompt,
} from "../lib/ai-provider";

const router = Router();
router.use(requireAuth);

router.get("/contents", async (req, res): Promise<void> => {
  const userId = getAuthenticatedUserId(res);
  const workspace = await findWorkspaceForUser(userId);
  if (!workspace) {
    res.status(404).json({ error: "Workspace not found" });
    return;
  }

  const parsed = ListContentsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const filters = [];
  if (parsed.data.status) {
    filters.push(eq(contentsTable.status, parsed.data.status));
  }
  if (parsed.data.platform) {
    filters.push(eq(contentsTable.platform, parsed.data.platform));
  }
  if (parsed.data.brandId !== undefined) {
    filters.push(eq(contentsTable.brandId, parsed.data.brandId));
  }
  const query = parsed.data.q?.trim();
  if (query) {
    filters.push(
      or(
        ilike(contentsTable.title, `%${query}%`),
        ilike(contentsTable.body, `%${query}%`),
      )!,
    );
  }

  const items = await getContentItems(workspace.id, filters);
  res.json(ListContentsResponse.parse(items));
});

router.post("/contents", async (req, res): Promise<void> => {
  const userId = getAuthenticatedUserId(res);
  const workspace = await findWorkspaceForUser(userId);
  if (!workspace) {
    res.status(404).json({ error: "Workspace not found" });
    return;
  }

  const parsed = CreateContentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const input = parsed.data;
  const brand = await findBrandForWorkspace(input.brandId, workspace.id);
  if (!brand) {
    res.status(404).json({ error: "Brand not found" });
    return;
  }

  const status = input.status ?? (input.scheduledAt ? "scheduled" : "draft");
  if (status === "scheduled" && !input.scheduledAt) {
    res.status(400).json({ error: "Choose a date and time to schedule this item" });
    return;
  }

  const [created] = await db
    .insert(contentsTable)
    .values({
      workspaceId: workspace.id,
      brandId: input.brandId,
      title: input.title.trim(),
      body: input.body,
      platform: input.platform,
      contentType: input.contentType,
      status,
      scheduledAt: input.scheduledAt ?? null,
      tags: input.tags ?? [],
    })
    .returning({ id: contentsTable.id });
  const item = await getContentItem(workspace.id, created.id);
  res.status(201).json(CreateContentResponse.parse(item));
});

router.get("/contents/:id", async (req, res): Promise<void> => {
  const userId = getAuthenticatedUserId(res);
  const workspace = await findWorkspaceForUser(userId);
  if (!workspace) {
    res.status(404).json({ error: "Workspace not found" });
    return;
  }

  const params = GetContentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const item = await getContentItem(workspace.id, params.data.id);
  if (!item) {
    res.status(404).json({ error: "Content not found" });
    return;
  }
  res.json(GetContentResponse.parse(item));
});

router.patch("/contents/:id", async (req, res): Promise<void> => {
  const userId = getAuthenticatedUserId(res);
  const workspace = await findWorkspaceForUser(userId);
  if (!workspace) {
    res.status(404).json({ error: "Workspace not found" });
    return;
  }

  const params = UpdateContentParams.safeParse(req.params);
  const parsed = UpdateContentBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (Object.keys(parsed.data).length === 0) {
    res.status(400).json({ error: "Provide at least one field to update" });
    return;
  }

  const existing = await getContentItem(workspace.id, params.data.id);
  if (!existing) {
    res.status(404).json({ error: "Content not found" });
    return;
  }

  if (
    parsed.data.brandId !== undefined &&
    !(await findBrandForWorkspace(parsed.data.brandId, workspace.id))
  ) {
    res.status(404).json({ error: "Brand not found" });
    return;
  }

  const effectiveStatus = parsed.data.status ?? existing.status;
  const effectiveSchedule =
    parsed.data.scheduledAt === undefined
      ? existing.scheduledAt
      : parsed.data.scheduledAt;
  if (effectiveStatus === "scheduled" && !effectiveSchedule) {
    res.status(400).json({ error: "Choose a date and time to schedule this item" });
    return;
  }

  const [updated] = await db
    .update(contentsTable)
    .set({
      ...parsed.data,
      title: parsed.data.title?.trim(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(contentsTable.id, params.data.id),
        eq(contentsTable.workspaceId, workspace.id),
      ),
    )
    .returning({ id: contentsTable.id });
  if (!updated) {
    res.status(404).json({ error: "Content not found" });
    return;
  }
  const item = await getContentItem(workspace.id, updated.id);
  res.json(UpdateContentResponse.parse(item));
});

router.delete("/contents/:id", async (req, res): Promise<void> => {
  const userId = getAuthenticatedUserId(res);
  const workspace = await findWorkspaceForUser(userId);
  if (!workspace) {
    res.status(404).json({ error: "Workspace not found" });
    return;
  }

  const params = DeleteContentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [deleted] = await db
    .delete(contentsTable)
    .where(
      and(
        eq(contentsTable.id, params.data.id),
        eq(contentsTable.workspaceId, workspace.id),
      ),
    )
    .returning({ id: contentsTable.id });
  if (!deleted) {
    res.status(404).json({ error: "Content not found" });
    return;
  }
  res.status(204).end();
});

router.get("/calendar", async (req, res): Promise<void> => {
  const userId = getAuthenticatedUserId(res);
  const workspace = await findWorkspaceForUser(userId);
  if (!workspace) {
    res.status(404).json({ error: "Workspace not found" });
    return;
  }

  const parsed = GetCalendarQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [yearText, monthText] = parsed.data.month.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (month < 1 || month > 12) {
    res.status(400).json({ error: "Month must be between 01 and 12" });
    return;
  }
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  const items = await getContentItems(workspace.id, [
    eq(contentsTable.status, "scheduled"),
    gte(contentsTable.scheduledAt, start),
    lt(contentsTable.scheduledAt, end),
  ]);
  res.json(GetCalendarResponse.parse(items));
});


router.post("/images/generate", async (req, res): Promise<void> => {
  const userId = getAuthenticatedUserId(res);
  const workspace = await findWorkspaceForUser(userId);
  if (!workspace) {
    res.status(404).json({ error: "Workspace not found" });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const style = typeof body?.style === "string" ? body.style : "Editorial";
  const aspectRatio = typeof body?.aspectRatio === "string" ? body.aspectRatio : "1:1";
  const brandId = Number(body?.brandId);
  const requestId = typeof body?.requestId === "string" ? body.requestId : "";
  if (!prompt || prompt.length > 2000 || !Number.isSafeInteger(brandId) || brandId <= 0 ||
      !/^[0-9a-f-]{36}$/i.test(requestId) ||
      !["Editorial", "Photographic", "Illustration", "Minimal", "3D render", "Bold graphic"].includes(style) ||
      !["1:1", "4:5", "16:9", "9:16"].includes(aspectRatio)) {
    res.status(400).json({ error: "Provide a valid image prompt, brand, style, aspect ratio and request ID." });
    return;
  }
  if (!isAiProviderConfigured()) {
    res.status(503).json({ error: "Image generation is not configured. Add GEMINI_API_KEY to the API server." });
    return;
  }
  const brand = await findBrandForWorkspace(brandId, workspace.id);
  if (!brand) {
    res.status(404).json({ error: "Brand not found" });
    return;
  }

  const imagePrompt = JSON.stringify({
    prompt,
    style,
    aspectRatio,
    brand: { name: brand.name, industry: brand.industry, voice: brand.brandVoice },
  });
  let reservation: ReservationResult;
  try {
    reservation = await reserveGeneration({
      workspaceId: workspace.id,
      requestId,
      requestHash: fingerprintGenerationPrompt(imagePrompt),
      plan: getPlanForWorkspace(workspace.plan),
      periodAnchor: workspace.plan === "free"
        ? workspace.createdAt
        : workspace.subscriptionStartedAt ?? (workspace.planRenewalAt
          ? new Date(workspace.planRenewalAt.getTime() - 30 * 24 * 60 * 60 * 1000)
          : workspace.createdAt),
    });
  } catch (error) {
    req.log.error({ errorName: error instanceof Error ? error.name : "UnknownError" }, "Could not reserve image generation usage");
    res.status(503).json({ error: "Image generation is temporarily unavailable. Try again shortly." });
    return;
  }
  if (reservation.kind === "rate_limited") {
    res.setHeader("Retry-After", String(reservation.retryAfterSeconds));
    res.status(429).json({ error: "Too many generation requests. Please wait before trying again." });
    return;
  }
  if (reservation.kind === "quota_exhausted") {
    res.status(429).json({ error: `You've used all ${reservation.limit} AI generations for this billing period.` });
    return;
  }
  if (reservation.kind === "in_progress") {
    res.status(409).json({ error: "This image request is already being processed." });
    return;
  }
  if (reservation.kind === "idempotency_conflict" || reservation.kind === "cached") {
    res.status(409).json({ error: "This request ID has already been used. Start a new image request." });
    return;
  }

  const controller = new AbortController();
  const abortOnDisconnect = () => { if (!res.writableEnded) controller.abort(); };
  req.once("aborted", abortOnDisconnect);
  res.once("close", abortOnDisconnect);
  try {
    const generated = await generateImage({
      prompt,
      style,
      aspectRatio,
      brandContext: `${brand.name} — ${brand.industry}; brand voice: ${brand.brandVoice}`,
      signal: controller.signal,
    });
    if (controller.signal.aborted || res.destroyed) {
      await releaseGeneration({ workspaceId: workspace.id, requestId });
      return;
    }
    const completed = await completeGeneration({
      workspaceId: workspace.id,
      requestId,
      result: { title: "Generated image", body: "Image generation completed." },
    });
    if (!completed) {
      res.status(409).json({ error: "This generation reservation expired. Please try again." });
      return;
    }
    res.json({
      mimeType: generated.mimeType,
      data: generated.data,
      usage: await getUsageSummary(workspace),
    });
  } catch (error) {
    try { await releaseGeneration({ workspaceId: workspace.id, requestId }); }
    catch (releaseError) {
      req.log.error({ errorName: releaseError instanceof Error ? releaseError.name : "UnknownError" }, "Could not release failed image generation reservation");
    }
    if (controller.signal.aborted || res.destroyed || res.writableEnded) return;
    if (error instanceof AiProviderError) {
      res.status(error.statusCode).json({ error: error.publicMessage });
      return;
    }
    req.log.error({ errorName: error instanceof Error ? error.name : "UnknownError" }, "Image generation failed");
    res.status(502).json({ error: "Image generation failed. Please try again." });
  } finally {
    req.off("aborted", abortOnDisconnect);
    res.off("close", abortOnDisconnect);
  }
});

router.post("/generate", async (req, res): Promise<void> => {
  const userId = getAuthenticatedUserId(res);
  const workspace = await findWorkspaceForUser(userId);
  if (!workspace) {
    res.status(404).json({ error: "Workspace not found" });
    return;
  }

  const parsed = GenerateContentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!isAiProviderConfigured()) {
    res.status(503).json({ error: "AI generation is not configured" });
    return;
  }

  const input = parsed.data;
  const brand = await findBrandForWorkspace(input.brandId, workspace.id);
  if (!brand) {
    res.status(404).json({ error: "Brand not found" });
    return;
  }

  const prompt = serializeGenerationPrompt({
    brand: {
      name: brand.name,
      industry: brand.industry,
      voice: brand.brandVoice,
      targetAudience: brand.targetAudience,
      contentPillars: brand.contentPillars,
    },
    request: {
      platform: input.platform,
      contentType: input.contentType,
      topic: input.topic,
      objective: input.objective,
      tone: input.tone,
      callToAction: input.callToAction,
    },
  });
  if (prompt.length > MAX_GENERATION_PROMPT_CHARS) {
    res.status(413).json({
      error: "This brief and brand context are too large. Shorten them and try again.",
    });
    return;
  }

  let reservation: ReservationResult;
  try {
    reservation = await reserveGeneration({
      workspaceId: workspace.id,
      requestId: input.requestId,
      requestHash: fingerprintGenerationPrompt(prompt),
      plan: getPlanForWorkspace(workspace.plan),
      periodAnchor: workspace.plan === "free"
        ? workspace.createdAt
        : workspace.subscriptionStartedAt ?? (workspace.planRenewalAt
          ? new Date(workspace.planRenewalAt.getTime() - 30 * 24 * 60 * 60 * 1000)
          : workspace.createdAt),
    });
  } catch (err) {
    req.log.error(
      {
        requestId: input.requestId,
        errorName: err instanceof Error ? err.name : "UnknownError",
      },
      "Could not reserve generation usage",
    );
    res.status(503).json({
      error: "Generation service is temporarily unavailable. Try again shortly.",
    });
    return;
  }

  if (reservation.kind === "rate_limited") {
    res.setHeader("Retry-After", String(reservation.retryAfterSeconds));
    res.status(429).json({
      error: "Too many generation requests. Please wait before trying again.",
    });
    return;
  }
  if (reservation.kind === "quota_exhausted") {
    res.status(429).json({
      error: `You've used all ${reservation.limit} AI generations for this UTC calendar month.`,
    });
    return;
  }
  if (reservation.kind === "in_progress") {
    res.status(409).json({
      error: "This generation request is already being processed. Retry shortly.",
    });
    return;
  }
  if (reservation.kind === "idempotency_conflict") {
    res.status(409).json({
      error:
        "This request ID was already used with a different brief. Submit the changed brief with a new request ID.",
    });
    return;
  }
  if (reservation.kind === "cached") {
    res.json(
      GenerateContentResponse.parse({
        ...reservation.result,
        usage: await getUsageSummary(workspace),
      }),
    );
    return;
  }

  const abortController = new AbortController();
  const abortForClientDisconnect = () => {
    if (!res.writableEnded) abortController.abort();
  };
  req.once("aborted", abortForClientDisconnect);
  res.once("close", abortForClientDisconnect);
  try {
    const generated = await generateDraft({
      prompt,
      topic: input.topic,
      brandName: brand.name,
      signal: abortController.signal,
    });
    if (abortController.signal.aborted || res.destroyed) {
      await releaseGeneration({
        workspaceId: workspace.id,
        requestId: input.requestId,
      });
      return;
    }

    const completed = await completeGeneration({
      workspaceId: workspace.id,
      requestId: input.requestId,
      result: generated,
    });
    if (!completed) {
      if (!res.destroyed && !res.writableEnded) {
        res.status(409).json({
          error: "This generation request expired. Please submit it again.",
        });
      }
      return;
    }

    const result = GenerateContentResponse.parse({
      ...generated,
      usage: await getUsageSummary(workspace),
    });
    if (!res.destroyed && !res.writableEnded) {
      res.json(result);
    }
  } catch (err) {
    try {
      await releaseGeneration({
        workspaceId: workspace.id,
        requestId: input.requestId,
      });
    } catch (releaseError) {
      req.log.error(
        {
          errorName:
            releaseError instanceof Error ? releaseError.name : "UnknownError",
          requestId: input.requestId,
        },
        "Could not release a failed generation reservation",
      );
    }
    if (abortController.signal.aborted || res.destroyed || res.writableEnded) {
      return;
    }
    if (err instanceof AiProviderError) {
      req.log.warn(
        { provider: "gemini", statusCode: err.statusCode, code: err.code },
        "Content generation provider request failed",
      );
      res.status(err.statusCode).json({ error: err.publicMessage });
      return;
    }
    req.log.error(
      {
        requestId: input.requestId,
        errorName: err instanceof Error ? err.name : "UnknownError",
      },
      "Content generation could not be completed and recorded",
    );
    res.status(500).json({
      error: "Content generation could not be recorded. Retry this request shortly.",
    });
  } finally {
    req.off("aborted", abortForClientDisconnect);
    res.off("close", abortForClientDisconnect);
  }
});

export default router;
