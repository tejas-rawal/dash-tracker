import { Router } from "express";
import { createPredictionController } from "../controllers/PredictionController";
import { createPredictionStreamController } from "../controllers/PredictionStreamController";
import { BusDataRepository } from "../repositories";
import { createPredictionService } from "../services/PredictionService";
import { createPredictionStreamService } from "../services/PredictionStreamService";

const service = createPredictionService(BusDataRepository.getInstance());
const controller = createPredictionController(service);
const streamService = createPredictionStreamService(service);
const streamController = createPredictionStreamController(streamService);

const router = Router();

router.get("/", controller.getPredictions);
router.get("/stream", streamController.getPredictionsStream);

export default router;
