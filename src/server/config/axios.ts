import axios from 'axios';
import { environment } from './environment';

const { dashApi } = environment;

// Create a custom instance of axios
export const axiosInstance = axios.create({ baseURL: dashApi.baseUrl });
axiosInstance.defaults.headers.common.Authorization = dashApi.apiKey;
