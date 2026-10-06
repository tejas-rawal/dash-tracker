import { Router } from "express";
import { createHealthController } from "../controllers/HealthController";
import { BusDataRepository } from "../repositories";
import { createHealthService } from "../services/HealthService";

const service = createHealthService(BusDataRepository.getInstance());
const controller = createHealthController(service);

const router = Router();

router.get("/ready", controller.getReadiness);

export default router;
