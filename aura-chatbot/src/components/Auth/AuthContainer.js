// src/components/Auth/AuthContainer.js
import React, { useState } from 'react';
import LoginForm from './LoginForm';
import TermsModal from './TermsModal';
import { useAuthContext } from '../../context/AuthContext';
import '../../styles/Auth.css';

const AuthContainer = () => {
  const { signInWithGoogle, signInAnonymously, loading } = useAuthContext();
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [modalContent, setModalContent] = useState('terms');

  const handleTermsChange = (accepted) => {
    setTermsAccepted(accepted);
  };

  const handleShowModal = (contentType) => {
    setModalContent(contentType);
    setShowTermsModal(true);
  };

  const handleCloseModal = () => {
    setShowTermsModal(false);
  };

  const handleAcceptTerms = () => {
    if (modalContent === 'terms') {
      setTermsAccepted(true);
    }
    setShowTermsModal(false);
  };

  const validateAndLogin = async (loginFunction) => {
    if (!termsAccepted) {
      alert('Debes aceptar los términos y condiciones para continuar');
      return;
    }
    
    const result = await loginFunction();
    if (!result.success) {
      alert('Error al iniciar sesión: ' + result.error);
    }
  };

  const handleGoogleLogin = () => validateAndLogin(signInWithGoogle);
  const handleAnonymousLogin = () => validateAndLogin(signInAnonymously);

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1>🌸 Aura</h1>
          <p>Tu compañía empática siempre disponible</p>
        </div>
        
        <div className="auth-content">
          <h2>Bienvenido/a</h2>
          <p>Inicia sesión para comenzar tu conversación</p>
          
          <LoginForm
            termsAccepted={termsAccepted}
            onTermsChange={handleTermsChange}
            onShowModal={handleShowModal}
            onGoogleLogin={handleGoogleLogin}
            onAnonymousLogin={handleAnonymousLogin}
            loading={loading}
          />

          <div className="legal-footer">
            <div className="legal-links">
              <a href="#" onClick={(e) => { e.preventDefault(); handleShowModal('legal'); }}>
                Aviso Legal
              </a>
              <a href="#" onClick={(e) => { e.preventDefault(); handleShowModal('privacy'); }}>
                Política de Privacidad
              </a>
              <a href="#" onClick={(e) => { e.preventDefault(); handleShowModal('contact'); }}>
                Contacto
              </a>
            </div>
          </div>
        </div>
      </div>

      {showTermsModal && (
        <TermsModal
          contentType={modalContent}
          onClose={handleCloseModal}
          onAccept={handleAcceptTerms}
        />
      )}
    </div>
  );
};

export default AuthContainer;