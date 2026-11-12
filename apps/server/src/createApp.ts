import express, { type Express } from "express";
import { createCorsMiddleware } from "./api/middleware/cors";
import router from "./api/routes";
import { environment } from "./config";

// The one app wiring shared by the server entry point and every route test (Phase 18 D-12).
export function createApp(): Express {
    const app = express();
    // An integer hop count, so req.ip (and with it the rate-limit key) is the client address the trusted proxies saw.
    // Never `true`, which trusts every hop and lets any client pick its own key. Works alike behind any LB or PaaS
    // (D-17, D-18).
    app.set("trust proxy", environment.server.trustProxyHops);
    // Ahead of the JSON body parser and every router, so CORS runs before the per-route upstreamRateLimiter and
    // streamConcurrencyCap: an allowed preflight is answered before any rate-limit token is spent (Phase 18 D-13).
    app.use(createCorsMiddleware(environment.cors.allowedOrigins));

    // Middleware to parse JSON
    app.use(express.json());

    app.get("/", (_req, res) => {
        res.jsonp({ message: "Hello World" });
    });

    // V1 API
    app.use("/api/v1", router);

    return app;
}
