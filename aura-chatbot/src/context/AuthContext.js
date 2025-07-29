// src/context/AuthContext.js
import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, googleProvider } from '../services/firebaseConfig';

const AuthContext = createContext();

export const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authInitialized, setAuthInitialized] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      console.log('🔐 Auth state changed:', user ? 'User logged in' : 'No user');
      setUser(user);
      setLoading(false);

      if (!authInitialized) {
        setAuthInitialized(true);
      }
    });

    // Timeout de seguridad
    const timeout = setTimeout(() => {
      if (!authInitialized) {
        console.warn('⚠️ Firebase tardando mucho, mostrando auth...');
        setAuthInitialized(true);
        setLoading(false);
      }
    }, 5000);

    return () => {
      unsubscribe();
      clearTimeout(timeout);
    };
  }, [authInitialized]);

  const signInWithGoogle = async () => {
    try {
      setLoading(true);
      const result = await auth.signInWithPopup(googleProvider);
      console.log('Login exitoso:', result.user);
      return { success: true, user: result.user };
    } catch (error) {
      console.error('Error en login:', error);
      setLoading(false);
      return { success: false, error: error.message };
    }
  };

  const signInAnonymously = async () => {
    try {
      setLoading(true);
      const result = await auth.signInAnonymously();
      console.log('Login anónimo exitoso:', result.user);
      return { success: true, user: result.user };
    } catch (error) {
      console.error('Error en login anónimo:', error);
      setLoading(false);
      return { success: false, error: error.message };
    }
  };

  const logout = async () => {
    try {
      setLoading(true);
      await auth.signOut();
      
      // Forzar cierre de sesión de Google también
      if (window.gapi && window.gapi.auth2) {
        const authInstance = window.gapi.auth2.getAuthInstance();
        if (authInstance) {
          await authInstance.signOut();
          await authInstance.disconnect();
        }
      }
      
      console.log('Logout exitoso');
      return { success: true };
    } catch (error) {
      console.error('Error en logout:', error);
      // Forzar logout local aunque falle el de Google
      window.location.reload();
      return { success: false, error: error.message };
    }
  };

  const value = {
    user,
    loading,
    authInitialized,
    signInWithGoogle,
    signInAnonymously,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};