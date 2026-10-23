import { Router } from "express";
import { createVehicleController } from "../controllers/VehicleController";
import { upstreamRateLimiter } from "../middleware/upstreamRateLimit";
import { BusDataRepository } from "../repositories";
import { createVehicleService } from "../services/VehicleService";

const service = createVehicleService(BusDataRepository.getInstance());
const controller = createVehicleController(service);

const router = Router();

router.get("/", upstreamRateLimiter, controller.getVehiclePositions);

export default router;
