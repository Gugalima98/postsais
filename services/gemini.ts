import { GoogleGenAI } from "@google/genai";
import { GuestPostRequest } from "../types";

// Helper to get all available keys: LocalStorage + Environment Variable
const getAvailableApiKeys = (): string[] => {
    let keys: string[] = [];
    
    // 1. Check LocalStorage (User provided keys)
    try {
        const stored = localStorage.getItem('guestpost_gemini_keys');
        if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) keys = [...parsed];
        }
    } catch (e) {
        console.error("Erro ao ler chaves do localStorage", e);
    }

    // 2. Add System Default Key (Environment Variable)
    // process.env.API_KEY is replaced by Vite at build time.
    if (process.env.API_KEY && !keys.includes(process.env.API_KEY)) {
        keys.push(process.env.API_KEY);
    }

    return keys.filter(k => k && k.trim().length > 0);
};

export const generateGuestPostContent = async (req: GuestPostRequest): Promise<string> => {
  const apiKeys = getAvailableApiKeys();
  
  if (apiKeys.length === 0) {
      throw new Error("Nenhuma chave API do Gemini encontrada. Configure nas Configurações ou no arquivo .env");
  }

  // Lê o prompt customizado
  let customPromptStr = "";
  try {
      customPromptStr = localStorage.getItem('guestpost_custom_prompt') || "";
  } catch(e) {}

  if (customPromptStr.trim().length === 0) {
      throw new Error("Nenhum prompt configurado. Por favor, vá em Configurações e salve o seu prompt da IA.");
  }

  // Injeta as variáveis do request nele
  const prompt = customPromptStr
    .replace(/\$\{req\.hostNiche\}/g, req.hostNiche)
    .replace(/\$\{req\.targetNiche\}/g, req.targetNiche)
    .replace(/\$\{req\.keyword\}/g, req.keyword)
    .replace(/\$\{req\.anchorText\}/g, req.anchorText)
    .replace(/\$\{req\.targetLink\}/g, req.targetLink);

  let lastError: any = null;

  // Rotation Logic
  for (const apiKey of apiKeys) {
      try {
        const ai = new GoogleGenAI({ apiKey });
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                maxOutputTokens: 8192, 
            }
        });

        if (!response.text) {
            throw new Error("API retornou resposta vazia.");
        }

        return response.text; // Success! Return immediately.

      } catch (error: any) {
        const msg = error.message || error.toString();
        console.warn(`Falha com a chave API (final ...${apiKey.slice(-4)}): ${msg}`);
        lastError = error;
        
        // If it's a safety filter error (which is prompt related, not key related), usually we shouldn't retry with another key.
        // However, standard API errors like 429 (Quota), 500, 503 should definitely retry with next key.
        // For simplicity and robustness in batch mode, we continue to the next key on almost any error.
        
        // Espera 3 segundos antes de tentar a próxima chave para evitar ban imediato por Rate Limit sequencial 
        await new Promise(resolve => setTimeout(resolve, 3000));
        continue;
      }
  }

  // If we exit the loop, all keys failed
  const finalErrorMsg = lastError?.message || lastError?.toString() || "Erro desconhecido.";
  throw new Error(`Tentou gerar em ${apiKeys.length} chaves diferentes e todas falharam (Cotão excedido ou erro). Último erro: ${finalErrorMsg}`);
};

export const generateSeoArticleContent = async (req: import('../types').SeoArticleRequest): Promise<string> => {
  const apiKeys = getAvailableApiKeys();
  
  if (apiKeys.length === 0) {
      throw new Error("Nenhuma chave API do Gemini encontrada. Configure nas Configurações ou no arquivo .env");
  }

  // Lê o prompt customizado de SEO
  let seoPromptStr = "";
  try {
      seoPromptStr = localStorage.getItem('guestpost_seo_prompt') || "";
  } catch(e) {}

  if (seoPromptStr.trim().length === 0) {
      seoPromptStr = `Você é um redator especialista em SEO Content. 

TAREFA: Escrever um artigo focado em SEO de altíssima qualidade seguindo ESTRITAMENTE a estrutura fornecida.
IDIOMA: Português do Brasil (pt-BR).

DADOS DO PROJETO:
- Palavra-chave principal (H1): "\${req.keyword}"

ESTRUTURA OBRIGATÓRIA (Tópicos e Tags):
\${req.topicsList}

DIRETRIZES:
1. O artigo DEVE seguir a hierarquia exata de tags fornecida acima (ex: H2, H3, H4). Você deve usar as marcações Markdown apropriadas: # para H1, ## para H2, ### para H3, etc.
2. Desenvolva um texto denso e aprofundado para CADA tópico da estrutura.
3. Não crie novos tópicos e não ignore nenhum tópico da estrutura obrigatória.
4. Mantenha um tom direto e informativo.

SAÍDA EXIGIDA:
Retorne APENAS o conteúdo completo do artigo em Markdown. Nenhuma palavra antes ou depois do artigo.`;
  }

  const topicsList = req.topics.map(t => `- [${t.tag.toUpperCase()}] ${t.topic}`).join('\n');

  // Injeta as variáveis do request nele
  const prompt = seoPromptStr
    .replace(/\$\{req\.keyword\}/g, req.keyword)
    .replace(/\$\{req\.topicsList\}/g, topicsList);

  let lastError: any = null;

  for (const apiKey of apiKeys) {
      try {
        const ai = new GoogleGenAI({ apiKey });
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                maxOutputTokens: 8192, 
            }
        });

        if (!response.text) {
            throw new Error("API retornou resposta vazia.");
        }

        return response.text;

      } catch (error: any) {
        const msg = error.message || error.toString();
        console.warn(`Falha rápida com a chave API (final ...${apiKey.slice(-4)}): ${msg}`);
        lastError = error;
        await new Promise(resolve => setTimeout(resolve, 3000));
        continue;
      }
  }

  const finalErrorMsg = lastError?.message || lastError?.toString() || "Erro desconhecido.";
  throw new Error(`Tentou gerar SEO em ${apiKeys.length} chaves diferentes e todas falharam. Último erro: ${finalErrorMsg}`);
};