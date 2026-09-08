import { createContext, useContext, useState, ReactNode } from "react";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role?: string;
}

interface AdminAuthContextValue {
  admin: AdminUser | null;
  token: string | null;
  login: (token: string, admin: AdminUser) => void;
  logout: () => void;
}

const AdminAuthContext = createContext<AdminAuthContextValue | undefined>(undefined);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem("adminToken"));
  const [admin, setAdmin] = useState<AdminUser | null>(
    localStorage.getItem("adminUser") ? JSON.parse(localStorage.getItem("adminUser")!) : null
  );

  const login = (newToken: string, newAdmin: AdminUser) => {
    localStorage.setItem("adminToken", newToken);
    localStorage.setItem("adminUser", JSON.stringify(newAdmin));
    setToken(newToken);
    setAdmin(newAdmin);
  };

  const logout = () => {
    localStorage.removeItem("adminToken");
    localStorage.removeItem("adminUser");
    setToken(null);
    setAdmin(null);
  };

  return <AdminAuthContext.Provider value={{ admin, token, login, logout }}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth(): AdminAuthContextValue {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used within AdminAuthProvider");
  return ctx;
}
