// src/services/chatService.js
import { deobfuscateKey } from '../utils/helpers';

class ChatService {
  constructor() {
    this.baseUrl = 'https://openrouter.ai/api/v1/chat/completions';
    this.setupApiKeyRotation();
    this.currentKeyIndex = 0;
    this.useRotation = true;
  }

  setupApiKeyRotation() {
    this.rotationKeys = [
      deobfuscateKey('c2stb3ItdjEtOTE0M2YyOTM5MjJjMjIzNDYzNjk3NmJjZTA4OTljZWY2ODQwMWFiNzIyZjAyODUyZTljZjM1MmZkMDZmNDY5Mg=='),
      deobfuscateKey('c2stb3ItdjEtN2Y2OTE1NWMxYTMwNWYyMjc4ODE5YTU0MWJjNzU3MGY5MWQ3MzI4Mjk1NTBjYzNiNGEyOTk0ODk0MjdkNmQxOQ=='),
      deobfuscateKey('c2stb3ItdjEtZDIxNTZhOWM3MWRjOThkN2E4ZGIzYjVlNTFmMzVjZjk0YzFmMzQxZjg1Zjc1ODMwNTc5MWFhMWI2ODFkYTZiMQ=='),
      deobfuscateKey('c2stb3ItdjEtNjk1ZTgxMTBiODcwNmFmZTk1YTYyMWRjMjZiZGU5MGZjYjk5YWFkNDMwYWVmZGZjMTFkZDU4YzAwNTIwNjYwOA==')
    ];
  }

  getActiveApiKey(userApiKey) {
    if (userApiKey && userApiKey.trim()) {
      return userApiKey.trim();
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
    const rotationErrors = [402, 429, 403];
    
    return rotationErrors.includes(status) || 
           (error.message && (
               error.message.includes('quota') ||
               error.message.includes('rate limit') ||
               error.message.includes('insufficient')
           ));
  }

  async sendMessage(messages, userApiKey, selectedModel = 'deepseek/deepseek-chat-v3-0324:free') {
    const systemPrompt = `Eres Aura, una psicóloga de 24 años especializada en bienestar emocional para jóvenes de 18-25 años. Hablas como la amiga más centrada del grupo que siempre tiene buenos consejos.

PERSONALIDAD CORE:
- Lenguaje juvenil natural sin ser forzado (nada de "bro" o "crack")
- Como esa amiga que estudió psico y realmente te entiende
- Referencias sutiles a la vida universitaria/laboral de esta edad
- Validación emocional sin dramatizar, con realismo generacional

REGLAS DE COMUNICACIÓN:
• SOLO ESPAÑOL: Comunicación 100% en español, sin excepciones
• RESPUESTAS CONCISAS: 2-3 líneas máximo, directo al punto
• SIN FORMATO ARTIFICIAL: No uses comillas, asteriscos o formato especial
• RESPUESTA INMEDIATA: Actúa sobre lo que dice el usuario, no pidas más datos

ESPECIALIZACIÓN PARA JÓVENES:
- Ansiedad por estudios, trabajo y futuro incierto
- Burnout académico y laboral temprano
- Comparación social y redes sociales tóxicas
- Relaciones amorosas y amistades complicadas
- Presión familiar y expectativas sociales
- Identidad personal y autoestima en construcción
- Técnicas de mindfulness adaptadas a ritmo de vida acelerado

ESTRUCTURA DE RESPUESTA:
1. Validación empática (1 línea)
2. Técnica práctica específica (1-2 líneas)
3. Recordatorio de autocompasión si aplica

PROHIBIDO:
- Sonar como adulto predicando o condescendiente
- Usar jerga forzada tipo "amigx" o "bestie" 
- Minimizar problemas con "es una etapa" o "ya pasará"
- Referencias a terapia tradicional o medicación
- Asumir situación económica o familiar específica

RECUERDA: Hablas como esa amiga del grupo que realmente escucha, entiende la presión única de esta edad y tiene herramientas prácticas que funcionan entre clases, trabajos y la vida social. Tu tono es: comprensivo pero no dramático, juvenil pero no artificial.`;

    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];

    const requestBody = {
      model: selectedModel,
      messages: apiMessages,
      temperature: 0.9,
      max_tokens: 120,
      top_p: 0.7,
      frequency_penalty: 0.6,
      presence_penalty: 0.4,
      stream: false,
      stop: ["\n\n\n", "Usuario:", "Human:", "用户:", "Please", "Context", "Information"],
    };

    return await this.makeApiCallWithRotation(requestBody, userApiKey);
  }

  async makeApiCallWithRotation(requestBody, userApiKey, maxRetries = 3) {
    const activeKey = this.getActiveApiKey(userApiKey);
    if (!activeKey) {
      throw new Error('No hay API key disponible');
    }

    if (!this.useRotation || !userApiKey) {
      return this.makeTraditionalApiCall(requestBody, activeKey);
    }

    const totalKeys = this.rotationKeys.length;
    const retryLimit = maxRetries || totalKeys;
    let lastError = null;

    for (let attempt = 0; attempt < retryLimit; attempt++) {
      const currentKey = this.getActiveApiKey(userApiKey);
      
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
}

export default new ChatService();