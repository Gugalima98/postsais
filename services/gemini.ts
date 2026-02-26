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

  const prompt = `Você é um redator especialista em SEO Content e estrategista de Link Building (Copywriter Senior).

TAREFA: Escrever um artigo de Guest Post de altíssima qualidade, denso e engajador, pronto para publicação.
IDIOMA: Português do Brasil (pt-BR).

DADOS DO PROJETO:
- Nicho do Site Hospedeiro (onde será postado): "${req.hostNiche}"
- Nicho do Site Alvo (para onde o link aponta): "${req.targetNiche}"
- Texto Âncora Exato: "${req.anchorText}"
- Link Alvo: "${req.targetLink}"
- Palavra-chave de Contexto: "${req.keyword}"

DIRETRIZES DE CONTEÚDO E TOM:
1. FOCO TOTAL NO HOSPEDEIRO: O artigo pertence 100% ao universo do nicho "${req.hostNiche}". Escreva para a audiência deste nicho. O tom deve ser direto, jornalístico, prático e focado em resolver dores reais desse público. Evite introduções longas e clichês.
2. TÍTULO MAGNÉTICO (H1): Crie um título altamente atraente e focado exclusivamente em "${req.hostNiche}". O título deve ser limpo (sem o uso de dois pontos ou traços) e não pode, sob nenhuma hipótese, fazer menção ou alusão ao nicho alvo ("${req.targetNiche}").
3. DESENVOLVIMENTO PROFUNDO: Estruture o texto com H2 e H3. Em vez de focar em contagem de palavras, foque em densidade. Desenvolva pelo menos 4 a 5 seções aprofundadas sobre o tema principal. Explique o "como" e o "porquê" das coisas.
4. A PONTE SEMÂNTICA (A INSERÇÃO DO LINK): O nicho alvo ("${req.targetNiche}") deve entrar no texto apenas como um exemplo prático, uma ferramenta ou uma citação rápida que apoia o raciocínio do nicho principal. A transição deve ser imperceptível. 
5. REGRA DO TEXTO ÂNCORA: Insira o texto âncora exato ("${req.anchorText}") apenas UMA VEZ no texto. A frase que contém a âncora deve ter fluidez gramatical perfeita ("teste de leitura em voz alta"). Se a âncora for um termo de busca truncado, construa a frase ao redor para que faça sentido absoluto.
6. FORMATO DO LINK: A âncora deve OBRIGATORIAMENTE ser formatada em Markdown desta exata maneira: [${req.anchorText}](${req.targetLink}). Nenhuma outra palavra deve entrar nos colchetes.
7. CONCLUSÃO: O artigo deve terminar reforçando o aprendizado principal para o público de "${req.hostNiche}". Não mencione a solução do site alvo na conclusão.

SAÍDA EXIGIDA:
Retorne APENAS o conteúdo completo do artigo em Markdown, começando diretamente pelo # Título. Nenhuma palavra antes ou depois do artigo.
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