import { Router } from "express";
import { createBusRouteController } from "../controllers/BusRouteController";
import { createStopController } from "../controllers/StopController";
import { BusDataRepository } from "../repositories";
import { createBusRouteService } from "../services/BusRouteService";
import { createStopService } from "../services/StopService";

const service = createBusRouteService(BusDataRepository.getInstance());
const controller = createBusRouteController(service);

const stopService = createStopService(BusDataRepository.getInstance());
const stopController = createStopController(stopService);

const router = Router();

router.get("/all", controller.getAllRoutes);
router.get("/:shortName", controller.getRoute);
router.get("/:shortName/stops", stopController.getStopsForRoute);

export default router;
