import axios from 'axios';
import authService from './authService';

// Create axios instance
const api = axios.create({
  baseURL: process.env.VUE_APP_API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add request interceptor to add authorization token
api.interceptors.request.use(async (config) => {
  if (authService.isAuthenticated()) {
    try {
      const token = await authService.getAccessToken();
      config.headers.Authorization = `Bearer ${token}`;
    } catch (error) {
      console.error("Error getting access token", error);
    }
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

/**
 * Service for short URL management
 */
export const shortUrlService = {
  /**
   * Get all short URLs
   * @returns {Promise} Promise resolving to array of short URLs
   */
  getAllShortUrls: async () => {
    const response = await api.get('/shorturl');
    return response.data;
  },

  /**
   * Get a short URL by code
   * @param {string} code - Short URL code
   * @returns {Promise} Promise resolving to short URL object
   */
  getShortUrl: async (code) => {
    const response = await api.get(`/shorturl/${code}`);
    return response.data;
  },

  /**
   * Generate a random short URL code
   * @param {number} length - Optional length of the code
   * @returns {Promise} Promise resolving to the generated code
   */
  generateRandomCode: async (length = 6) => {
    const response = await api.get(`/shorturl/generate-code${length !== 6 ? `?length=${length}` : ''}`);
    return response.data;
  },

  /**
   * Create a new short URL
   * @param {Object} shortUrl - Short URL data
   * @returns {Promise} Promise resolving to created short URL
   */
  createShortUrl: async (shortUrl) => {
    const response = await api.post('/shorturl', shortUrl);
    return response.data;
  },

  /**
   * Update a short URL
   * @param {string} code - Short URL code
   * @param {Object} shortUrl - Updated short URL data
   * @returns {Promise} Promise resolving to updated short URL
   */
  updateShortUrl: async (code, shortUrl) => {
    const response = await api.put(`/shorturl/${code}`, shortUrl);
    return response.data;
  },

  /**
   * Archive a short URL
   * @param {string} code - Short URL code to archive
   * @returns {Promise} Promise resolving to true if successful
   */
  archiveShortUrl: async (code) => {
    await api.delete(`/shorturl/${code}`);
    return true;
  }
};

/**
 * Service for click tracking
 */
export const clickTrackingService = {
  /**
   * Get clicks for a short URL
   * @param {string} code - Short URL code
   * @returns {Promise} Promise resolving to array of click info
   */
  getClicksForShortUrl: async (code) => {
    const response = await api.get(`/clicks/${code}`);
    return response.data;
  },

  /**
   * Get click count for a short URL
   * @param {string} code - Short URL code
   * @returns {Promise} Promise resolving to click count
   */
  getClickCount: async (code) => {
    const response = await api.get(`/clicks/${code}/count`);
    return response.data;
  },

  /**
   * Get click statistics for all URLs
   * @returns {Promise} Promise resolving to statistics object
   */
  getClickStatistics: async () => {
    const response = await api.get('/clicks/statistics');
    return response.data;
  }
};
