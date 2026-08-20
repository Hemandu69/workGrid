'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, UserRole, AccountStatus } from '../types/auth';
import { MOCK_USERS } from './mock-data';
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
  setRole: (role: UserRole) => void; // Development/demo switcher
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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

  const [user, setUser] = useState<User>(MOCK_USERS.superAdmin);
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
