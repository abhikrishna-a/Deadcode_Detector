/**
 * Extracts a user-friendly error message from an Axios error,
 * with specific messages per HTTP status code.
 */
export function parseApiError(err) {
  const status = err?.response?.status;
  const data = err?.response?.data;

  const serverMsg =
    data?.detail ||
    data?.error ||
    (data && typeof data === 'object'
      ? Object.entries(data)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
          .join(' | ')
      : null);

  switch (status) {
    case 400:
      return serverMsg || 'Invalid request. Please check your input.';
    case 401:
      return serverMsg || 'Invalid credentials. Please try again.';
    case 403:
      return serverMsg || 'Access denied. You do not have permission.';
    case 404:
      return serverMsg || 'Resource not found.';
    case 429:
      return 'Too many attempts. Please wait a moment and try again.';
    case 500:
      return 'Server error. Please try again later.';
    case 503:
      return 'Service unavailable. Please try again later.';
    default:
      return serverMsg || err?.message || 'An unexpected error occurred.';
  }
}
