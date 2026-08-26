import { Router } from "express";
import { createStopController } from "../controllers/StopController";
import { BusDataRepository } from "../repositories";
import { createStopService } from "../services/StopService";

const service = createStopService(BusDataRepository.getInstance());
const controller = createStopController(service);

const router = Router();

router.get("/nearby", controller.getNearbyStops);

export default router;
