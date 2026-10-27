import { Router } from "express";
import { createRecentsController } from "../controllers/RecentsController";
import { requireDeviceId } from "../middleware/requireDeviceId";
import { BusDataRepository, FavoritesRecentsRepository } from "../repositories";
import { createRecentsService } from "../services/RecentsService";

const recentsRepository = FavoritesRecentsRepository.getInstance();
const busDataRepository = BusDataRepository.getInstance();
const service = createRecentsService(recentsRepository, busDataRepository);
const controller = createRecentsController(service);

const router = Router();

router.use(requireDeviceId);

router.get("/", controller.listRecents);

export default router;
