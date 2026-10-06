import type { Request, RequestHandler, Response } from "express";
import type { HealthService } from "../services/HealthService";

export interface HealthController {
    getReadiness: RequestHandler;
}

export function createHealthController(service: HealthService): HealthController {
    const getReadiness: RequestHandler = (_req: Request, res: Response): void => {
        const report = service.getReadiness();
        res.set("Cache-Control", "no-store");
        res.status(report.status === "ready" ? 200 : 503).json(report);
    };

    return { getReadiness };
}
