import express from 'express';
import router from './api/routes';
import { BusDataRepository } from './api/repositories';
import { environment, logger } from './config'

const app = express();
const port = environment.server.port;

// Middleware to parse JSON
app.use(express.json());

app.get('/', (_req, res) => {
    res.jsonp({ message: 'Hello World' });
});

// V1 API
app.use('/api/v1', router);

// Initialize repository data before accepting requests
const repository = BusDataRepository.getInstance();
repository.initialize()
    .then(() => {
        const server = app.listen(port, () => {
            logger.info(`Server is running on port ${port}`);
        });

        // graceful shutdown
        const shutdown = () => {
            server.close(() => {
                logger.info('Server is gracefully shutting down');
                process.exit(0);
            });
        };

        process.on('SIGTERM', shutdown);
        process.on('SIGINT', shutdown);
    })
    .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`Failed to initialize application data: ${message}`);
        process.exit(1);
    });
