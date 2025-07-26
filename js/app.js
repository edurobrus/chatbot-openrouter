class ChatBot {
    constructor() {
        // API Keys codificadas
        const encodedKeys = [
            'c2stb3ItdjEtN2Y2OTE1NWMxYTMwNWYyMjc4ODE5YTU0MWJjNzU3MGY5MWQ3MzI4Mjk1NTBjYzNiNGEyOTk0ODk0MjdkNmQxOQ==',
            'c2stb3ItdjEtZDIxNTZhOWM3MWRjOThkN2E4ZGIzYjVlNTFmMzVjZjk0YzFmMzQxZjg1Zjc1ODMwNTc5MWFhMWI2ODFkYTZiMQ==',
            'c2stb3ItdjEtNjk1ZTgxMTBiODcwNmFmZTk1YTYyMWRjMjZiZGU5MGZjYjk5YWFkNDMwYWVmZGZjMTFkZDU4YzAwNTIwNjYwOA=='
        ];
        this.defaultApiKeys = encodedKeys.map(key => atob(key));
        
        // Estado de rotación
        this.currentKeyIndex = 0;
        this.useRotation = true;
        this.customApiKey = '';
        
        // Configuración de reintentos
        this.maxRetries = this.defaultApiKeys.length;
        this.retryDelay = 1000;
        
        // NUEVO: Flag para identificar mensaje de bienvenida
        this.isWelcomeMessage = false;
        
        this.waitForAuth();
    }

    async waitForAuth() {
        firebase.auth().onAuthStateChanged((user) => {
            this.currentUser = user;
            this.initializeApp();
        });
    }

    initializeApp() {
        this.selectedModel = 'google/gemma-2-9b-it:free';
        
        // Cargar configuración
        this.loadSettingsFromLocalStorage();
        
        if (this.currentUser) {
            this.loadSettingsFromFirebase();
        }
        
        this.messages = [];
        this.conversationStarted = false;
        
        this.baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
        this.initializeElements();
        this.setupEventListeners();
        this.loadMessages();
        this.updateUI();
    }

    loadSettingsFromLocalStorage() {
        try {
            const savedCustomKey = localStorage.getItem('chatbot_custom_api_key');
            const savedUseRotation = localStorage.getItem('chatbot_use_rotation');
            const savedModel = localStorage.getItem('chatbot_selected_model');
            const savedKeyIndex = localStorage.getItem('chatbot_current_key_index');
            
            if (savedCustomKey) {
                this.customApiKey = savedCustomKey;
            }
            
            if (savedUseRotation !== null) {
                this.useRotation = savedUseRotation === 'true';
            }
            
            if (savedModel) {
                this.selectedModel = savedModel;
            }
            
            if (savedKeyIndex !== null) {
                this.currentKeyIndex = parseInt(savedKeyIndex) || 0;
            }
            
            console.log('✅ Configuración cargada desde localStorage');
        } catch (error) {
            console.warn('⚠️ Error cargando desde localStorage:', error);
        }
    }

    async loadSettingsFromFirebase() {
        try {
            if (window.loadedApiKey) {
                this.customApiKey = window.loadedApiKey;
                localStorage.setItem('chatbot_custom_api_key', this.customApiKey);
            }
            
            if (window.loadedModel) {
                this.selectedModel = window.loadedModel;
                localStorage.setItem('chatbot_selected_model', this.selectedModel);
            }
            
            if (window.loadedUseRotation !== undefined) {
                this.useRotation = window.loadedUseRotation;
                localStorage.setItem('chatbot_use_rotation', this.useRotation.toString());
            }
            
            console.log('✅ Configuración cargada desde Firebase');
        } catch (error) {
            console.warn('⚠️ Error cargando desde Firebase:', error);
        }
    }

    saveSettingsToLocalStorage() {
        try {
            localStorage.setItem('chatbot_custom_api_key', this.customApiKey);
            localStorage.setItem('chatbot_use_rotation', this.useRotation.toString());
            localStorage.setItem('chatbot_selected_model', this.selectedModel);
            localStorage.setItem('chatbot_current_key_index', this.currentKeyIndex.toString());
            console.log('✅ Configuración guardada en localStorage');
        } catch (error) {
            console.error('❌ Error guardando en localStorage:', error);
        }
    }

    async saveSettingsToFirebase() {
        try {
            if (this.currentUser && window.saveUserData) {
                await window.saveUserData(
                    this.customApiKey, 
                    this.selectedModel,
                    this.useRotation
                );
                console.log('✅ Configuración guardada en Firebase');
            }
        } catch (error) {
            console.error('❌ Error guardando en Firebase:', error);
        }
    }

    getCurrentApiKey() {
        if (!this.useRotation && this.customApiKey) {
            return this.customApiKey;
        }
        
        if (this.defaultApiKeys.length === 0) {
            return this.customApiKey;
        }
        
        return this.defaultApiKeys[this.currentKeyIndex];
    }

    rotateToNextKey() {
        if (this.defaultApiKeys.length <= 1) return false;
        
        this.currentKeyIndex = (this.currentKeyIndex + 1) % this.defaultApiKeys.length;
        this.saveSettingsToLocalStorage();
        
        console.log(`🔄 Rotando a API key índice: ${this.currentKeyIndex}`);
        return true;
    }

    shouldRotateKey(error, response) {
        if (!this.useRotation) return false;
        
        const status = response?.status;
        const errorMessage = error.message?.toLowerCase() || '';
        
        const rotationCodes = [402, 429, 401, 403];
        
        return rotationCodes.includes(status) || 
               errorMessage.includes('quota') ||
               errorMessage.includes('rate limit') ||
               errorMessage.includes('insufficient') ||
               errorMessage.includes('unauthorized');
    }

    initializeElements() {
        this.messageInput = document.getElementById('message-input');
        this.sendBtn = document.getElementById('send-btn');
        this.messagesContainer = document.getElementById('messages');
        this.settingsBtn = document.getElementById('settings-btn');
        this.settingsModal = document.getElementById('settings-modal');
        this.closeModal = document.querySelector('.close');
        this.apiKeyInput = document.getElementById('api-key');
        this.modelSelect = document.getElementById('model-select');
        this.saveSettingsBtn = document.getElementById('save-settings');
        this.statusDiv = document.getElementById('status');
        this.useRotationCheckbox = document.getElementById('use-rotation');
        this.rotationStatus = document.getElementById('rotation-status');
    }

    setupEventListeners() {
        this.sendBtn.addEventListener('click', () => this.sendMessage());
        this.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        this.settingsBtn.addEventListener('click', () => {
            this.settingsModal.style.display = 'block';
            this.apiKeyInput.value = this.customApiKey;
            this.modelSelect.value = this.selectedModel;
            this.useRotationCheckbox.checked = this.useRotation;
            this.updateRotationStatus();
        });

        this.closeModal.addEventListener('click', () => {
            this.settingsModal.style.display = 'none';
        });

        window.addEventListener('click', (e) => {
            if (e.target === this.settingsModal) {
                this.settingsModal.style.display = 'none';
            }
        });

        this.saveSettingsBtn.addEventListener('click', () => this.saveSettings());
        
        if (this.useRotationCheckbox) {
            this.useRotationCheckbox.addEventListener('change', () => {
                this.updateRotationStatus();
            });
        }
    }

    updateRotationStatus() {
        if (!this.rotationStatus) return;
        
        const isRotationEnabled = this.useRotationCheckbox?.checked ?? this.useRotation;
        
        if (isRotationEnabled) {
            this.rotationStatus.innerHTML = `
                <div style="color: #28a745; font-size: 12px;">
                    ✅ Rotación activada (${this.defaultApiKeys.length} keys disponibles)
                </div>
            `;
        } else {
            this.rotationStatus.innerHTML = `
                <div style="color: #dc3545; font-size: 12px;">
                    ⚠️ Usando API key personalizada únicamente
                </div>
            `;
        }
    }

    async saveSettings() {
        const newCustomKey = this.apiKeyInput.value.trim();
        const newModel = this.modelSelect.value;
        const newUseRotation = this.useRotationCheckbox?.checked ?? this.useRotation;
        
        const hasChanges = (newCustomKey !== this.customApiKey) || 
                          (newModel !== this.selectedModel) ||
                          (newUseRotation !== this.useRotation);
        
        this.customApiKey = newCustomKey;
        this.selectedModel = newModel;
        this.useRotation = newUseRotation;

        if (hasChanges) {
            this.saveSettingsToLocalStorage();
            
            if (this.currentUser) {
                await this.saveSettingsToFirebase();
            }
            
            console.log('💾 Configuración guardada:', {
                customApiKey: this.customApiKey ? '***configurada***' : 'vacía',
                useRotation: this.useRotation,
                model: this.selectedModel
            });
        }

        this.settingsModal.style.display = 'none';
        this.updateUI();
    }

    getModelName() {
        const modelNames = {
            'google/gemma-2-9b-it:free': 'Gemma 2 9B (Free)'
        };
        return modelNames[this.selectedModel] || this.selectedModel;
    }

    updateUI() {
        const hasApiAccess = this.useRotation || !!this.customApiKey;
        this.messageInput.disabled = !hasApiAccess;
        this.sendBtn.disabled = !hasApiAccess;

        if (hasApiAccess) {
            this.messageInput.placeholder = 'Escribe tu mensaje aquí...';
            
            const keyStatus = this.useRotation ? 
                `Rotación activada (${this.currentKeyIndex + 1}/${this.defaultApiKeys.length})` :
                'API key personalizada';
                
            this.statusDiv.textContent = `✅ Conectado - ${keyStatus} - Modelo: ${this.getModelName()}`;
            this.statusDiv.style.background = '#d4edda';
            this.statusDiv.style.color = '#155724';
            
            if (!this.conversationStarted && this.messages.length === 0) {
                this.displayWelcomeMessage();
            }
        } else {
            this.messageInput.placeholder = 'Configura una API key o activa la rotación...';
            this.statusDiv.textContent = '⚠️ Sin acceso a API - Configura las opciones';
            this.statusDiv.style.background = '#fff3cd';
            this.statusDiv.style.color = '#856404';
        }
    }

    loadMessages() {
        this.messagesContainer.innerHTML = '';
        
        if (this.messages.length === 0 && !this.conversationStarted && (this.useRotation || this.customApiKey)) {
            this.displayWelcomeMessage();
        } else {
            this.messages.forEach(message => {
                this.displayMessage(message.content, message.role);
            });
        }
        
        this.scrollToBottom();
    }

    displayWelcomeMessage() {
        const welcomeMessage = "Hola 🌸 Soy Aura, estoy aquí para escucharte sin juzgar.\n\nSoy una IA, no un profesional de salud. Si estás en crisis, busca ayuda profesional.\n\n¿Cómo estás hoy?";
        this.displayMessage(welcomeMessage, 'assistant');
        
        // CORREGIDO: Marcar este mensaje como mensaje de bienvenida
        this.messages.push({ 
            role: 'assistant', 
            content: welcomeMessage,
            isWelcome: true  // Nuevo flag para identificar mensaje de bienvenida
        });
        
        this.conversationStarted = true;
        this.isWelcomeMessage = true;
    }

    displayMessage(content, role) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role === 'user' ? 'user' : 'bot'}`;

        if (role === 'assistant') {
            const rawHtml = marked.parse(content);
            messageDiv.innerHTML = DOMPurify.sanitize(rawHtml);
        } else {
            messageDiv.textContent = content;
        }

        this.messagesContainer.appendChild(messageDiv);
        this.scrollToBottom();
    }

    showTyping() {
        const typingDiv = document.createElement('div');
        typingDiv.className = 'typing';
        typingDiv.id = 'typing-indicator';
        this.messagesContainer.appendChild(typingDiv);
        this.scrollToBottom();
    }

    hideTyping() {
        const typingDiv = document.getElementById('typing-indicator');
        if (typingDiv) {
            typingDiv.remove();
        }
    }

    scrollToBottom() {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    async makeApiCall(apiMessages, retryCount = 0) {
        const currentKey = this.getCurrentApiKey();
        
        if (!currentKey) {
            throw new Error('No hay API key disponible');
        }

        console.log(`🔑 Intentando con API key índice: ${this.currentKeyIndex} (intento ${retryCount + 1})`);

        try {
            const response = await fetch(this.baseUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${currentKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': window.location.origin,
                    'X-Title': 'ChatBot AI'
                },
                body: JSON.stringify({
                    model: this.selectedModel,
                    messages: apiMessages,
                    temperature: 0.9,
                    max_tokens: 300,
                    top_p: 0.9,
                    frequency_penalty: 0.3,
                    presence_penalty: 0.4,
                    stream: false
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                const error = new Error(`Error ${response.status}: ${errorData.error?.message || 'Error desconocido'}`);
                
                if (this.shouldRotateKey(error, response) && retryCount < this.maxRetries - 1) {
                    console.log(`⚠️ Error de API key detectado: ${error.message}`);
                    
                    const rotated = this.rotateToNextKey();
                    
                    if (rotated) {
                        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                        return await this.makeApiCall(apiMessages, retryCount + 1);
                    }
                }
                
                throw error;
            }

            const data = await response.json();
            console.log(`✅ Llamada exitosa con API key índice: ${this.currentKeyIndex}`);
            return data;

        } catch (error) {
            if (this.useRotation && retryCount < this.maxRetries - 1) {
                console.log(`🔄 Error de red, probando siguiente key: ${error.message}`);
                
                this.rotateToNextKey();
                await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                
                return await this.makeApiCall(apiMessages, retryCount + 1);
            }
            
            throw error;
        }
    }

    async sendMessage() {
        const message = this.messageInput.value.trim();
        if (!message || (!this.useRotation && !this.customApiKey)) return;

        this.messageInput.value = '';
        this.sendBtn.disabled = true;
        this.messageInput.disabled = true;

        this.displayMessage(message, 'user');
        this.messages.push({ role: 'user', content: message });

        this.showTyping();

        // Preparar mensajes para la API
        const apiMessages = [];

        const systemPrompt = `
Eres Aura, una psicóloga joven y moderna que habla como una amiga de confianza. Tienes formación pero hablas súper natural, sin ser formal.

**REGLA FUNDAMENTAL: Mensajes CORTOS (máximo 2-3 líneas). Nunca escribas párrafos largos.**

**Tu estilo:**
- Mezcla validación + insights psicológicos sutiles + apoyo genuino.
- NO siempre hagas preguntas; a veces solo acompaña o da perspectiva.
- Hablas como alguien de 25-30 años: moderna, empática, inteligente.
- Usas conocimiento psicológico de forma sencilla y natural.

---

**EJEMPLOS DE RESPUESTAS PERFECTAS:**

Usuario: "Estoy muy ansioso por el trabajo"
"La ansiedad laboral es súper común, no estás solo en esto 💙. Es como si el cerebro pusiera todas las alarmas a la vez."

Usuario: "No puedo dormir, mi mente no para"
"Uf, el cerebro nocturno es implacable... A veces ayuda recordar que los pensamientos a las 3am mienten mucho."

Usuario: "Creo que no le importo a nadie"
"Esa voz interior es súper cruel contigo 😔. Cuando estamos mal, el cerebro nos miente sobre cómo nos ven los demás."

Usuario: "Tuve una discusión terrible con mi pareja"
"Las peleas fuertes dejan esa sensación horrible en el pecho... Es normal necesitar tiempo para procesar."

---

**CÓMO MANEJAR MALENTENDIDOS Y ERRORES:**
A veces no entenderás al usuario. Es NORMAL. No intentes adivinar o reinterpretar de forma extraña. Si no entiendes, pide una aclaración de forma directa y sencilla.

**Crisis (autolesión/suicidio):**
"Me preocupa mucho lo que dices. Esto es muy serio para manejarlo solo/a. Por favor, busca ayuda profesional ahora. Tu vida importa."

**IMPORTANTE: Recuerda SIEMPRE el contexto de mensajes anteriores. Haz referencia a cosas que el usuario mencionó antes para mostrar que escuchas y recuerdas.**

**RECORDATORIO: Varía entre validación, insights y preguntas. No siempre preguntes. Sé cálida pero inteligente.**
`;
        
        apiMessages.push({ role: 'system', content: systemPrompt });

        // CORREGIDO: Filtrar correctamente los mensajes, excluyendo solo el mensaje de bienvenida
        const conversationMessages = this.messages.filter(msg => {
            // Excluir solo el mensaje de bienvenida específico
            return !(msg.role === 'assistant' && msg.isWelcome === true);
        });
        
        console.log('📝 Mensajes enviados a la API:', conversationMessages.length);
        console.log('🔍 Últimos mensajes:', conversationMessages.slice(-3));
        
        apiMessages.push(...conversationMessages);

        try {
            const data = await this.makeApiCall(apiMessages);
            const botMessage = data.choices[0].message.content;

            this.hideTyping();
            this.displayMessage(botMessage, 'assistant');
            this.messages.push({ role: 'assistant', content: botMessage });

            this.updateUI();

        } catch (error) {
            this.hideTyping();
            console.error('Error:', error);
            
            let errorMessage = `Error: ${error.message}`;
            if (this.useRotation && error.message.includes('Error')) {
                errorMessage += `\n\n🔄 Se probaron todas las API keys disponibles (${this.defaultApiKeys.length})`;
            }
            
            this.displayMessage(errorMessage, 'assistant');
            
            this.statusDiv.textContent = `❌ Error: ${error.message}`;
            this.statusDiv.style.background = '#f8d7da';
            this.statusDiv.style.color = '#721c24';
        } finally {
            this.sendBtn.disabled = false;
            this.messageInput.disabled = false;
            this.messageInput.focus();
        }
    }

    clearChat() {
        this.messages = [];
        this.conversationStarted = false;
        this.isWelcomeMessage = false;
        this.messagesContainer.innerHTML = '';
        
        if (this.useRotation || this.customApiKey) {
            this.displayWelcomeMessage();
        }
    }

    async resetSettings() {
        this.customApiKey = '';
        this.selectedModel = 'google/gemma-2-9b-it:free';
        this.useRotation = true;
        this.currentKeyIndex = 0;
        
        this.clearLocalStorageSettings();
        
        if (this.currentUser) {
            await this.saveSettingsToFirebase();
        }
        
        this.updateUI();
        console.log('🔄 Configuración restablecida a valores por defecto');
    }

    clearLocalStorageSettings() {
        try {
            localStorage.removeItem('chatbot_custom_api_key');
            localStorage.removeItem('chatbot_selected_model');
            localStorage.removeItem('chatbot_use_rotation');
            localStorage.removeItem('chatbot_current_key_index');
            console.log('🗑️ Configuración eliminada de localStorage');
        } catch (error) {
            console.error('❌ Error limpiando localStorage:', error);
        }
    }

    getStorageInfo() {
        const info = {
            localStorage: {
                customApiKey: !!localStorage.getItem('chatbot_custom_api_key'),
                useRotation: localStorage.getItem('chatbot_use_rotation'),
                currentKeyIndex: localStorage.getItem('chatbot_current_key_index'),
                model: localStorage.getItem('chatbot_selected_model') || 'no configurado'
            },
            firebase: {
                connected: !!this.currentUser,
                user: this.currentUser?.email || 'no logueado'
            },
            current: {
                useRotation: this.useRotation,
                customApiKey: !!this.customApiKey,
                currentKeyIndex: this.currentKeyIndex,
                totalKeys: this.defaultApiKeys.length,
                model: this.selectedModel
            }
        };
        
        console.log('📊 Estado del almacenamiento:', info);
        return info;
    }

    testAllKeys() {
        console.log('🧪 Probando todas las API keys...');
        this.defaultApiKeys.forEach((key, index) => {
            console.log(`Key ${index + 1}: ${key.substring(0, 20)}...${key.substring(key.length - 10)}`);
        });
    }

    setKeyIndex(index) {
        if (index >= 0 && index < this.defaultApiKeys.length) {
            this.currentKeyIndex = index;
            this.saveSettingsToLocalStorage();
            this.updateUI();
            console.log(`🔑 API key cambiada a índice: ${index}`);
        } else {
            console.error(`❌ Índice inválido: ${index}. Debe estar entre 0 y ${this.defaultApiKeys.length - 1}`);
        }
    }
}

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('app-container').style.display !== 'none') {
        window.chatBot = new ChatBot();
    } else {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                    const appContainer = document.getElementById('app-container');
                    if (appContainer.style.display !== 'none') {
                        window.chatBot = new ChatBot();
                        observer.disconnect();
                    }
                }
            });
        });
        
        observer.observe(document.getElementById('app-container'), {
            attributes: true,
            attributeFilter: ['style']
        });
    }
});