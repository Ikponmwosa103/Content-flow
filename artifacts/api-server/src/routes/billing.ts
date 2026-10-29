import { Router, type IRouter, type Request } from "express";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, generationRequestsTable, paymentsTable, usageTable, workspacesTable } from "@workspace/db";
import { requireAuth, getAuthenticatedUserId } from "../middlewares/requireAuth";
import { PLAN_OPTIONS } from "../lib/plans";
import { monthlyAnniversary } from "../lib/usage-period";

const router: IRouter = Router();

const PAYSTACK_API = "https://api.paystack.co";

type PaystackInitializeResponse = {
  status?: boolean;
  message?: string;
  data?: {
    authorization_url?: string;
    access_code?: string;
    reference?: string;
  };
};

type PaystackVerifyResponse = {
  status?: boolean;
  message?: string;
  data?: {
    status?: string;
    reference?: string;
    amount?: number;
    currency?: string;
    paid_at?: string | null;
    metadata?: {
      workspaceId?: number;
      planId?: string;
    } | null;
  };
};

function getPaystackSecret(): string {
  const secret = process.env.PAYSTACK_SECRET_KEY?.trim();

  if (!secret) {
    throw new Error("Paystack is not configured on the server.");
  }

  return secret;
}

function validEmail(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  );
}

function validPlan(
  value: unknown,
): value is "starter" | "pro" {
  return value === "starter" || value === "pro";
}

function getPaystackPlanCode(planId: "starter" | "pro"): string | null {
  const value = planId === "starter"
    ? process.env.PAYSTACK_STARTER_PLAN_CODE
    : process.env.PAYSTACK_PRO_PLAN_CODE;
  const code = value?.trim();
  return code && /^PLN_[A-Za-z0-9]+$/.test(code) ? code : null;
}

function validSignature(
  rawBody: Buffer,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature || !/^[a-f0-9]{128}$/i.test(signature)) {
    return false;
  }

  const expected = createHmac("sha512", secret)
    .update(rawBody)
    .digest();

  const supplied = Buffer.from(signature, "hex");

  return (
    supplied.length === expected.length &&
    timingSafeEqual(supplied, expected)
  );
}

/**
 * Initialize a checkout.
 * The server determines the price; the client cannot choose the amount.
 */
router.post("/billing/initialize", requireAuth, async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(res);
    const { planId, email } = req.body ?? {};

    if (!validPlan(planId)) {
      res.status(400).json({ error: "Choose a valid paid plan." });
      return;
    }

    if (!validEmail(email)) {
      res.status(400).json({ error: "Enter a valid email address." });
      return;
    }

    const plan = PLAN_OPTIONS.find((item) => item.id === planId);

    if (!plan || plan.monthlyPriceNgn <= 0) {
      res.status(400).json({ error: "This plan is not available for purchase." });
      return;
    }

    const [workspace] = await db
      .select()
      .from(workspacesTable)
      .where(eq(workspacesTable.ownerId, userId))
      .limit(1);

    if (!workspace) {
      res.status(404).json({
        error: "Workspace not found. Complete workspace setup first.",
      });
      return;
    }

    if (workspace.plan === planId && workspace.subscriptionStatus === "active") {
      res.status(409).json({ error: "You are already using this plan." });
      return;
    }

    const secret = getPaystackSecret();
    const paystackPlanCode = getPaystackPlanCode(planId);
    if (!paystackPlanCode) {
      res.status(503).json({
        error: `Recurring billing is not configured for ${plan.name}. Set the matching Paystack plan code in the API environment.`,
      });
      return;
    }

    const reference = `cf_${randomBytes(18).toString("hex")}`;
    const amountKobo = plan.monthlyPriceNgn * 100;

    // Store the pending payment before contacting Paystack.
    await db.insert(paymentsTable).values({
      workspaceId: workspace.id,
      reference,
      planId,
      amountKobo,
      currency: "NGN",
      status: "pending",
      customerEmail: email.trim().toLowerCase(),
    });

    const apiResponse = await fetch(`${PAYSTACK_API}/transaction/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: email.trim(),
        amount: amountKobo,
        currency: "NGN",
        reference,
        plan: paystackPlanCode,
        callback_url: process.env.PAYSTACK_CALLBACK_URL,
        metadata: {
          workspaceId: workspace.id,
          ownerId: userId,
          planId,
        },
      }),
      signal: AbortSignal.timeout(20000),
    });

    const result = (await apiResponse.json()) as PaystackInitializeResponse;

    if (
      !apiResponse.ok ||
      result.status !== true ||
      !result.data?.authorization_url ||
      !result.data.authorization_url.startsWith(
        "https://checkout.paystack.com/",
      )
    ) {
      await db
        .update(paymentsTable)
        .set({ status: "failed" })
        .where(eq(paymentsTable.reference, reference));

      res.status(502).json({
        error: "Paystack could not initialize checkout. Please try again.",
      });
      return;
    }

    await db
      .update(paymentsTable)
      .set({
        authorizationUrl: result.data.authorization_url,
        accessCode: result.data.access_code ?? null,
      })
      .where(eq(paymentsTable.reference, reference));

    res.json({
      authorizationUrl: result.data.authorization_url,
      reference,
    });
  } catch (error) {
    console.error("Paystack initialization failed:", error);

    res.status(500).json({
      error:
        error instanceof Error &&
        error.message === "Paystack is not configured on the server."
          ? error.message
          : "Unable to initialize payment. Please try again.",
    });
  }
});

/**
 * Verify a transaction directly with Paystack.
 * Never activate a plan based only on the browser redirect.
 */
async function verifyAndActivate(reference: string): Promise<boolean> {
  const secret = getPaystackSecret();

  const [payment] = await db
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.reference, reference))
    .limit(1);

  if (!payment) return false;

  // A repeated callback or webhook must not process the same payment twice.
  if (payment.status === "success") return true;

  if (payment.status !== "pending") return false;

  const response = await fetch(
    `${PAYSTACK_API}/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(20000),
    },
  );

  if (!response.ok) return false;

  const result = (await response.json()) as PaystackVerifyResponse;
  const transaction = result.data;

  if (
    result.status !== true ||
    transaction?.status !== "success" ||
    transaction.reference !== payment.reference ||
    transaction.amount !== payment.amountKobo ||
    transaction.currency !== payment.currency
  ) {
    return false;
  }

  const paidAt = transaction.paid_at
    ? new Date(transaction.paid_at)
    : new Date();

  if (Number.isNaN(paidAt.getTime())) return false;

  // Keep the payment and workspace update in one database transaction.
  const activated = await db.transaction(async (tx) => {
    // Lock the payment row so concurrent browser callbacks/webhooks serialize.
    const [currentPayment] = await tx
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.reference, reference))
      .for("update")
      .limit(1);

    if (!currentPayment) return false;
    // A successful reference is idempotent: never reapply plan/usage resets.
    if (currentPayment.status === "success") return true;
    if (currentPayment.status !== "pending") return false;

    const [workspace] = await tx
      .select({ id: workspacesTable.id })
      .from(workspacesTable)
      .where(eq(workspacesTable.id, currentPayment.workspaceId))
      .for("update")
      .limit(1);
    if (!workspace) return false;
    // Share the generation subsystem's advisory lock so activation cannot race
    // a reservation or successful completion for this workspace.
    await tx.execute(sql`select pg_advisory_xact_lock(44110, ${currentPayment.workspaceId})`);

    const [markedPaid] = await tx
      .update(paymentsTable)
      .set({ status: "success", paidAt, updatedAt: new Date() })
      .where(
        and(
          eq(paymentsTable.reference, reference),
          eq(paymentsTable.status, "pending"),
        ),
      )
      .returning({ id: paymentsTable.id });
    if (!markedPaid) return false;

    // If a plan is activated on a date that already has a usage row (for
    // example Free -> Starter on the registration anniversary), reuse that
    // date-keyed row but clear its counters. Fail in-flight requests from the
    // old allowance so a late AI response cannot consume the new plan quota.
    const activationPeriodStart = paidAt.toISOString().slice(0, 10);
    await tx
      .update(generationRequestsTable)
      .set({ status: "failed", response: null, updatedAt: new Date() })
      .where(
        and(
          eq(generationRequestsTable.workspaceId, currentPayment.workspaceId),
          eq(generationRequestsTable.periodStart, activationPeriodStart),
          eq(generationRequestsTable.status, "pending"),
        ),
      );
    await tx
      .update(usageTable)
      .set({ generationCount: 0, reservedCount: 0, updatedAt: new Date() })
      .where(
        and(
          eq(usageTable.workspaceId, currentPayment.workspaceId),
          eq(usageTable.periodStart, activationPeriodStart),
        ),
      );

    await tx
      .update(workspacesTable)
      .set({
        plan: currentPayment.planId,
        subscriptionStatus: "active",
        subscriptionStartedAt: paidAt,
        planRenewalAt: monthlyAnniversary(paidAt, 1),
        updatedAt: new Date(),
      })
      .where(eq(workspacesTable.id, currentPayment.workspaceId));

    return true;
  });

  return activated;
}

/**
 * Browser callback verification.
 * Authentication ensures one user cannot verify another user's payment.
 */
router.get(
  "/billing/verify/:reference",
  requireAuth,
  async (req, res) => {
    try {
      const userId = getAuthenticatedUserId(res);
      const reference = req.params.reference;

      if (
        typeof reference !== "string" ||
        !/^cf_[a-f0-9]{36}$/.test(reference)
      ) {
        res.status(400).json({ error: "Invalid payment reference." });
        return;
      }

      const [payment] = await db
        .select()
        .from(paymentsTable)
        .innerJoin(
          workspacesTable,
          eq(paymentsTable.workspaceId, workspacesTable.id),
        )
        .where(
          and(
            eq(paymentsTable.reference, reference),
            eq(workspacesTable.ownerId, userId),
          ),
        )
        .limit(1);

      if (!payment) {
        res.status(404).json({ error: "Payment not found." });
        return;
      }

      const activated = await verifyAndActivate(reference);

      if (!activated) {
        res.status(402).json({
          error: "Payment is not yet confirmed as successful.",
        });
        return;
      }

      res.json({ success: true, reference });
    } catch (error) {
      console.error("Paystack verification failed:", error);
      res.status(500).json({ error: "Could not verify this payment." });
    }
  },
);

/**
 * Immediately cancel a recurring Paystack subscription. Paid access is removed
 * only after Paystack confirms that the subscription was disabled.
 */
router.post("/billing/cancel", requireAuth, async (_req, res) => {
  try {
    const userId = getAuthenticatedUserId(res);
    const [workspace] = await db
      .select()
      .from(workspacesTable)
      .where(eq(workspacesTable.ownerId, userId))
      .limit(1);

    if (!workspace) {
      res.status(404).json({ error: "Workspace not found." });
      return;
    }

    if (workspace.plan === "free" || workspace.subscriptionStatus === "free") {
      res.status(409).json({ error: "Your workspace is already on Free Forever." });
      return;
    }

    const [payment] = await db
      .select()
      .from(paymentsTable)
      .where(and(
        eq(paymentsTable.workspaceId, workspace.id),
        eq(paymentsTable.planId, workspace.plan),
        eq(paymentsTable.status, "success"),
        sql`${paymentsTable.paystackSubscriptionCode} IS NOT NULL`,
        sql`${paymentsTable.paystackEmailToken} IS NOT NULL`,
        sql`${paymentsTable.subscriptionCancelledAt} IS NULL`,
      ))
      .orderBy(desc(paymentsTable.createdAt))
      .limit(1);

    if (!payment?.paystackSubscriptionCode || !payment.paystackEmailToken) {
      res.status(409).json({
        error: "We could not find a confirmed recurring Paystack subscription for this plan. No plan change was made. Please contact support to review this older payment.",
      });
      return;
    }

    const response = await fetch(`${PAYSTACK_API}/subscription/disable`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getPaystackSecret()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code: payment.paystackSubscriptionCode,
        token: payment.paystackEmailToken,
      }),
      signal: AbortSignal.timeout(20000),
    });
    const result = await response.json().catch(() => ({})) as {
      status?: boolean;
      message?: string;
    };

    if (!response.ok || result.status !== true) {
      console.error("Paystack subscription cancellation was not confirmed:", result.message);
      res.status(502).json({
        error: "Paystack could not confirm cancellation. Your current plan has not been changed. Please try again.",
      });
      return;
    }

    const cancelledAt = new Date();
    const resultAfterCancellation = await db.transaction(async (tx) => {
      const [lockedWorkspace] = await tx
        .select()
        .from(workspacesTable)
        .where(eq(workspacesTable.id, workspace.id))
        .for("update")
        .limit(1);
      if (!lockedWorkspace) throw new Error("Workspace not found during cancellation.");

      const [latestPayment] = await tx.select({ id: paymentsTable.id })
        .from(paymentsTable)
        .where(and(
          eq(paymentsTable.workspaceId, workspace.id),
          eq(paymentsTable.planId, payment.planId),
          eq(paymentsTable.status, "success"),
          sql`${paymentsTable.subscriptionCancelledAt} IS NULL`,
        ))
        .orderBy(desc(paymentsTable.createdAt))
        .limit(1);
      const downgraded = lockedWorkspace.plan === payment.planId && latestPayment?.id === payment.id;
      if (downgraded) {
        await tx.update(workspacesTable).set({
          plan: "free",
          subscriptionStatus: "free",
          subscriptionStartedAt: null,
          planRenewalAt: null,
          updatedAt: cancelledAt,
        }).where(eq(workspacesTable.id, workspace.id));
      }
      await tx.update(paymentsTable).set({
        subscriptionCancelledAt: cancelledAt,
        paystackEmailToken: null,
        updatedAt: cancelledAt,
      }).where(eq(paymentsTable.id, payment.id));
      return { plan: downgraded ? "free" : lockedWorkspace.plan, downgraded };
    });

    res.json({
      success: true,
      plan: resultAfterCancellation.plan,
      message: resultAfterCancellation.downgraded
        ? "Your Paystack subscription was cancelled and your workspace is now on Free Forever."
        : "The Paystack subscription was cancelled. A newer active plan was preserved.",
    });
  } catch (error) {
    console.error("Subscription cancellation failed:", error);
    res.status(500).json({ error: "Could not cancel the subscription. Your plan has not been changed unless Paystack already confirmed cancellation." });
  }
});

/**
 * Paystack webhook.
 * This route expects rawBody to be captured by the JSON parser's verify hook.
 * It does not use Clerk authentication.
 */
router.post("/billing/paystack/webhook", async (req: Request, res) => {
  try {
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    const signature = req.header("x-paystack-signature");
    const secret = getPaystackSecret();

    if (
      !rawBody ||
      !validSignature(rawBody, signature, secret)
    ) {
      res.status(401).json({ error: "Invalid webhook signature." });
      return;
    }

    const event = req.body?.event;
    const data = req.body?.data;

    if (event === "charge.success") {
      const reference = data?.reference;
      if (typeof reference === "string" && /^cf_[a-f0-9]{36}$/.test(reference)) {
        await verifyAndActivate(reference);
      }
    }

    if (event === "subscription.create") {
      const subscriptionCode = data?.subscription_code;
      const emailToken = data?.email_token;
      const customerEmail = typeof data?.customer?.email === "string"
        ? data.customer.email.trim().toLowerCase()
        : null;
      const receivedPlanCode = typeof data?.plan?.plan_code === "string"
        ? data.plan.plan_code
        : typeof data?.plan === "string" ? data.plan : null;
      const starterPlanCode = getPaystackPlanCode("starter");
      const proPlanCode = getPaystackPlanCode("pro");
      const planId = receivedPlanCode && starterPlanCode && receivedPlanCode === starterPlanCode
        ? "starter"
        : receivedPlanCode && proPlanCode && receivedPlanCode === proPlanCode ? "pro" : null;

      if (typeof subscriptionCode === "string" && typeof emailToken === "string" && customerEmail && planId) {
        const [candidate] = await db.select({ id: paymentsTable.id })
          .from(paymentsTable)
          .where(and(
            eq(paymentsTable.customerEmail, customerEmail),
            eq(paymentsTable.planId, planId),
            sql`${paymentsTable.status} IN ('pending', 'success')`,
            sql`${paymentsTable.paystackSubscriptionCode} IS NULL`,
          ))
          .orderBy(desc(paymentsTable.createdAt))
          .limit(1);
        if (candidate) {
          await db.update(paymentsTable).set({
            paystackSubscriptionCode: subscriptionCode,
            paystackEmailToken: emailToken,
            updatedAt: new Date(),
          }).where(eq(paymentsTable.id, candidate.id));
        }
      }
    }

    if (event === "subscription.disable") {
      const subscriptionCode = data?.subscription_code;
      if (typeof subscriptionCode === "string") {
        const [payment] = await db.select().from(paymentsTable)
          .where(eq(paymentsTable.paystackSubscriptionCode, subscriptionCode))
          .limit(1);
        if (payment) {
          const cancelledAt = new Date();
          await db.transaction(async (tx) => {
            const [latestPayment] = await tx.select({ id: paymentsTable.id })
              .from(paymentsTable)
              .where(and(
                eq(paymentsTable.workspaceId, payment.workspaceId),
                eq(paymentsTable.planId, payment.planId),
                eq(paymentsTable.status, "success"),
                sql`${paymentsTable.subscriptionCancelledAt} IS NULL`,
              ))
              .orderBy(desc(paymentsTable.createdAt))
              .limit(1);
            await tx.update(paymentsTable).set({
              subscriptionCancelledAt: cancelledAt,
              paystackEmailToken: null,
              updatedAt: cancelledAt,
            }).where(eq(paymentsTable.id, payment.id));
            if (latestPayment?.id === payment.id) {
              await tx.update(workspacesTable).set({
                plan: "free",
                subscriptionStatus: "free",
                subscriptionStartedAt: null,
                planRenewalAt: null,
                updatedAt: cancelledAt,
              }).where(and(
                eq(workspacesTable.id, payment.workspaceId),
                eq(workspacesTable.plan, payment.planId),
              ));
            }
          });
        }
      }
    }

    // Return success for valid events so Paystack does not retry needlessly.
    res.sendStatus(200);
  } catch (error) {
    console.error("Paystack webhook failed:", error);
    res.sendStatus(500);
  }
});

export default router;