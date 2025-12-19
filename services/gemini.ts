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

  const prompt = `
    Você é um redator especialista em SEO e estrategista de conteúdo (Copywriter Senior).
    
    TAREFA: Escrever um artigo de Guest Post de alta qualidade e engajamento.
    IDIOMA: Português do Brasil (pt-BR).
    
    CONTEXTO:
    - O artigo será publicado em um Site Hospedeiro (Nicho: "${req.hostNiche}").
    - O artigo deve linkar para um Site Alvo (Nicho: "${req.targetNiche}").
    - O tópico principal/palavra-chave é: "${req.keyword}".
    
    REQUISITOS:
    1. **Título**: Crie um título chamativo e otimizado para SEO, relevante para o Nicho do Hospedeiro.
    2. **Tom de Voz**: Profissional, informativo e que se encaixe naturalmente com a audiência do Site Hospedeiro.
    3. **Estrutura**: Use cabeçalhos Markdown adequados (H1, H2, H3), bullet points e parágrafos curtos para facilitar a leitura.
    4. **A Ponte (Contexto)**: Faça uma transição inteligente e natural entre o Nicho do Hospedeiro (${req.hostNiche}) e o Nicho do Alvo (${req.targetNiche}). A conexão não deve parecer forçada.
    5. **O Link**: Você OBRIGATORIAMENTE deve incluir o texto âncora exato "${req.anchorText}" exatamente UMA VEZ.
    6. **Formato do Link**: Use o formato de link Markdown: [${req.anchorText}](${req.targetLink}).
    7. **Conteúdo**: Escreva entre 600-800 palavras de conteúdo valioso.
    8. **Conclusão**: Resuma os pontos chave e encoraje o engajamento do leitor.

    SAÍDA:
    Retorne APENAS o conteúdo do artigo em Markdown. Não inclua texto introdutório ou explicações como "Aqui está o artigo".
  `;

  let lastError: any = null;

  // Rotation Logic
  for (const apiKey of apiKeys) {
      try {
        const ai = new GoogleGenAI({ apiKey });
        
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
                thinkingConfig: { thinkingBudget: 1024 },
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
        continue;
      }
  }

  // If we exit the loop, all keys failed
  const finalErrorMsg = lastError?.message || lastError?.toString() || "Todas as chaves API falharam.";
  throw new Error(finalErrorMsg);
};