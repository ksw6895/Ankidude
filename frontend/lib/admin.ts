export const ADMIN_PASSWORD_KEY = "ankidude-admin-password";

export const loadAdminPassword = (): string => {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(ADMIN_PASSWORD_KEY) || "";
};

export const saveAdminPassword = (value: string) => {
  if (typeof window === "undefined") return;
  if (value) {
    localStorage.setItem(ADMIN_PASSWORD_KEY, value);
  } else {
    localStorage.removeItem(ADMIN_PASSWORD_KEY);
  }
};
