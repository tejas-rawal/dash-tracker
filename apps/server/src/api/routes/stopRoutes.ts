import { Router } from "express";
import { createStopController } from "../controllers/StopController";
import { BusDataRepository, ServiceAlertRepository } from "../repositories";
import { createStopService } from "../services/StopService";

const service = createStopService(BusDataRepository.getInstance(), ServiceAlertRepository.getInstance());
const controller = createStopController(service);

const router = Router();

router.get("/nearby", controller.getNearbyStops);

export default router;
