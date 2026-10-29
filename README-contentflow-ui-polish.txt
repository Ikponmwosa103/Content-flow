ContentFlow AI — UI polish patch

Goal: replace the overly bright cyan/high-contrast styling with a restrained professional palette: warm off-white workspace, deep slate sidebar, muted sage-green accents, subtle borders, consistent rounded cards, and clearer dashboard hierarchy.

Apply:
1. In your project, open artifacts/contentflow-ai/src/contentflow.css.
2. Append the contents of contentflow-ui-polish.css to the END of that file (so these overrides take precedence).
3. Run the frontend build and check dashboard, Create, Library, Calendar, Brands, Plans, and Settings at desktop and mobile widths.
4. Deploy the built frontend to Netlify after testing.

This is a CSS-only polish patch. It does not change data, API routes, authentication, billing, or generation logic. If the live Netlify version uses different class names than this source archive, the selectors will need to be mapped to that deployed build before the change takes effect.
