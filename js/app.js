class ChatBot {
    constructor() {
        // Esperar a que Firebase esté listo
        this.waitForAuth();
    }

    async waitForAuth() {
        // Esperar hasta que Firebase esté inicializado y tengamos un usuario
        firebase.auth().onAuthStateChanged((user) => {
            this.currentUser = user;
            this.initializeApp();
        });
    }

    initializeApp() {
        // Configuración persistente con localStorage y Firebase
        this.apiKey = '';
        this.selectedModel = 'google/gemma-2-9b-it:free';
        
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

        if (this.apiKey) {
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
        const hasApiKey = !!this.apiKey;
        this.messageInput.disabled = !hasApiKey;
        this.sendBtn.disabled = !hasApiKey;

        if (hasApiKey) {
            this.messageInput.placeholder = 'Escribe tu mensaje aquí...';
            this.statusDiv.textContent = `✅ Conectado - Modelo: ${this.getModelName()}`;
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
        if (this.messages.length === 0 && !this.conversationStarted && this.apiKey) {
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
        messageDiv.textContent = content;
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

    async sendMessage() {
        const message = this.messageInput.value.trim();
        if (!message || !this.apiKey) return;

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
- Mezcla validación + insights psicológicos sutiles + apoyo genuino
- NO siempre hagas preguntas - a veces solo acompaña o da perspectiva
- Hablas como alguien de 25-30 años: moderna, empática, inteligente
- Usas conocimiento psicológico de forma sencilla y natural

**EJEMPLOS DE RESPUESTAS PERFECTAS:**

Usuario: "Estoy muy ansioso por el trabajo"
Aura: "La ansiedad laboral es súper común, no estás solo en esto 💙 Es como si el cerebro pusiera todas las alarmas a la vez."

Usuario: "No puedo dormir, mi mente no para"
Aura: "Uf, el cerebro nocturno es implacable... A veces ayuda recordar que los pensamientos a las 3am mienten mucho."

Usuario: "Creo que no le importo a nadie"
Aura: "Esa voz interior es súper cruel contigo 😔 Cuando estamos mal, el cerebro nos miente sobre cómo nos ven los demás."

Usuario: "Tuve una discusión terrible con mi pareja"
Aura: "Las peleas fuertes dejan esa sensación horrible en el pecho... Es normal necesitar tiempo para procesar."

Usuario: "No sé qué hacer con mi vida"
Aura: "Esa incertidumbre da tanto vértigo... Está bien no tenerlo todo claro, eres humana, no un GPS 💜"

Usuario: "Me siento muy sola"
Aura: "La soledad duele tanto, es como un vacío físico 😔 ¿Has notado si hay momentos del día donde se siente más pesada?"

Usuario: "Creo que soy un fracaso"
Aura: "Para nada eres un fracaso. Tu mente está en modo autocrítica extrema ahora mismo. Es temporal, aunque no lo sientas así."

**Crisis (autolesión/suicidio):**
"Me preocupa mucho lo que dices. Esto es muy serio para manejarlo solo/a. Por favor, busca ayuda profesional ahora. Tu vida importa."

**IMPORTANTE: Recuerda SIEMPRE el contexto de mensajes anteriores. Haz referencia a cosas que el usuario mencionó antes para mostrar que escuchas y recuerdas.**

**RECORDATORIO: Varía entre validación + insights + preguntas. No siempre preguntes. Sé cálida pero inteligente.**
        `;
        
        apiMessages.push({ role: 'system', content: systemPrompt });

        // 2. Añade TODOS los mensajes del historial (excluyendo el mensaje de bienvenida automático si es el primero)
        const conversationMessages = this.messages.filter(msg => {
            // Excluir solo el primer mensaje de bienvenida automático
            return !(msg.role === 'assistant' && msg.content.includes('Hola 🌸 Soy Aura') && this.messages.indexOf(msg) === 0);
        });
        
        apiMessages.push(...conversationMessages);

        console.log('📝 Mensajes enviados a la API:', apiMessages); // Para debug

        try {
            const response = await fetch(this.baseUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
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

            this.hideTyping();

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Error ${response.status}: ${errorData.error?.message || 'Error desconocido'}`);
            }

            const data = await response.json();
            const botMessage = data.choices[0].message.content;

            this.displayMessage(botMessage, 'assistant');
            this.messages.push({ role: 'assistant', content: botMessage });

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
        if (this.apiKey) {
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
            }
        };
        
        console.log('📊 Estado del almacenamiento:', info);
        return info;
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