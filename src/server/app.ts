import express from 'express';
import routes from './api/routes';

const app = express();
const port = 5000;

// Middleware to parse JSON
app.use(express.json());

// V1 API
app.use('/api/v1', routes);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
