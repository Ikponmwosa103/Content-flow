
import { Router } from "express";
import healthRouter from "./health";
import plansRouter from "./plans";
import billingRouter from "./billing";
import workspaceRouter from "./workspace";
import contentRouter from "./content";
import dashboardRouter from "./dashboard";

const router = Router();

router.use(healthRouter);
router.use(plansRouter);

// Handle billing routes, including Paystack's public signed webhook,
// before routers that apply authentication to every request.
router.use(billingRouter);

router.use(workspaceRouter);
router.use(contentRouter);
router.use(dashboardRouter);

export default router;
