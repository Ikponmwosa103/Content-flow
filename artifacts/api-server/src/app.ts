import express, { type Express } from "express";
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import pinoHttp from "pino-http";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";
import { getAllowedCorsOrigins, isAllowedCorsOrigin } from "./lib/cors-policy";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
const allowedCorsOrigins = getAllowedCorsOrigins();
app.use(
  cors((req, callback) => {
    const origin = req.header("Origin");
    const allowed = isAllowedCorsOrigin(
      origin,
      req.header("host"),
      allowedCorsOrigins,
    );
    callback(null, {
      credentials: true,
      origin: origin && allowed ? origin : false,
    });
  }),
);
// CORS must run before this route so a Netlify-hosted Clerk client can use the
// API's Clerk proxy endpoint when VITE_CLERK_PROXY_URL is configured.
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
// Capture the exact request bytes in the same parser that decodes JSON. A
// second JSON parser cannot reliably capture raw bytes after the first consumes
// the stream, which would break Paystack signature verification.
app.use(
  express.json({
    limit: "32kb",
    verify: (req, _res, buffer) => {
      (req as typeof req & { rawBody?: Buffer }).rawBody = Buffer.from(buffer);
    },
  }),
);
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

export default app;
