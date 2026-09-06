/*
 * Backend integration boundary.
 *
 * Current review build:
 *   The UI imports MOCK_DRAINS directly.
 *
 * Final integration:
 *   Set VITE_API_BASE_URL to the backend laptop address and use getDrains().
 *
 * Example:
 *   VITE_API_BASE_URL=http://192.168.1.21:8000
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

export async function getDrains() {
  const response = await fetch(`${API_BASE_URL}/api/drains`);

  if (!response.ok) {
    throw new Error(`Backend request failed: ${response.status}`);
  }

  return response.json();
}