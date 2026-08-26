import { Router } from "express";
import { createBusRouteController } from "../controllers/BusRouteController";
import { BusDataRepository } from "../repositories";
import { createBusRouteService } from "../services/BusRouteService";

const service = createBusRouteService(BusDataRepository.getInstance());
const controller = createBusRouteController(service);

const router = Router();

router.get("/all", controller.getAllRoutes);
router.get("/:shortName", controller.getRoute);

export default router;
