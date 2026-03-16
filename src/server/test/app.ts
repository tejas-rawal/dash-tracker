import express from 'express';
import router from '../api/routes';

const app = express();
app.use(express.json());

app.get('/', (_req, res) => {
    res.jsonp({ message: 'Hello World' });
});

app.use('/api/v1', router);

export default app;
