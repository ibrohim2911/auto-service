import axios from 'axios';
import useAuthStore from './store';
import toast from 'react-hot-toast';

const getBaseURL = () => {
  if (typeof window !== 'undefined' && window.location.port === '5173') {
    return 'http://localhost:8000/api/';
  }
  return '/api/';
};

const api = axios.create({
  baseURL: getBaseURL(),
  withCredentials: true,
  xsrfCookieName: 'csrftoken',
  xsrfHeaderName: 'X-CSRFToken',
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      if (useAuthStore.getState().isAuthenticated) {
        useAuthStore.getState().logout();
        toast.error("Session expired. Please login again.");
      }
    }
    return Promise.reject(error);
  }
);

export default api;
