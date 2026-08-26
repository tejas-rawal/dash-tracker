import { Router } from "express";
import { createPredictionController } from "../controllers/PredictionController";
import { BusDataRepository } from "../repositories";
import { createPredictionService } from "../services/PredictionService";

const service = createPredictionService(BusDataRepository.getInstance());
const controller = createPredictionController(service);

const router = Router();

router.get("/", controller.getPredictions);

export default router;
