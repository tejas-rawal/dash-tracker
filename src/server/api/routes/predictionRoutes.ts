import { Router } from "express";
import { createNearbyPredictionController } from "../controllers/NearbyPredictionController";
import { createPredictionController } from "../controllers/PredictionController";
import { createPredictionStreamController } from "../controllers/PredictionStreamController";
import { BusDataRepository, FavoritesRecentsRepository, ServiceAlertRepository } from "../repositories";
import { createNearbyPredictionService } from "../services/NearbyPredictionService";
import { createPredictionService } from "../services/PredictionService";
import { createPredictionStreamService } from "../services/PredictionStreamService";

const service = createPredictionService(BusDataRepository.getInstance(), FavoritesRecentsRepository.getInstance());
const controller = createPredictionController(service);
const streamService = createPredictionStreamService(service);
const streamController = createPredictionStreamController(streamService);
const nearbyService = createNearbyPredictionService(ServiceAlertRepository.getInstance());
const nearbyController = createNearbyPredictionController(nearbyService);

const router = Router();

router.get("/", controller.getPredictions);
router.get("/stream", streamController.getPredictionsStream);
router.get("/nearby", nearbyController.getNearbyPredictions);

export default router;
