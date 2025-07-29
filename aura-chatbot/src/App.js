// src/App.js
import React from 'react';
import { AuthProvider } from './context/AuthContext';
import { ChatProvider } from './context/ChatContext';
import LoadingSpinner from './components/LoadingSpinner';
import AuthContainer from './components/Auth/AuthContainer';
import ChatContainer from './components/Chat/ChatContainer';
import { useAuth } from './hooks/useAuth';
import './styles/globals.css';

function AppContent() {
  const { user, loading, authInitialized } = useAuth();

  if (loading || !authInitialized) {
    return <LoadingSpinner />;
  }

  return (
    <div className="app-container">
      {user ? (
        <ChatProvider>
          <ChatContainer />
        </ChatProvider>
      ) : (
        <AuthContainer />
      )}
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;