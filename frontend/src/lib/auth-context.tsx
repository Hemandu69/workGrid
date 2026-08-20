'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, UserRole, AccountStatus } from '../types/auth';
import { MOCK_USERS } from './mock-data';
import { apiClient, ApiError } from './api-client';
import { useRouter, usePathname } from 'next/navigation';

interface AuthContextType {
  user: User;
  role: UserRole;
  accountStatus: AccountStatus;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password?: string) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setRole: (role: UserRole) => void; // Development/demo switcher
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function getRoleLandingPath(role: UserRole): string {
  switch (role) {
    case 'SUPER_ADMIN':
      return '/super-admin';
    case 'ADMIN':
      return '/admin';
    case 'HR':
      return '/hr';
    case 'SERVER':
      return '/server';
    case 'TEAM_LEAD':
      return '/team-lead';
    case 'MEMBER':
    default:
      return '/member';
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [user, setUser] = useState<User>(MOCK_USERS.superAdmin);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Initial Auth Check: Loads authoritative identity from /api/v1/auth/me via HttpOnly cookie
  const refreshUser = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const profile = await apiClient.getMe();
      if (profile && profile.id) {
        setUser(profile);
        setIsAuthenticated(true);
      }
    } catch {
      // Unauthenticated or offline: keep preview user for offline demo
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  // Protected Route Redirection (Client UX layer; backend enforces mandatory security)
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      const publicRoutes = ['/login', '/forgot-password', '/reset-password'];
      const isPublic = publicRoutes.some((route) => pathname?.startsWith(route));
      if (!isPublic && pathname !== '/') {
        // Unauthenticated access
      }
    }
  }, [isLoading, isAuthenticated, pathname]);

  const login = async (email: string, password = 'password123'): Promise<User> => {
    setIsLoading(true);
    setError(null);

    try {
      await apiClient.login(email, password);
      const profile = await apiClient.getMe();
      setUser(profile);
      setIsAuthenticated(true);
      setIsLoading(false);
      return profile;
    } catch (err) {
      setIsLoading(false);
      if (err instanceof ApiError) {
        setError(err.message);
        throw err;
      }
      const genericError = new Error('Network error or server unreachable');
      setError(genericError.message);
      throw genericError;
    }
  };

  const logout = async () => {
    try {
      await apiClient.logout();
    } catch {
      // Ignore network errors on logout
    } finally {
      setIsAuthenticated(false);
      setUser(MOCK_USERS.member);
      router.push('/login');
    }
  };

  // Development/Preview role switcher
  const setRole = (newRole: UserRole) => {
    switch (newRole) {
      case 'SUPER_ADMIN':
        setUser(MOCK_USERS.superAdmin);
        break;
      case 'ADMIN':
        setUser(MOCK_USERS.admin);
        break;
      case 'HR':
        setUser(MOCK_USERS.hr);
        break;
      case 'TEAM_LEAD':
        setUser(MOCK_USERS.teamLead);
        break;
      case 'SERVER':
        setUser(MOCK_USERS.server);
        break;
      case 'MEMBER':
        setUser(MOCK_USERS.member);
        break;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user.role,
        accountStatus: user.accountStatus || 'ACTIVE',
        isAuthenticated,
        isLoading,
        error,
        login,
        logout,
        refreshUser,
        setRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
