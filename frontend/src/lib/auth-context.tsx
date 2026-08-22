'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, UserRole, AccountStatus } from '../types/auth';
import { apiClient, ApiError } from './api-client';
import { useRouter, usePathname } from 'next/navigation';

interface AuthContextType {
  user: User;
  role?: UserRole | null;
  accountStatus: AccountStatus;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password?: string) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<User | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const INITIAL_USER: User = {
  id: '',
  name: '',
  email: '',
  role: null,
  accountStatus: 'PENDING',
  status: 'OFFLINE',
  capacityLimitHours: 40,
  currentAllocatedHours: 0,
};

export function getRoleLandingPath(role?: UserRole | null, status?: AccountStatus): string {
  if (status === 'PENDING' || !role) {
    return '/pending';
  }

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
      return '/member';
    default:
      return '/pending';
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [user, setUser] = useState<User>(INITIAL_USER);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Authoritative identity refresh from /api/v1/auth/me via HttpOnly cookie
  const refreshUser = useCallback(async (): Promise<User | null> => {
    try {
      setIsLoading(true);
      setError(null);
      const profile = await apiClient.getMe();
      if (profile && profile.id) {
        setUser(profile);
        setIsAuthenticated(true);
        setIsLoading(false);
        return profile;
      }
      setIsAuthenticated(false);
      setIsLoading(false);
      return null;
    } catch {
      setIsAuthenticated(false);
      setIsLoading(false);
      return null;
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  // Protected Route & Status Redirection
  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      const isPending = user.accountStatus === 'PENDING' || !user.role;
      const publicRoutes = ['/login', '/register', '/forgot-password', '/reset-password'];
      const isPublic = publicRoutes.some((route) => pathname?.startsWith(route));

      if (isPending) {
        // Pending users are restricted to /pending (and public pages)
        if (pathname !== '/pending' && !isPublic) {
          router.replace('/pending');
        }
      } else if (user.accountStatus === 'ACTIVE' && user.role) {
        // Active role-bearing users on /pending or /login/register are routed to their workspace
        if (pathname === '/pending' || pathname === '/login' || pathname === '/register') {
          router.replace(getRoleLandingPath(user.role, user.accountStatus));
        }
      }
    }
  }, [isLoading, isAuthenticated, user, pathname, router]);

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
      setUser(INITIAL_USER);
      router.push('/login');
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
