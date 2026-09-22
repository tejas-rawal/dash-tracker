import { Router } from "express";
import { createVehicleController } from "../controllers/VehicleController";
import { BusDataRepository } from "../repositories";
import { createVehicleService } from "../services/VehicleService";

const service = createVehicleService(BusDataRepository.getInstance());
const controller = createVehicleController(service);

const router = Router();

router.get("/", controller.getVehiclePositions);

export default router;
