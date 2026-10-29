# ContentFlow UI / Mobile Responsiveness Patch

## Included
- `artifacts/contentflow-ai/src/contentflow.css`

This is a focused drop-in replacement for the shared ContentFlow stylesheet. It keeps the existing page components and adds a global readability/contrast pass plus responsive refinements for landing, authentication, dashboard, content creation, library, calendar, brand management, onboarding, and dialogs.

## Apply
1. Make a backup of your current `artifacts/contentflow-ai/src/contentflow.css`.
2. Extract this ZIP into the root of your ContentFlow repository, preserving folder paths and allowing the file to replace the existing stylesheet.
3. Run the project's usual checks (`pnpm --filter contentflow-ai typecheck` if that script exists, then the frontend build).
4. Test at approximately 360px, 390px, 768px, 1024px, and desktop widths before deploying.

This patch only changes presentation styles. It does not modify payment, authentication, API, or database code.


V2 polish included:
- Softer, more consistent corner radii for common controls, cards, panels, chips, and dialogs.
- Lighter default borders with clearer hover/focus states.
- Subtle card hover lift and button press feedback.
- Gentle page/dialog entrance motion with reduced-motion support.
- No changes to application logic, API calls, authentication, or billing.
