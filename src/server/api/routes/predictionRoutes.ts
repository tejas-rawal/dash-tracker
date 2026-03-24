import { Router } from "express";
import { createPredictionController } from "../controllers/PredictionController";
import { createPredictionService } from "../services/PredictionService";
import { BusDataRepository } from "../repositories";

const service = createPredictionService(BusDataRepository.getInstance());
const controller = createPredictionController(service);

const router = Router();

router.get("/", controller.getPredictions);

export default router;
