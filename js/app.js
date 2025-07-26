class ChatBot {
    constructor() {
        // Configuración persistente (seguimos usando localStorage para settings)
        this.apiKey = localStorage.getItem('openrouter_api_key') || '';
        this.selectedModel = localStorage.getItem('selected_model') || 'google/gemma-2-9b-it:free';
        
        // MEMORIA EN VARIABLES - Solo durante la sesión actual
        this.messages = [];
        this.conversationStarted = false;
        
        this.baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
        this.initializeElements();
        this.setupEventListeners();
        this.loadMessages();
        this.updateUI();
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

    saveSettings() {
        this.apiKey = this.apiKeyInput.value.trim();
        this.selectedModel = this.modelSelect.value;

        localStorage.setItem('openrouter_api_key', this.apiKey);
        localStorage.setItem('selected_model', this.selectedModel);

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

            // YA NO guardamos en localStorage - solo en memoria

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
}

// Inicializar la aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    new ChatBot();
});