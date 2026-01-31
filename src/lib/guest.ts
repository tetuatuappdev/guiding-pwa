const isDevFakeEnabled = () => import.meta.env.VITE_DEV_FAKE_TOUR === "1";

export const isGuestSession = () => {
  if (!isDevFakeEnabled()) return false;
  return localStorage.getItem("guestMode") === "1";
};

export const enableGuestSession = () => {
  if (!isDevFakeEnabled()) return;
  localStorage.setItem("guestMode", "1");
};

export const clearGuestSession = () => {
  localStorage.removeItem("guestMode");
};

export const isGuestAllowed = () => isDevFakeEnabled();
