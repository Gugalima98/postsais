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
    
    TAREFA: Escrever um artigo de Guest Post de alta qualidade, extremamente engajador e aprofundado.
    IDIOMA: Português do Brasil (pt-BR).
    
    CONTEXTO E DESAFIO:
    O objetivo principal deste artigo é criar uma ponte natural e orgânica entre dois universos distintos:
    - O Site Hospedeiro (onde será postado), focado no Nicho: "${req.hostNiche}".
    - O Site Alvo (para onde aponta o backlink), focado no Nicho: "${req.targetNiche}".
    - A palavra-chave "${req.keyword}" deve ser utilizada de forma natural, SEM excessos ou protagonismo exagerado. O foco real é o elo entre os dois universos acima.
    
    REQUISITOS:
    1. **Título Contextual**: Crie um título natural que contextualize o Nicho "${req.hostNiche}" com o Nicho "${req.targetNiche}". REGRA IMPORTANTE: É expressamente proibido usar o formato com dois pontos ("Frase: Explicação"). Varie a estrutura do título sempre, criando uma frase única, fluida e orgânica.
    
    2. **O Equilíbrio Natural (50/50)**: Reserve estritamente a primeira metade do texto para explorar o universo, curiosidades e dores do público do Nicho "${req.hostNiche}". Só na segunda metade do texto faça uma transição lógica para apresentar o Nicho "${req.targetNiche}" como evolução do assunto. Todo o conteúdo deve ser uma conexão elegante e não forçada entre esses dois pólos.
    
    3. **Tamanho do Artigo**: Escreva um artigo LONGO e aprofundado, com no **mínimo 1500 palavras**. Desenvolva os tópicos extensivamente.
    
    4. **Estrutura**: Use cabeçalhos Markdown adequados (H1, H2, H3), bullet points, parágrafos curtos para escaneabilidade e aplique gatilhos mentais e storytelling.
    
    5. **O Link (MUITO IMPORTANTE)**: Você OBRIGATORIAMENTE deve incluir o texto âncora exato "${req.anchorText}" exatamente UMA VEZ.
    
    6. **Formato do Link**: Use o formato de link Markdown OBRIGATÓRIO: [${req.anchorText}](${req.targetLink}). 
    
    7. **Conclusão e CTA**: Encerre de forma inspiradora e faça os temas conversarem uma última vez.

    SAÍDA EXIGIDA:
    Retorne APENAS o conteúdo completo do artigo em formato Markdown. Não inclua NENHUM texto introdutório do tipo "Aqui está o artigo" ou considerações finais.
  `;

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
        continue;
      }
  }

  // If we exit the loop, all keys failed
  const finalErrorMsg = lastError?.message || lastError?.toString() || "Todas as chaves API falharam.";
  throw new Error(finalErrorMsg);
};