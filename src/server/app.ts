import express from "express";
import { BusDataRepository, FavoritesRecentsRepository, ServiceAlertRepository } from "./api/repositories";
import router from "./api/routes";
import { createServiceAlertPollService } from "./api/services/ServiceAlertPollService";
import { createServiceAlertService } from "./api/services/ServiceAlertService";
import { environment, logger, registerProcessErrorHandlers } from "./config";

// Registered before the alert poll and repository init start, so rejections during boot are caught too.
registerProcessErrorHandlers();

const app = express();
const port = environment.server.port;

// Middleware to parse JSON
app.use(express.json());

app.get("/", (_req, res) => {
    res.jsonp({ message: "Hello World" });
});

// V1 API
app.use("/api/v1", router);

// Initialize repository data before accepting requests
const repository = BusDataRepository.getInstance();
const favoritesRecentsRepository = FavoritesRecentsRepository.getInstance();

// Service alerts poll is boot-triggered and fully independent of BusDataRepository's
// startup-blocking init chain below (D-06/D-07) — it never awaits or gates app.listen().
const serviceAlertPollService = createServiceAlertPollService(
    createServiceAlertService(),
    ServiceAlertRepository.getInstance(),
);
serviceAlertPollService.start();

Promise.all([repository.initialize(), favoritesRecentsRepository.initialize()])
    .then(() => {
        const server = app.listen(port, () => {
            logger.info(`Server is running on port ${port}`);
        });

        // graceful shutdown
        const shutdown = (): void => {
            server.close(async (): Promise<void> => {
                // Nothing awaits this callback, and the unhandledRejection handler deliberately keeps the
                // process alive, so a failed close must exit here or shutdown hangs until SIGKILL.
                try {
                    await favoritesRecentsRepository.close();
                } catch (error: unknown) {
                    const message = error instanceof Error ? error.message : "Unknown error";
                    logger.error(`Shutdown failed: ${message}`);
                    process.exit(1);
                }
                logger.info("Server is gracefully shutting down");
                process.exit(0);
            });
        };

        process.on("SIGTERM", shutdown);
        process.on("SIGINT", shutdown);
    })
    .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Unknown error";
        logger.error(`Failed to initialize application data: ${message}`);
        process.exit(1);
    });
