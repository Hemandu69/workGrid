'use client';

import React, { createContext, useContext, useState } from 'react';
import { User, UserRole } from '../types/auth';
import { MOCK_USERS } from './mock-data';

interface AuthContextType {
  user: User;
  role: UserRole;
  setRole: (role: UserRole) => void;
  setUser: (user: User) => void;
  login: (email: string) => boolean;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Default to Super Admin so all parts of the application are previewable out of the box
  const [currentUser, setCurrentUser] = useState<User>(MOCK_USERS.superAdmin);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(true);

  // Allow switching roles dynamically
  const setRole = (newRole: UserRole) => {
    switch (newRole) {
      case 'SUPER_ADMIN':
        setCurrentUser(MOCK_USERS.superAdmin);
        break;
      case 'ADMIN':
        setCurrentUser(MOCK_USERS.admin);
        break;
      case 'SERVER':
        setCurrentUser(MOCK_USERS.server);
        break;
      case 'MEMBER':
        setCurrentUser(MOCK_USERS.member);
        break;
    }
  };

  const login = (email: string) => {
    const userMatch = Object.values(MOCK_USERS).find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (userMatch) {
      setCurrentUser(userMatch);
      setIsAuthenticated(true);
      return true;
    }
    // Default fallback to member if not recognized
    setCurrentUser({
      ...MOCK_USERS.member,
      email,
      name: email.split('@')[0].replace('.', ' '),
    });
    setIsAuthenticated(true);
    return true;
  };

  const logout = () => {
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user: currentUser,
        role: currentUser.role,
        setRole,
        setUser: setCurrentUser,
        login,
        logout,
        isAuthenticated,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
