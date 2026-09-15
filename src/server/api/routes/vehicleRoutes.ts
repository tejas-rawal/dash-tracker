import { Router } from "express";
import { createVehicleController } from "../controllers/VehicleController";
import { createVehicleService } from "../services/VehicleService";

const service = createVehicleService();
const controller = createVehicleController(service);

const router = Router();

router.get("/", controller.getVehiclePositions);

export default router;
