/**
 * INTEGRATION TEMPLATE — adapt to the existing API server before registering.
 * Do not copy this file into production unchanged: wire it to the app's existing
 * requireAuth middleware, workspace lookup, plan/usage service and image storage.
 * Never expose GEMINI_API_KEY to the browser.
 */
import { Router } from "express";
import { GoogleGenAI } from "@google/genai";
// import { requireAuth } from "../middlewares/requireAuth";
// import { reserveImageCredit, refundImageCredit } from "../lib/image-usage";

const router = Router();
const MAX_PROMPT_CHARS = 2000;
const ALLOWED_RATIOS = new Set(["1:1", "4:5", "9:16", "16:9"]);
const ALLOWED_STYLES = new Set([
  "Photorealistic", "Editorial", "3D render", "Illustration", "Minimalist",
  "Cinematic", "Watercolor", "Social media graphic",
]);

router.post("/api/images/generate", /* requireAuth, */ async (req, res) => {
  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
  const style = typeof req.body?.style === "string" ? req.body.style : "Photorealistic";
  const aspectRatio = typeof req.body?.aspectRatio === "string" ? req.body.aspectRatio : "1:1";
  if (!prompt || prompt.length > MAX_PROMPT_CHARS) {
    return res.status(400).json({ error: `Prompt must be between 1 and ${MAX_PROMPT_CHARS} characters.` });
  }
  if (!ALLOWED_STYLES.has(style) || !ALLOWED_RATIOS.has(aspectRatio)) {
    return res.status(400).json({ error: "Choose a supported style and aspect ratio." });
  }
  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({ error: "Image generation is not configured yet." });
  }

  // IMPORTANT: Before invoking the model, authenticate the user and atomically
  // reserve one image credit from the shared database. Refund it on provider failure.
  // Do not trust a userId, plan, or credit count sent by the browser.
  let reservation: { userId: string; requestId: string } | null = null;
  try {
    // reservation = await reserveImageCredit(req.auth.userId); // implement using existing usage service
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const model = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
    const response = await ai.models.generateContent({
      model,
      contents: `Create one polished image for a content creator. Style: ${style}. Aspect ratio: ${aspectRatio}. Prompt: ${prompt}`,
      config: { responseModalities: ["IMAGE", "TEXT"] },
    });
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((part: any) => part.inlineData?.data);
    if (!imagePart?.inlineData?.data) throw new Error("Image provider returned no image data.");

    // For production, persist bytes to the existing object storage and return its URL.
    // Avoid returning large base64 blobs if images are stored in the shared library.
    const mimeType = imagePart.inlineData.mimeType || "image/png";
    const dataUrl = `data:${mimeType};base64,${imagePart.inlineData.data}`;
    return res.json({ dataUrl, mimeType, prompt, remainingImages: null });
  } catch (error) {
    // if (reservation) await refundImageCredit(reservation);
    console.error("Image generation failed", error);
    return res.status(502).json({ error: "Image generation failed. No credit should be consumed; please try again." });
  }
});

export default router;
