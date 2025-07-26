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
        this.selectedModel = 'google/gemma-2-9b-it:free';
        
        // NUEVO: Sistema de rotación de API keys ofuscadas
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

    // NUEVO: Desofuscar API key
    deobfuscateKey(obfuscatedKey) {
        try {
            return atob(obfuscatedKey);
        } catch (error) {
            console.warn('⚠️ Error desofuscando clave:', error);
            return '';
        }
    }

    // NUEVO: Obtener la API key activa (rotación o manual)
    getActiveApiKey() {
        // Si hay una API key manual configurada, usarla
        if (this.apiKey && this.apiKey.trim()) {
            return this.apiKey.trim();
        }
        
        // Si no hay key manual y la rotación está habilitada, usar rotación
        if (this.useRotation && this.rotationKeys.length > 0) {
            return this.rotationKeys[this.currentKeyIndex];
        }
        
        return '';
    }

    // NUEVO: Rotar a la siguiente API key
    rotateApiKey() {
        if (this.rotationKeys.length <= 1) return false;
        
        this.currentKeyIndex = (this.currentKeyIndex + 1) % this.rotationKeys.length;
        console.log(`🔄 Rotando a API key ${this.currentKeyIndex + 1}/${this.rotationKeys.length}`);
        return true;
    }

    // NUEVO: Verificar si el error requiere rotación
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

    // NUEVO: Realizar llamada a API con rotación automática
    async makeApiCallWithRotation(requestBody, maxRetries = null) {
        // Si no hay rotación disponible, usar método tradicional
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

                // Si la respuesta es exitosa, retornar
                if (response.ok) {
                    const data = await response.json();
                    console.log(`✅ Éxito con API key ${this.currentKeyIndex + 1}`);
                    return { success: true, data };
                }

                // Analizar el error
                const errorData = await response.json();
                const error = new Error(`Error ${response.status}: ${errorData.error?.message || 'Error desconocido'}`);
                
                // Si el error requiere rotación y tenemos más keys, rotar
                if (this.shouldRotateKey(error, response.status) && this.rotateApiKey()) {
                    lastError = error;
                    console.log(`⚠️ Error con key ${this.currentKeyIndex}:`, error.message);
                    continue; // Intentar con la siguiente key
                } else {
                    // Error que no requiere rotación o no hay más keys
                    throw error;
                }

            } catch (fetchError) {
                lastError = fetchError;
                
                // Si es un error de red, no rotar
                if (fetchError instanceof TypeError) {
                    throw fetchError;
                }
                
                // Si tenemos más keys disponibles, intentar rotar
                if (this.rotateApiKey()) {
                    console.log(`⚠️ Error con key ${this.currentKeyIndex}:`, fetchError.message);
                    continue;
                } else {
                    throw fetchError;
                }
            }
        }

        // Si llegamos aquí, todas las keys fallaron
        throw new Error(`Todas las API keys agotadas. Último error: ${lastError?.message || 'Error desconocido'}`);
    }

    // NUEVO: Método tradicional para llamadas sin rotación
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

    // NUEVO: Cargar configuración desde localStorage
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

    // NUEVO: Cargar configuración desde Firebase (sobrescribe localStorage si existe)
    async loadSettingsFromFirebase() {
        try {
            if (window.loadedApiKey) {
                this.apiKey = window.loadedApiKey;
                // Sincronizar con localStorage
                localStorage.setItem('chatbot_api_key', this.apiKey);
                console.log('✅ API Key cargada desde Firebase y sincronizada con localStorage');
            }
            
            if (window.loadedModel) {
                this.selectedModel = window.loadedModel;
                // Sincronizar con localStorage
                localStorage.setItem('chatbot_selected_model', this.selectedModel);
                console.log('✅ Modelo cargado desde Firebase y sincronizado con localStorage');
            }
        } catch (error) {
            console.warn('⚠️ Error cargando desde Firebase:', error);
        }
    }

    // NUEVO: Guardar configuración en localStorage
    saveSettingsToLocalStorage() {
        try {
            localStorage.setItem('chatbot_api_key', this.apiKey);
            localStorage.setItem('chatbot_selected_model', this.selectedModel);
            console.log('✅ Configuración guardada en localStorage');
        } catch (error) {
            console.error('❌ Error guardando en localStorage:', error);
        }
    }

    // NUEVO: Guardar configuración en Firebase
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

    // NUEVO: Limpiar configuración de localStorage
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

    // MODIFICADO: Ahora guarda en ambos sitios
    async saveSettings() {
        const newApiKey = this.apiKeyInput.value.trim();
        const newModel = this.modelSelect.value;
        
        // Solo actualizar si hay cambios
        const hasChanges = (newApiKey !== this.apiKey) || (newModel !== this.selectedModel);
        
        this.apiKey = newApiKey;
        this.selectedModel = newModel;

        if (hasChanges) {
            // Guardar en localStorage siempre
            this.saveSettingsToLocalStorage();
            
            // Guardar en Firebase si hay usuario logueado
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
            'google/gemma-2-9b-it:free': 'Gemma 2 9B (Free)'
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
                `✅ API Personal - Modelo: ${this.getModelName()}` : 
                `✅ Rotación Activa - Modelo: ${this.getModelName()}`;
            this.statusDiv.textContent = statusText;
            this.statusDiv.style.background = '#d4edda';
            this.statusDiv.style.color = '#155724';
            
            // Mostrar bienvenida si no hay conversación iniciada
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
        
        // Si no hay mensajes y no hemos empezado, mostrar mensaje de bienvenida
        if (this.messages.length === 0 && !this.conversationStarted && this.getActiveApiKey()) {
            this.displayWelcomeMessage();
        } else {
            // Cargar mensajes existentes en memoria
            this.messages.forEach(message => {
                this.displayMessage(message.content, message.role);
            });
        }
        
        this.scrollToBottom();
    }

    displayWelcomeMessage() {
        const welcomeMessage = "Hola 🌸 Soy Aura, estoy aquí para escucharte sin juzgar.\n\nSoy una IA, no un profesional de salud. Si estás en crisis, busca ayuda profesional.\n\n¿Cómo estás hoy?";
        this.displayMessage(welcomeMessage, 'assistant');
        this.messages.push({ role: 'assistant', content: welcomeMessage });
        this.conversationStarted = true;
    }

    displayMessage(content, role) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role === 'user' ? 'user' : 'bot'}`;

        if (role === 'assistant') {
            // Para el bot: convierte Markdown a HTML y lo sanitiza
            const rawHtml = marked.parse(content);
            messageDiv.innerHTML = DOMPurify.sanitize(rawHtml);
        } else {
            // Para el usuario: muestra el texto como siempre para seguridad
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

    // MODIFICADO: Usar el nuevo sistema de rotación
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

        // Prepara los mensajes para la API, incluyendo el prompt del sistema
        const apiMessages = [];

        // 1. System Prompt estilo Calmi.so
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

**EJEMPLO DE ERROR 1 (Confundir temas opuestos):**
*   Usuario: "A ver, ¿podemos trabajar en adelgazar?"
*   RESPUESTA INCORRECTA: "Entendido. ¿Entonces lo que quieres es ganar peso?..."
*   **CORRECCIÓN:** Esta respuesta es confusa y contradice al usuario.

**EJEMPLO DE ERROR 2 (Interpretación extraña y sin base):**
*   Usuario: "Quiero engordar."
*   RESPUESTA INCORRECTA: "Te entiendo. Sentir ese peso de la tristeza... es agotador, ¿verdad?"
*   **CORRECCIÓN:** La IA asumió que "peso" era emocional sin ninguna pista. Es un salto ilógico.

**EJEMPLO DE RESPUESTA CORRECTA ANTE LA DUDA:**
*   Usuario: "Quiero engordar."
*   **RESPUESTA IDEAL:** "Entendido. ¿Te gustaría contarme un poco más sobre ese objetivo? Así puedo comprender mejor qué buscas."

**EJEMPLO DE RESPUESTA CORRECTA ANTE ALGO ININTELIGIBLE:**
*   Usuario: "Me siento mal" (o cualquier frase ambigua)
*   **RESPUESTA IDEAL:** "Lamento que te sientas así. ¿Puedes contarme un poco más sobre qué es lo que te pasa?"

---

**Crisis (autolesión/suicidio):**
"Me preocupa mucho lo que dices. Esto es muy serio para manejarlo solo/a. Por favor, busca ayuda profesional ahora. Tu vida importa."

**IMPORTANTE: Recuerda SIEMPRE el contexto de mensajes anteriores. Haz referencia a cosas que el usuario mencionó antes para mostrar que escuchas y recuerdas.**

**RECORDATORIO: Varía entre validación, insights y preguntas. No siempre preguntes. Sé cálida pero inteligente.**
`;
        
        apiMessages.push({ role: 'system', content: systemPrompt });

        // 2. Añade TODOS los mensajes del historial (excluyendo el mensaje de bienvenida automático si es el primero)
        const conversationMessages = this.messages.filter(msg => {
            // Excluir solo el primer mensaje de bienvenida automático
            return !(msg.role === 'assistant' && msg.content.includes('Hola 🌸 Soy Aura') && this.messages.indexOf(msg) === 0);
        });
        
        apiMessages.push(...conversationMessages);

        console.log('📝 Mensajes enviados a la API:', apiMessages); // Para debug

        const requestBody = {
            model: this.selectedModel,
            messages: apiMessages,
            temperature: 0.9,
            max_tokens: 300,
            top_p: 0.9,
            frequency_penalty: 0.3,
            presence_penalty: 0.4,
            stream: false
        };

        try {
            // MODIFICADO: Usar el nuevo sistema de rotación
            const result = await this.makeApiCallWithRotation(requestBody);
            
            this.hideTyping();
            
            if (result.success) {
                const botMessage = result.data.choices[0].message.content;
                this.displayMessage(botMessage, 'assistant');
                this.messages.push({ role: 'assistant', content: botMessage });
            }

        } catch (error) {
            this.hideTyping();
            console.error('Error:', error);
            this.displayMessage(`Error: ${error.message}`, 'assistant');
            
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
        this.messagesContainer.innerHTML = '';
        
        // Mostrar mensaje de bienvenida nuevamente si hay API key
        if (this.getActiveApiKey()) {
            this.displayWelcomeMessage();
        }
    }

    // NUEVO: Método para gestión completa de configuración
    async resetSettings() {
        this.apiKey = '';
        this.selectedModel = 'google/gemma-2-9b-it:free';
        
        // Limpiar localStorage
        this.clearLocalStorageSettings();
        
        // Si hay usuario, también limpiar Firebase
        if (this.currentUser) {
            await this.saveSettingsToFirebase();
        }
        
        this.updateUI();
        console.log('🔄 Configuración restablecida');
    }

    // NUEVO: Obtener información del almacenamiento actual
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

    // NUEVO: Método para debug - obtener claves ofuscadas
    obfuscateKey(plainKey) {
        return btoa(plainKey);
    }
}

// Inicializar la aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    // Solo inicializar si no estamos esperando autenticación
    if (document.getElementById('app-container').style.display !== 'none') {
        window.chatBot = new ChatBot(); // Hacer accesible globalmente para debug
    } else {
        // Esperar a que se complete la autenticación
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                    const appContainer = document.getElementById('app-container');
                    if (appContainer.style.display !== 'none') {
                        window.chatBot = new ChatBot(); // Hacer accesible globalmente para debug
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