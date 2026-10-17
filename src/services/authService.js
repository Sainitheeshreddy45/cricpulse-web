import { api } from '../api';

export const authService = {
  signIn: (credentials) => api.login(credentials),
  register: (details) => api.register(details),
  getCurrentUser: () => api.me(),
  searchUsers: (query, options) => api.searchUsers(query, options),
};
