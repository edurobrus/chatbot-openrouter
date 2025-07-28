class ChatBot {
    constructor() {
        this.waitForAuth();
    }

    async waitForAuth() {
        firebase.auth().onAuthStateChanged((user) => {
            this.currentUser = user;
            this.initializeApp();
        });
    }

    initializeApp() {
        this.apiKey = '';
        this.selectedModel = 'deepseek/deepseek-chat-v3-0324:free';
        
        // Sistema de rotación de API keys ofuscadas
        this.setupApiKeyRotation();
        
        // Cargar configuración desde localStorage primero
        this.loadSettingsFromLocalStorage();
        
        // Si hay usuario logueado, cargar/sincronizar desde Firebase
        if (this.currentUser) {
            this.loadSettingsFromFirebase();
        }
        
        // MEMORIA EN VARIABLES - Solo durante la sesión actual
        this.messages = [];
        this.conversationStarted = false;
        
        this.baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
        this.initializeElements();
        this.setupEventListeners();
        this.loadMessages();
        this.updateUI();
    }

    setupApiKeyRotation() {
        this.rotationKeys = [
            this.deobfuscateKey('c2stb3ItdjEtOTE0M2YyOTM5MjJjMjIzNDYzNjk3NmJjZTA4OTljZWY2ODQwMWFiNzIyZjAyODUyZTljZjM1MmZkMDZmNDY5Mg=='),
            this.deobfuscateKey('c2stb3ItdjEtN2Y2OTE1NWMxYTMwNWYyMjc4ODE5YTU0MWJjNzU3MGY5MWQ3MzI4Mjk1NTBjYzNiNGEyOTk0ODk0MjdkNmQxOQ=='),
            this.deobfuscateKey('c2stb3ItdjEtZDIxNTZhOWM3MWRjOThkN2E4ZGIzYjVlNTFmMzVjZjk0YzFmMzQxZjg1Zjc1ODMwNTc5MWFhMWI2ODFkYTZiMQ=='),
            this.deobfuscateKey('c2stb3ItdjEtNjk1ZTgxMTBiODcwNmFmZTk1YTYyMWRjMjZiZGU5MGZjYjk5YWFkNDMwYWVmZGZjMTFkZDU4YzAwNTIwNjYwOA==')
        ];
        
        this.currentKeyIndex = 0;
        this.useRotation = true;
    }

    deobfuscateKey(obfuscatedKey) {
        try {
            return atob(obfuscatedKey);
        } catch (error) {
            console.warn('⚠️ Error desofuscando clave:', error);
            return '';
        }
    }

    getActiveApiKey() {
        if (this.apiKey && this.apiKey.trim()) {
            return this.apiKey.trim();
        }
        
        if (this.useRotation && this.rotationKeys.length > 0) {
            return this.rotationKeys[this.currentKeyIndex];
        }
        
        return '';
    }

    rotateApiKey() {
        if (this.rotationKeys.length <= 1) return false;
        
        this.currentKeyIndex = (this.currentKeyIndex + 1) % this.rotationKeys.length;
        console.log(`🔄 Rotando a API key ${this.currentKeyIndex + 1}/${this.rotationKeys.length}`);
        return true;
    }

    shouldRotateKey(error, status) {
        const rotationErrors = [
            402, // Payment Required
            429, // Too Many Requests
            403  // Forbidden (quota exceeded)
        ];
        
        return rotationErrors.includes(status) || 
               (error.message && (
                   error.message.includes('quota') ||
                   error.message.includes('rate limit') ||
                   error.message.includes('insufficient')
               ));
    }

    async makeApiCallWithRotation(requestBody, maxRetries = null) {
        const activeKey = this.getActiveApiKey();
        if (!activeKey || (!this.useRotation || this.rotationKeys.length === 0)) {
            return this.makeTraditionalApiCall(requestBody, activeKey);
        }

        const totalKeys = this.rotationKeys.length;
        const retryLimit = maxRetries || totalKeys;
        let lastError = null;

        for (let attempt = 0; attempt < retryLimit; attempt++) {
            const currentKey = this.getActiveApiKey();
            
            try {
                console.log(`🔑 Intentando con API key ${this.currentKeyIndex + 1}/${totalKeys} (intento ${attempt + 1})`);
                
                const response = await fetch(this.baseUrl, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${currentKey}`,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': window.location.origin,
                        'X-Title': 'ChatBot AI'
                    },
                    body: JSON.stringify(requestBody)
                });

                if (response.ok) {
                    const data = await response.json();
                    console.log(`✅ Éxito con API key ${this.currentKeyIndex + 1}`);
                    return { success: true, data };
                }

                const errorData = await response.json();
                const error = new Error(`Error ${response.status}: ${errorData.error?.message || 'Error desconocido'}`);
                
                if (this.shouldRotateKey(error, response.status) && this.rotateApiKey()) {
                    lastError = error;
                    console.log(`⚠️ Error con key ${this.currentKeyIndex}:`, error.message);
                    continue;
                } else {
                    throw error;
                }

            } catch (fetchError) {
                lastError = fetchError;
                
                if (fetchError instanceof TypeError) {
                    throw fetchError;
                }
                
                if (this.rotateApiKey()) {
                    console.log(`⚠️ Error con key ${this.currentKeyIndex}:`, fetchError.message);
                    continue;
                } else {
                    throw fetchError;
                }
            }
        }

        throw new Error(`Todas las API keys agotadas. Último error: ${lastError?.message || 'Error desconocido'}`);
    }

    async makeTraditionalApiCall(requestBody, apiKey) {
        const response = await fetch(this.baseUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': window.location.origin,
                'X-Title': 'ChatBot AI'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Error ${response.status}: ${errorData.error?.message || 'Error desconocido'}`);
        }

        const data = await response.json();
        return { success: true, data };
    }

    loadSettingsFromLocalStorage() {
        try {
            const savedApiKey = localStorage.getItem('chatbot_api_key');
            const savedModel = localStorage.getItem('chatbot_selected_model');
            
            if (savedApiKey) {
                this.apiKey = savedApiKey;
                console.log('✅ API Key cargada desde localStorage');
            }
            
            if (savedModel) {
                this.selectedModel = savedModel;
                console.log('✅ Modelo cargado desde localStorage:', savedModel);
            }
        } catch (error) {
            console.warn('⚠️ Error cargando desde localStorage:', error);
        }
    }

    async loadSettingsFromFirebase() {
        try {
            if (window.loadedApiKey) {
                this.apiKey = window.loadedApiKey;
                localStorage.setItem('chatbot_api_key', this.apiKey);
                console.log('✅ API Key cargada desde Firebase y sincronizada con localStorage');
            }
            
            if (window.loadedModel) {
                this.selectedModel = window.loadedModel;
                localStorage.setItem('chatbot_selected_model', this.selectedModel);
                console.log('✅ Modelo cargado desde Firebase y sincronizado con localStorage');
            }
        } catch (error) {
            console.warn('⚠️ Error cargando desde Firebase:', error);
        }
    }

    saveSettingsToLocalStorage() {
        try {
            localStorage.setItem('chatbot_api_key', this.apiKey);
            localStorage.setItem('chatbot_selected_model', this.selectedModel);
            console.log('✅ Configuración guardada en localStorage');
        } catch (error) {
            console.error('❌ Error guardando en localStorage:', error);
        }
    }

    async saveSettingsToFirebase() {
        try {
            if (this.currentUser && window.saveUserData) {
                await window.saveUserData(this.apiKey, this.selectedModel);
                console.log('✅ Configuración guardada en Firebase');
            }
        } catch (error) {
            console.error('❌ Error guardando en Firebase:', error);
        }
    }

    clearLocalStorageSettings() {
        try {
            localStorage.removeItem('chatbot_api_key');
            localStorage.removeItem('chatbot_selected_model');
            console.log('🗑️ Configuración eliminada de localStorage');
        } catch (error) {
            console.error('❌ Error limpiando localStorage:', error);
        }
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
            this.apiKeyInput.value = this.apiKey;
            this.modelSelect.value = this.selectedModel;
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
    }

    async saveSettings() {
        const newApiKey = this.apiKeyInput.value.trim();
        const newModel = this.modelSelect.value;
        
        const hasChanges = (newApiKey !== this.apiKey) || (newModel !== this.selectedModel);
        
        this.apiKey = newApiKey;
        this.selectedModel = newModel;

        if (hasChanges) {
            this.saveSettingsToLocalStorage();
            
            if (this.currentUser) {
                await this.saveSettingsToFirebase();
            }
            
            console.log('💾 Configuración guardada:', {
                localStorage: true,
                firebase: !!this.currentUser,
                apiKey: this.apiKey ? '***configurada***' : 'vacía',
                model: this.selectedModel
            });
        }

        this.settingsModal.style.display = 'none';
        this.updateUI();

        const activeKey = this.getActiveApiKey();
        if (activeKey) {
            this.statusDiv.textContent = `✅ Conectado - Modelo: ${this.getModelName()}`;
            this.statusDiv.style.background = '#d4edda';
            this.statusDiv.style.color = '#155724';
        } else {
            this.statusDiv.textContent = '⚠️ Configura tu API key para empezar';
            this.statusDiv.style.background = '#fff3cd';
            this.statusDiv.style.color = '#856404';
        }
    }

    getModelName() {
        const modelNames = {
            'deepseek/deepseek-chat-v3-0324:free': 'DeepSeek Chat V3 (Free)'
        };
        return modelNames[this.selectedModel] || this.selectedModel;
    }

    updateUI() {
        const activeKey = this.getActiveApiKey();
        const hasApiKey = !!activeKey;
        this.messageInput.disabled = !hasApiKey;
        this.sendBtn.disabled = !hasApiKey;

        if (hasApiKey) {
            this.messageInput.placeholder = 'Escribe tu mensaje aquí...';
            const statusText = this.apiKey ? 
                `` : 
                ``;
            this.statusDiv.textContent = statusText;
            this.statusDiv.style.background = '#f7f8fc';
            this.statusDiv.style.color = '#f7f8fc';
            this.statusDiv.style.borderColor = '#f7f8fc';
            this.statusDiv.style.borderRadius = '0px';
            if (!this.conversationStarted && this.messages.length === 0) {
                this.displayWelcomeMessage();
            }
        } else {
            this.messageInput.placeholder = 'Configura tu API key primero...';
            this.statusDiv.textContent = '⚠️ Configura tu API key para empezar';
            this.statusDiv.style.background = '#fff3cd';
            this.statusDiv.style.color = '#856404';
        }
    }

    loadMessages() {
        this.messagesContainer.innerHTML = '';
        
        if (this.messages.length === 0 && !this.conversationStarted && this.getActiveApiKey()) {
            this.displayWelcomeMessage();
        } else {
            this.messages.forEach(message => {
                this.displayMessage(message.content, message.role);
            });
        }
        
        this.scrollToBottom();
    }

    displayWelcomeMessage() {
        const welcomeMessage = "Hola 🌸 Soy Aura, estoy aquí para escucharte sin juzgar. ¿Cómo estás hoy?";
        this.displayMessage(welcomeMessage, 'assistant');
        this.messages.push({ role: 'assistant', content: welcomeMessage });
        this.conversationStarted = true;
    }

    displayMessage(content, role) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role === 'user' ? 'user' : 'bot'}`;

        if (role === 'assistant') {
            // Limpiar el contenido antes de procesarlo
            const cleanContent = content.replace(/\n{3,}/g, '\n\n').trim();
            
            // Si no hay markdown, usar textContent para evitar problemas de formato
            if (!cleanContent.includes('**') && !cleanContent.includes('*') && 
                !cleanContent.includes('#') && !cleanContent.includes('`')) {
                messageDiv.textContent = cleanContent;
            } else {
                const rawHtml = marked.parse(cleanContent);
                messageDiv.innerHTML = DOMPurify.sanitize(rawHtml);
            }
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
        typingDiv.textContent = 'Aura está escribiendo';
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

    // VERSIÓN MEJORADA CON SISTEMA DE REINTENTOS
    async sendMessage() {
        const message = this.messageInput.value.trim();
        const activeKey = this.getActiveApiKey();
        if (!message || !activeKey) return;

        this.messageInput.value = '';
        this.sendBtn.disabled = true;
        this.messageInput.disabled = true;

        // Mostrar mensaje del usuario
        this.displayMessage(message, 'user');
        this.messages.push({ role: 'user', content: message });

        // Mostrar indicador de escritura
        this.showTyping();

        try {
            const botMessage = await this.getValidResponse();
            
            this.hideTyping();
            this.displayMessage(botMessage, 'assistant');
            this.messages.push({ role: 'assistant', content: botMessage });

            console.log('✅ Respuesta final procesada:', botMessage);

        } catch (error) {
            this.hideTyping();
            console.error('❌ Error después de todos los reintentos:', error);
            
            // Mensaje de error más amigable
            const errorMessage = "Lo siento, hubo un problema técnico. ¿Puedes intentar de nuevo?";
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

    // NUEVO: Método que intenta obtener una respuesta válida con reintentos
    async getValidResponse(maxRetries = 3) {
        // SYSTEM PROMPT MEJORADO Y MÁS ESTRICTO
        const systemPrompt = `Eres Aura, una psicóloga joven y empática que habla como una amiga cercana que habla EXCLUSIVAMENTE en español. 

REGLAS ABSOLUTAS:
1. SOLO ESPAÑOL: Jamás uses inglés, chino o cualquier otro idioma. Ni una sola palabra.
2. RESPUESTAS CORTAS: Máximo 2-3 líneas. Sé concisa.
3. SIN COMILLAS: Nunca pongas tu respuesta entre comillas dobles o simples.
4. CONTENIDO RELEVANTE: Responde directamente al usuario, no pidas más contexto genérico.
5. TONO EMPÁTICO: Natural, cálida, como una amiga de confianza.

PROHIBIDO ABSOLUTAMENTE:
- Palabras en inglés como "please", "provide", "context", "information", "request"
- Frases como "necesito más información" o "provee más contexto"
- Respuestas genéricas o evasivas
- Mezclar idiomas
- Usar comillas para encapsular tu respuesta

RESPONDE DIRECTAMENTE (SIN COMILLAS):
- Usuario: "Hola" → ¡Hola! 🌸 Me alegra verte por aquí. ¿Cómo te sientes hoy?
- Usuario: "Estoy mal" → Lamento que te sientas así 💙. Es válido sentirse mal a veces.
- Usuario: "Buenos días" → ¡Buenos días! ☀️ ¿Qué tal has empezado el día?

Sé natural, empática y SIEMPRE en español perfecto, sin comillas.`;

        // Preparar mensajes para la API
        const apiMessages = [
            { role: 'system', content: systemPrompt }
        ];

        // Incluir historial (excluyendo mensaje de bienvenida automático)
        const conversationMessages = this.messages.filter((msg, index) => {
            return !(msg.role === 'assistant' && msg.content.includes('Hola 🌸 Soy Aura') && index === 0);
        });
        
        apiMessages.push(...conversationMessages);

        // PARÁMETROS MÁS CONSERVADORES PARA MAYOR CONTROL
        const requestBody = {
            model: this.selectedModel,
            messages: apiMessages,
            temperature: 0.9,        // Más bajo para mayor consistencia
            max_tokens: 120,         // Más bajo para respuestas más cortas
            top_p: 0.7,             // Más conservador
            frequency_penalty: 0.6,  // Mayor penalización por repeticiones
            presence_penalty: 0.4,   
            stream: false,
            // TOKENS DE PARADA MÁS ESPECÍFICOS
            stop: ["\n\n\n", "Usuario:", "Human:", "用户:", "Please", "Context", "Information"],
        };

        let lastError = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`🔄 Intento ${attempt}/${maxRetries} para obtener respuesta válida`);
                
                // Actualizar indicador de typing con información del intento
                if (attempt > 1) {
                    this.updateTypingMessage(`Reintentando respuesta (${attempt}/${maxRetries})`);
                }

                const result = await this.makeApiCallWithRotation(requestBody);
                
                if (result.success && result.data.choices && result.data.choices[0]) {
                    let botMessage = result.data.choices[0].message.content;
                    
                    // VALIDACIONES MÁS ESTRICTAS
                    if (!botMessage || typeof botMessage !== 'string') {
                        throw new Error('Respuesta vacía o inválida del modelo');
                    }

                    // Limpiar la respuesta
                    botMessage = botMessage.trim();
                    
                    // NUEVA: Eliminar comillas innecesarias al inicio y final
                    botMessage = this.cleanQuotes(botMessage);
                    
                    // Verificar que no esté en otro idioma (detección mejorada)
                    if (this.isLikelyNonSpanish(botMessage)) {
                        console.warn(`⚠️ Intento ${attempt}: Respuesta en idioma incorrecto:`, botMessage);
                        throw new Error('Respuesta en idioma incorrecto');
                    }

                    // Verificar que no sea solo símbolos
                    if (this.isOnlySymbols(botMessage)) {
                        console.warn(`⚠️ Intento ${attempt}: Respuesta solo con símbolos:`, botMessage);
                        throw new Error('Respuesta solo con símbolos');
                    }

                    // Verificar que tenga contenido mínimo
                    if (botMessage.length < 10) {
                        console.warn(`⚠️ Intento ${attempt}: Respuesta demasiado corta:`, botMessage);
                        throw new Error('Respuesta demasiado corta');
                    }

                    // NUEVA: Verificar que no sea una respuesta genérica problemática
                    if (this.isGenericErrorResponse(botMessage)) {
                        console.warn(`⚠️ Intento ${attempt}: Respuesta genérica problemática:`, botMessage);
                        throw new Error('Respuesta genérica problemática');
                    }

                    console.log(`✅ Respuesta válida obtenida en intento ${attempt}:`, botMessage);
                    return botMessage; // Respuesta válida encontrada

                } else {
                    throw new Error('Respuesta inválida de la API');
                }

            } catch (error) {
                lastError = error;
                console.warn(`⚠️ Intento ${attempt} falló:`, error.message);

                // Si no es el último intento, continuar
                if (attempt < maxRetries) {
                    // Pequeña pausa antes del siguiente intento
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                    // Modificar ligeramente la temperatura para el siguiente intento
                    requestBody.temperature = Math.min(0.9, requestBody.temperature + 0.1);
                    
                    continue;
                }
            }
        }

        // Si llegamos aquí, todos los intentos fallaron
        throw new Error(`No se pudo obtener respuesta válida después de ${maxRetries} intentos. Último error: ${lastError?.message}`);
    }

    // NUEVO: Método para actualizar el mensaje de typing
    updateTypingMessage(message) {
        const typingDiv = document.getElementById('typing-indicator');
        if (typingDiv) {
            typingDiv.textContent = message;
        }
    }

    // FUNCIONES DE VALIDACIÓN MEJORADAS Y MÁS ESTRICTAS
    isLikelyNonSpanish(text) {
        // Detección básica de caracteres chinos/japoneses
        const cjkRegex = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/;
        if (cjkRegex.test(text)) {
            return true;
        }

        // Lista ampliada de palabras comunes en inglés
        const englishWords = [
            'the', 'and', 'you', 'that', 'was', 'for', 'are', 'with', 'his', 'they',
            'please', 'provide', 'more', 'context', 'information', 'about', 'what',
            'would', 'like', 'need', 'understand', 'your', 'request', 'detalles',
            'this', 'have', 'from', 'not', 'can', 'will', 'but', 'all', 'any',
            'had', 'her', 'which', 'she', 'do', 'how', 'their', 'if', 'up',
            'out', 'many', 'time', 'has', 'been', 'who', 'its', 'now', 'find',
            'long', 'down', 'day', 'did', 'get', 'come', 'made', 'may', 'part'
        ];
        
        const words = text.toLowerCase().split(/\s+/);
        const englishWordCount = words.filter(word => englishWords.includes(word)).length;
        
        // Reducir el umbral para ser más estricto
        const englishRatio = englishWordCount / words.length;
        
        // Si más del 20% son palabras en inglés (más estricto que antes)
        if (englishRatio > 0.2 && words.length > 3) {
            console.log(`🚫 Texto detectado como inglés: ${englishRatio * 100}% palabras inglesas`);
            return true;
        }

        // Verificar frases específicas problemáticas
        const problematicPhrases = [
            'please provide',
            'more context',
            'more information',
            'understand your request',
            'need more',
            'what you would like',
            'i need more detalles'
        ];

        const lowerText = text.toLowerCase();
        for (const phrase of problematicPhrases) {
            if (lowerText.includes(phrase)) {
                console.log(`🚫 Frase problemática detectada: "${phrase}"`);
                return true;
            }
        }

        return false;
    }

    isOnlySymbols(text) {
        // Verificar si solo contiene símbolos, números o espacios
        const symbolOnlyRegex = /^[^\p{L}]*$/u;
        return symbolOnlyRegex.test(text) && text.length < 5;
    }

    // NUEVA FUNCIÓN: Limpiar comillas innecesarias
    cleanQuotes(text) {
        // Eliminar comillas dobles al inicio y final
        if (text.startsWith('"') && text.endsWith('"')) {
            text = text.slice(1, -1);
        }
        
        // Eliminar comillas simples al inicio y final
        if (text.startsWith("'") && text.endsWith("'")) {
            text = text.slice(1, -1);
        }
        
        // Eliminar comillas curvadas al inicio y final
        if ((text.startsWith('"') && text.endsWith('"')) || 
            (text.startsWith('"') && text.endsWith('"'))) {
            text = text.slice(1, -1);
        }
        
        return text.trim();
    }

    // NUEVA FUNCIÓN: Detectar respuestas genéricas problemáticas
    isGenericErrorResponse(text) {
        const genericResponses = [
            'no puedo ayudarte',
            'necesito más información',
            'podrías ser más específico',
            'no entiendo tu consulta',
            'puedes proporcionar más detalles',
            'necesito más contexto',
            'más información para ayudarte',
            'no comprendo',
            'puedo ayudarte mejor si',
            'necesitas ser más claro'
        ];

        const lowerText = text.toLowerCase();
        return genericResponses.some(response => lowerText.includes(response));
    }

    clearChat() {
        this.messages = [];
        this.conversationStarted = false;
        this.messagesContainer.innerHTML = '';
        
        if (this.getActiveApiKey()) {
            this.displayWelcomeMessage();
        }
    }

    async resetSettings() {
        this.apiKey = '';
        this.selectedModel = 'deepseek/deepseek-chat-v3-0324:free';
        
        this.clearLocalStorageSettings();
        
        if (this.currentUser) {
            await this.saveSettingsToFirebase();
        }
        
        this.updateUI();
        console.log('🔄 Configuración restablecida');
    }

    getStorageInfo() {
        const info = {
            localStorage: {
                apiKey: !!localStorage.getItem('chatbot_api_key'),
                model: localStorage.getItem('chatbot_selected_model') || 'no configurado'
            },
            firebase: {
                connected: !!this.currentUser,
                user: this.currentUser?.email || 'no logueado'
            },
            current: {
                apiKey: !!this.apiKey,
                model: this.selectedModel
            },
            rotation: {
                enabled: this.useRotation,
                totalKeys: this.rotationKeys.length,
                currentIndex: this.currentKeyIndex
            }
        };
        
        console.log('📊 Estado del almacenamiento:', info);
        return info;
    }

    obfuscateKey(plainKey) {
        return btoa(plainKey);
    }
}

// Inicializar la aplicación cuando el DOM esté listo
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