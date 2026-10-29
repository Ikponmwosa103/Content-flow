CONTENTFLOW AI — IMAGE GENERATION STARTER PATCH
================================================

Included files
--------------
frontend/ImageGenerator.tsx
  Responsive React image-generator UI. Uses the existing API base URL and an
  access-token getter supplied by your app. It expects POST /api/images/generate.

frontend/image-generator.css
  Dark navy / teal-cyan styles, responsive layout, preview and download action.

backend/image-generation-route.example.ts
  Gemini image-generation route TEMPLATE. It is intentionally marked as an
  integration template; it is not safe to register unchanged in production.
  Authentication, shared-database credit reservation/refund, and image storage
  must be wired to the existing backend before launch.

backend/plan-allowances.ts
  Proposed allowances: Free 10 text + 2 images; Starter NGN 3,000 = 100 text +
  20 images; Pro NGN 7,000 = 300 text + 50 images.

IMPORTANT STATUS
----------------
This is a starter patch, not a completed modification of your live website.
Your existing project already has Gemini text generation. This patch does not
replace that integration. It introduces a UI and an example image endpoint that
must be integrated with your current auth, billing, database and usage logic.
No live deployment or database changes have been made by this ZIP.

Integration checklist
---------------------
1. Copy ImageGenerator.tsx and image-generator.css into the frontend source,
   adjusting the relative CSS import path if needed.
2. Add a navigation entry/page route for ImageGenerator and pass:
     apiBaseUrl = your existing API URL
     getAccessToken = your existing Clerk/auth token getter
     remainingImages = value from the authenticated usage summary endpoint
3. In the API server, adapt the route template to the installed @google/genai
   version and current Express conventions, then register it in routes/index.ts.
4. Apply requireAuth and resolve the user/workspace from the authenticated
   request, never from request body fields.
5. Implement atomic image-credit reservation using the existing database and
   refund only if provider generation fails. Failed attempts should not consume
   credits. Ensure duplicate requests cannot double-deduct.
6. Persist generated image bytes in the project's existing storage/library and
   return a URL. The example data URL is suitable only for a basic smoke test;
   it is not a durable image library.
7. Add image allowance fields to the canonical plan/usage service and dashboard.
   Do not treat the example plan-allowances.ts as a database migration.
8. Set GEMINI_API_KEY as a secret on the backend host (e.g. Render), never in
   Vite/browser environment variables. Optional GEMINI_IMAGE_MODEL can select
   the image model supported by the configured Gemini API account.
9. Confirm the model name, image generation availability, pricing and API SDK
   method against the current official Gemini docs before enabling production.
10. Run the repo's typecheck/tests and manually test successful, failed,
    unauthenticated, exhausted-credit, and duplicate-request cases.

No API key is included. Image generation may incur separate API charges; test
with a spending limit before enabling it for paying users.
