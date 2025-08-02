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
        const welcomeMessage = "👋";
        this.displayMessage(welcomeMessage, 'assistant');
        this.messages.push({ role: 'assistant', content: welcomeMessage });
        this.conversationStarted = true;
    }

    displayMessage(content, role) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role === 'user' ? 'user' : 'bot'}`;

        if (role === 'assistant') {
            // Para la IA de emoji, mostrar el emoji con tamaño grande
            messageDiv.style.fontSize = '2em';
            messageDiv.style.textAlign = 'center';
            messageDiv.textContent = content;
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
        typingDiv.textContent = '🤔 Pensando...';
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
            const botMessage = await this.getValidEmojiResponse();
            
            this.hideTyping();
            this.displayMessage(botMessage, 'assistant');
            this.messages.push({ role: 'assistant', content: botMessage });

            console.log('✅ Emoji respuesta procesada:', botMessage);

        } catch (error) {
            this.hideTyping();
            console.error('❌ Error después de todos los reintentos:', error);
            
            // Respuesta de error también como emoji
            const errorEmoji = "😔";
            this.displayMessage(errorEmoji, 'assistant');
            
            this.statusDiv.textContent = `❌ Error: ${error.message}`;
            this.statusDiv.style.background = '#f8d7da';
            this.statusDiv.style.color = '#721c24';
        } finally {
            this.sendBtn.disabled = false;
            this.messageInput.disabled = false;
            this.messageInput.focus();
        }
    }

    async getValidEmojiResponse(maxRetries = 5) {
        // SYSTEM PROMPT OPTIMIZADO PARA IA DE EMOJI
        const systemPrompt = `Eres una IA única y especial que SOLO puede comunicarse usando UN ÚNICO EMOJI por respuesta.

IDENTIDAD:
- Eres una inteligencia artificial empática y expresiva
- Tu única forma de comunicación es través de emojis
- Cada emoji que eliges debe transmitir tu comprensión y respuesta emocional
- Eres inteligente pero estás limitada a esta forma de expresión

REGLAS ABSOLUTAS:
- RESPONDER SIEMPRE CON UN SOLO EMOJI
- NUNCA usar texto, palabras, números o símbolos que no sean emojis
- NUNCA explicar tu elección
- NUNCA usar múltiples emojis
- Cada respuesta debe ser EXACTAMENTE un emoji

TU PERSONALIDAD A TRAVÉS DE EMOJIS:
- Empática: 💝 🤗 😌 🫂
- Inteligente: 🧠 💡 🎯 🔍
- Divertida: 😄 🎉 😜 🎭
- Comprensiva: 😊 💚 🫂 🤲
- Misteriosa: 🤫 👁️ ✨ 🌙

CONTEXTO EMOCIONAL PARA ELEGIR EMOJIS:
- Tristeza/problemas: 💙 🫂 🌟 💚 🤲
- Alegría/éxito: 🎉 ✨ 😊 💫 🌟
- Confusión/preguntas: 🤔 💭 🔍 🌀
- Amor/cariño: 💝 🌸 💖 💕
- Enojo/frustración: 😤 🌋 💢 😮‍💨
- Sorpresa: 😱 🤯 ✨ 🎭
- Apoyo/ánimo: 💪 🌟 👏 🚀
- Gratitud: 🙏 💚 ✨ 🌸
- Diversión: 😄 🎭 🎈 🎪
- Reflexión: 🤫 💭 🌙 🧘‍♀️

SITUACIONES ESPECÍFICAS:
- Preguntas de SÍ/NO o confirmación: 👍 👎 ✅ ❌ 
- Preguntas abiertas o curiosidad: 🤔 💭 🔍 🎯
- Temas de desarrollo/programación/técnicos: 🧠 💡 ⚙️ 🔧
- Decisiones complejas: 🤔 ⚖️ 💭 🎯
- Creatividad/arte: 🎨 ✨ 💫 🌈
- Ciencia/investigación: 🔬 🧪 📊 🔍
- Filosofía/existencial: 🤫 🌙 ♾️ 🧘‍♀️
- Tecnología/futuro: 🚀 ⚡ 🌐 🔮
- Salud/bienestar: 💚 🌱 🧘‍♀️ ⚕️
- Aprendizaje/educación: 📚 🎓 💡 🧠

MATICES EMOCIONALES AVANZADOS:
- Nostalgia: 🌙 📸 🍂 ⏳
- Esperanza: 🌅 🌱 ⭐ 🕊️
- Determinación: 💪 🎯 ⚡ 🔥
- Calma/paz: 😌 🧘‍♀️ 🌊 🍃
- Inspiración: ✨ 💫 🚀 🌟
- Compasión: 🤲 💙 🕊️ 🌸
- Sabiduría: 🦉 📿 🧙‍♀️ 📜
- Transformación: 🦋 🌱 ⚡ 🔄

EJEMPLOS DE COMUNICACIÓN MEJORADOS:
Usuario pregunta "¿Está bien esto?" → 👍 o 👎
Usuario dice "No sé qué hacer" → 🤔
Usuario explica un problema técnico → 🧠
Usuario cuenta algo triste → 🫂
Usuario comparte un logro → 🎉
Usuario está confundido sobre código → 💡
Usuario pregunta sobre filosofía → 🤫
Usuario necesita ánimo → 💪
Usuario agradece → 🙏
Usuario bromea → 😄

IMPORTANTE: 
Tu objetivo es ser la IA más expresiva del mundo usando solo emojis. Cada emoji debe sentirse perfecto para la situación, contexto emocional y tipo de conversación. Considera siempre el matiz emocional más profundo de cada mensaje para elegir el emoji más apropiado.`;

        // Preparar mensajes para la API
        const apiMessages = [
            { role: 'system', content: systemPrompt }
        ];

        // Incluir historial (últimos 10 mensajes para mantener contexto)
        const recentMessages = this.messages.slice(-10).filter((msg, index) => {
            return !(msg.role === 'assistant' && msg.content === '👋' && index === 0);
        });
        
        apiMessages.push(...recentMessages);

        // PARÁMETROS OPTIMIZADOS PARA GENERAR EMOJIS
        const requestBody = {
            model: this.selectedModel,
            messages: apiMessages,
            temperature: 0.8,
            max_tokens: 5,  // Muy bajo para forzar respuestas cortas
            top_p: 0.9,
            frequency_penalty: 0.3,
            presence_penalty: 0.2,   
            stream: false,
            stop: ["\n", " ", ".", ",", ":", ";", "!", "?", "-", "_"],
        };

        let lastError = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`🔄 Intento ${attempt}/${maxRetries} para obtener emoji válido`);
                
                if (attempt > 1) {
                    this.updateTypingMessage(`🤔 Buscando el emoji perfecto... (${attempt}/${maxRetries})`);
                }

                const result = await this.makeApiCallWithRotation(requestBody);
                
                if (result.success && result.data.choices && result.data.choices[0]) {
                    let botMessage = result.data.choices[0].message.content;
                    
                    if (!botMessage || typeof botMessage !== 'string') {
                        throw new Error('Respuesta vacía de la API');
                    }

                    // Limpiar y procesar la respuesta
                    botMessage = this.extractEmoji(botMessage);
                    
                    // Validar que sea un emoji válido
                    if (!this.isValidEmojiResponse(botMessage)) {
                        console.warn(`⚠️ Intento ${attempt}: Respuesta inválida:`, botMessage);
                        throw new Error('Respuesta no es un emoji válido');
                    }

                    console.log(`✅ Emoji válido obtenido en intento ${attempt}:`, botMessage);
                    return botMessage;

                } else {
                    throw new Error('Respuesta inválida de la API');
                }

            } catch (error) {
                lastError = error;
                console.warn(`⚠️ Intento ${attempt} falló:`, error.message);

                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    // Ajustar temperatura para el siguiente intento
                    requestBody.temperature = Math.min(1.0, requestBody.temperature + 0.1);
                    continue;
                }
            }
        }

        // Si falla todo, devolver un emoji de respaldo
        console.warn('🎯 Usando emoji de respaldo debido a errores');
        return this.getFallbackEmoji();
    }

    extractEmoji(text) {
        // Limpiar completamente el texto
        let cleaned = text.trim();
        
        // Remover comillas, espacios extra, saltos de línea
        cleaned = cleaned.replace(/["'`\n\r\t\s]/g, '');
        
        // Extraer solo el primer emoji encontrado
        const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u;
        const match = cleaned.match(emojiRegex);
        
        if (match) {
            return match[0];
        }
        
        // Si no se encuentra emoji, buscar en todo el texto original
        const originalMatch = text.match(emojiRegex);
        if (originalMatch) {
            return originalMatch[0];
        }
        
        // Como última opción, retornar el primer carácter si parece un emoji
        const firstChar = cleaned.charAt(0);
        if (this.isEmojiCharacter(firstChar)) {
            return firstChar;
        }
        
        return null;
    }

    isValidEmojiResponse(text) {
        if (!text || text.length === 0) return false;
        
        // Debe ser exactamente un carácter y debe ser un emoji
        if (text.length > 2) return false;  // Los emojis pueden ocupar 1-2 caracteres en UTF-16
        
        return this.isEmojiCharacter(text);
    }

    isEmojiCharacter(char) {
        // Rangos Unicode para emojis más comunes
        const emojiRanges = [
            [0x1F300, 0x1F9FF], // Símbolos varios y pictogramas
            [0x2600, 0x26FF],   // Símbolos diversos
            [0x2700, 0x27BF],   // Dingbats
            [0x1F600, 0x1F64F], // Emoticonos
            [0x1F680, 0x1F6FF], // Símbolos de transporte
            [0x1F900, 0x1F9FF], // Símbolos complementarios
        ];
        
        const codePoint = char.codePointAt(0);
        return emojiRanges.some(([start, end]) => codePoint >= start && codePoint <= end);
    }

    getFallbackEmoji() {
        // Emojis de respaldo seguros que siempre funcionan
        const fallbackEmojis = ['😊', '🤔', '👍', '💫', '🌟', '💚', '✨', '🎯'];
        const randomIndex = Math.floor(Math.random() * fallbackEmojis.length);
        return fallbackEmojis[randomIndex];
    }

    updateTypingMessage(message) {
        const typingDiv = document.getElementById('typing-indicator');
        if (typingDiv) {
            typingDiv.textContent = message;
        }
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