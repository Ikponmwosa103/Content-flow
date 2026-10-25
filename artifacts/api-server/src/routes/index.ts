import { Router, type IRouter } from "express";
import healthRouter from "./health";
import plansRouter from "./plans";
import workspaceRouter from "./workspace";
import contentRouter from "./content";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(plansRouter);
router.use(workspaceRouter);
router.use(contentRouter);
router.use(dashboardRouter);

export default router;
