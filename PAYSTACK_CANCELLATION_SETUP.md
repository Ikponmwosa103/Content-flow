# Paystack cancellation deployment checklist

This patch adds a Cancel subscription action, an authenticated cancellation API, Paystack recurring plan checkout, webhook handling, and a database migration. It does not deploy itself.

## Before deployment

1. In Paystack, create monthly NGN plans with these exact prices:
   - Starter: ₦3,000/month
   - Pro: ₦7,000/month
2. In Render's `Content-flow` service environment, set:
   - `PAYSTACK_SECRET_KEY` (server-side secret; never put this in Netlify)
   - `PAYSTACK_STARTER_PLAN_CODE` (Starter `PLN_...` code)
   - `PAYSTACK_PRO_PLAN_CODE` (Pro `PLN_...` code)
   - `PAYSTACK_CALLBACK_URL=https://content-flow-workspace.netlify.app/pricing?payment=callback`
3. In Paystack's webhook settings, use `https://content-flow-7w1p.onrender.com/api/billing/paystack/webhook` (replace the host if your Render URL changes). Enable `charge.success`, `subscription.create`, and `subscription.disable` events.
4. Merge these files into the current repository, then run `pnpm run db:check-migrations`, `pnpm run db:migrate:production`, and `pnpm run build`. Run the migration against the same production `DATABASE_URL` that the Render API uses.
5. Commit and push the changed files so Render and Netlify deploy them.
6. Test with Paystack test credentials and test plan codes before switching to live credentials.

## Important compatibility note

Previous checkouts used one-time transactions, not Paystack recurring plans. Those older payment rows do not contain a Paystack subscription code and email token, so the new cancel endpoint deliberately returns an error and does not pretend it cancelled an existing subscription. New recurring checkouts save these values from the signed `subscription.create` webhook. Do not announce successful cancellation unless Paystack confirms it.

The email token is stored in the server-side payments table so the backend can call Paystack's disable endpoint. Keep database access restricted and never return this token from any API.
