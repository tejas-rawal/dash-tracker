import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

export const environment = {
  dashApi: {
    baseUrl: process.env.DASH_API_BASE_URL,
    agency: process.env.DASH_API_AGENCY,
    apiKey: process.env.DASH_API_KEY,
  },

  // Add other configuration as needed
  server: {
    port: process.env.PORT || 3000,
  }
};

// Validate required environment variables
const requiredEnvVars = ['DASH_API_BASE_URL', 'DASH_API_AGENCY', 'DASH_API_KEY'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}
