export const API_BASE = import.meta.env.VITE_API_URL || "";

export const apiFetch = async (path: string, opts: RequestInit = {}) => {
  if (!API_BASE) {
    throw new Error("Missing VITE_API_URL.");
  }
  const url = API_BASE ? `${API_BASE}${path}` : path;
  const res = await fetch(url, opts);
  return res;
};
