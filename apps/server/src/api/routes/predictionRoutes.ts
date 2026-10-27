import { Router } from "express";
import { createNearbyPredictionController } from "../controllers/NearbyPredictionController";
import { createPredictionController } from "../controllers/PredictionController";
import { createPredictionStreamController } from "../controllers/PredictionStreamController";
import { streamConcurrencyCap } from "../middleware/streamConcurrencyCap";
import { upstreamRateLimiter } from "../middleware/upstreamRateLimit";
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

router.get("/", upstreamRateLimiter, controller.getPredictions);
// One shared bucket, attached per handler (D-10, D-16). An SSE connect is counted once when it opens; the
// limiter never touches a stream that is already open (D-11). The stream cap runs after the bucket, so every connect
// is still counted once, and it bounds how many streams one client IP holds open (Phase 16 D-01, D-07).
router.get("/stream", upstreamRateLimiter, streamConcurrencyCap, streamController.getPredictionsStream);
router.get("/nearby", upstreamRateLimiter, nearbyController.getNearbyPredictions);

export default router;
