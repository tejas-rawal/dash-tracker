import type { Request, RequestHandler, Response } from "express";
import type { HealthService } from "../services/HealthService";

export interface HealthController {
    getLiveness: RequestHandler;
    getReadiness: RequestHandler;
}

export function createHealthController(service: HealthService): HealthController {
    // A constant: liveness must not depend on data state, the repository or DASH (D-02).
    const getLiveness: RequestHandler = (_req: Request, res: Response): void => {
        res.set("Cache-Control", "no-store");
        res.status(200).json({ status: "ok" });
    };

    const getReadiness: RequestHandler = (_req: Request, res: Response): void => {
        const report = service.getReadiness();
        res.set("Cache-Control", "no-store");
        res.status(report.status === "ready" ? 200 : 503).json(report);
    };

    return { getLiveness, getReadiness };
}
