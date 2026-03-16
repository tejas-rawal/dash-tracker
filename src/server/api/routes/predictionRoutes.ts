import { Router } from "express";
import { getPredictions } from "../controllers/PredictionController";

const router = Router();

router.get("/", getPredictions);

export default router;
