import { Router, type IRouter } from "express";
import { ListPlansResponse } from "@workspace/api-zod";
import { PLAN_OPTIONS } from "../lib/plans";

const router: IRouter = Router();

router.get("/plans", (_req, res): void => {
  res.json(ListPlansResponse.parse(PLAN_OPTIONS));
});

export default router;
