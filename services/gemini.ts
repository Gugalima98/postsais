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
    
    TAREFA: Escrever um artigo de Guest Post de alta qualidade, engajador e aprofundado.
    IDIOMA: Português do Brasil (pt-BR).
    
    CONTEXTO E DESAFIO:
    - O Site Hospedeiro (onde será postado) é do Nicho: "${req.hostNiche}".
    - O Site Alvo (para onde aponta o backlink) é do Nicho: "${req.targetNiche}".
    - A palavra-chave "${req.keyword}" deve ser utilizada de forma 100% natural e contextualizada.
    
    REQUISITOS:
    1. **Título (Pragmático e Direto)**: Crie um título focado EXCLUSIVAMENTE nas dores, curiosidades ou interesses do público do Nicho "${req.hostNiche}".
       - PROIBIDO o uso de tom poético, filosófico ou abstrato (ex: "A Essência Inatingível", "A Magia de...").
       - PROIBIDO o uso de dois pontos (:) ou traços (-) para dividir o título. Forme uma única frase coesa e direta.
       - O nicho do Site Alvo ("${req.targetNiche}") NÃO DEVE aparecer no título em hipótese alguma.
       - PROIBIDO o uso de clichês de internet ("Descubra como...", "O Guia Definitivo...", "O Segredo de...", "Tudo o que você precisa").
    
    2. **Foco do Conteúdo (Regra 80/20)**: O artigo deve ser 80% a 90% mergulhado no universo do Nicho "${req.hostNiche}". O Nicho "${req.targetNiche}" exposto como assunto alvo, e a palavra-chave, devem entrar apenas como um complemento útil, uma ferramenta ou consequência lógica dentro do contexto, sem quebrar o ritmo da leitura do Nicho principal ou mudar bruscamente de assunto.
    
    3. **A Regra da Transição Orgânica (A Âncora)**: Você OBRIGATORIAMENTE deve incluir o texto âncora exato "${req.anchorText}" exatamente UMA VEZ.
       - A inserção deve ser sutil e passar quase despercebida. Crie um cenário prático no texto onde o Nicho "${req.targetNiche}" surge como uma solução ou contexto natural para encaixar a palavra-chave. Não jogue o link de paraquedas nem faça o texto girar em torno dele a partir daí.
       - Formato do Link: Use INVARIAVELMENTE o formato Markdown OBRIGATÓRIO: [${req.anchorText}](${req.targetLink}).
    
    4. **Tamanho do Artigo**: Escreva um artigo LONGO e aprofundado, com no **mínimo 1500 palavras**. Desenvolva os tópicos extensivamente.
    
    5. **Estrutura**: Use cabeçalhos Markdown adequados (H1, H2, H3), bullet points, parágrafos curtos para escaneabilidade.
    
    6. **Conclusão**: Encerre de forma útil focando no aprendizado principal para quem é do Nicho "${req.hostNiche}".

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
        
        // Espera 3 segundos antes de tentar a próxima chave para evitar ban imediato por Rate Limit sequencial 
        await new Promise(resolve => setTimeout(resolve, 3000));
        continue;
      }
  }

  // If we exit the loop, all keys failed
  const finalErrorMsg = lastError?.message || lastError?.toString() || "Erro desconhecido.";
  throw new Error(`Tentou gerar em ${apiKeys.length} chaves diferentes e todas falharam (Cotão excedido ou erro). Último erro: ${finalErrorMsg}`);
};