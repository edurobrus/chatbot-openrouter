class ChatBot { 
    constructor() { 
        this.apiKey = localStorage.getItem('openrouter_api_key') || ''; 
        this.selectedModel = localStorage.getItem('selected_model') || 'anthropic/claude-3.5-sonnet'; 
        this.messages = JSON.parse(localStorage.getItem('chat_messages')) || []; 
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
            this.statusDiv.textContent = `? Conectado - Modelo: ${this.getModelName()}`; 
            this.statusDiv.style.background = '#d4edda'; 
            this.statusDiv.style.color = '#155724'; 
        } else { 
            this.statusDiv.textContent = '?? Configura tu API key para empezar'; 
            this.statusDiv.style.background = '#fff3cd'; 
            this.statusDiv.style.color = '#856404'; 
        } 
    } 
 
    getModelName() { 
        const modelNames = { 
            'anthropic/claude-3.5-sonnet': 'Claude 3.5 Sonnet', 
            'openai/gpt-4o': 'GPT-4o', 
            'openai/gpt-3.5-turbo': 'GPT-3.5 Turbo', 
            'meta-llama/llama-3.1-8b-instruct:free': 'Llama 3.1 8B (Free)' 
        }; 
        return modelNames[this.selectedModel] || this.selectedModel; 
    } 
 
    updateUI() { 
        const hasApiKey = !!this.apiKey; 
        this.messageInput.disabled = !hasApiKey; 
        this.sendBtn.disabled = !hasApiKey; 
 
        if (hasApiKey) { 
            this.messageInput.placeholder = 'Escribe tu mensaje aqu¡...'; 
            this.statusDiv.textContent = `? Conectado - Modelo: ${this.getModelName()}`; 
            this.statusDiv.style.background = '#d4edda'; 
            this.statusDiv.style.color = '#155724'; 
        } else { 
            this.messageInput.placeholder = 'Configura tu API key primero...'; 
            this.statusDiv.textContent = '?? Configura tu API key para empezar'; 
            this.statusDiv.style.background = '#fff3cd'; 
            this.statusDiv.style.color = '#856404'; 
        } 
    } 
 
    loadMessages() { 
        this.messagesContainer.innerHTML = ''; 
        this.messages.forEach(message => { 
            this.displayMessage(message.content, message.role); 
        }); 
        this.scrollToBottom(); 
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
                    messages: this.messages, 
                    temperature: 0.7, 
                    max_tokens: 1000 
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
 
            // Guardar conversaci¢n 
            localStorage.setItem('chat_messages', JSON.stringify(this.messages)); 
 
        } catch (error) { 
            this.hideTyping(); 
            console.error('Error:', error); 
            this.displayMessage(`Error: ${error.message}`, 'assistant'); 
ECHO est  desactivado.
            // Actualizar estado de error 
            this.statusDiv.textContent = `? Error: ${error.message}`; 
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
        localStorage.removeItem('chat_messages'); 
        this.loadMessages(); 
    } 
} 
 
// Inicializar la aplicaci¢n cuando el DOM est‚ listo 
document.addEventListener('DOMContentLoaded', () => { 
    new ChatBot(); 
}); 
