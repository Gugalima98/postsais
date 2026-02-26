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

  const prompt = `Você é um redator especialista em SEO e estrategista de conteúdo (Copywriter Senior).

TAREFA: Escrever um artigo de Guest Post de alta qualidade, engajador e aprofundado.

IDIOMA: Português do Brasil (pt-BR).

CONTEXTO E DESAFIO:

- O Site Hospedeiro (onde será postado) é do Nicho: "${req.hostNiche}".

- O Site Alvo (para onde aponta o backlink) é do Nicho: "${req.targetNiche}".

- A palavra-chave "${req.keyword}" deve ser utilizada de forma 100% natural e contextualizada no meio do texto.

REQUISITOS OBRIGATÓRIOS:

1. **REGRA DE OURO DO TÍTULO**: O título DEVE SER 100% focado no Nicho "${req.hostNiche}".

- Trate como se você estivesse escrevendo exclusivamente para um blog de "${req.hostNiche}".

- É ESTRITAMENTE PROIBIDO mencionar, sugerir ou dar a entender qualquer coisa relacionada ao Nicho "${req.targetNiche}" no título.

- PROIBIDO o uso de palavras que remetam a "${req.targetNiche}".

- PROIBIDO tons poéticos, filosóficos ou clichês de internet ("A Arte de...", "O Segredo de...", "Descubra...").

- Seja direto, resolvendo uma dor ou curiosidade do público de "${req.hostNiche}".

- PROIBIDO o uso de dois pontos (:) ou traços (-) para dividir o título.

2. **Foco do Conteúdo (Regra 80/20)**: O artigo deve ser 80% a 90% mergulhado no universo do Nicho "${req.hostNiche}". O Nicho "${req.targetNiche}" e a palavra-chave devem entrar apenas como um complemento útil, uma ferramenta ou consequência lógica dentro do contexto, sem quebrar o ritmo da leitura do Nicho principal ou mudar bruscamente de assunto. A palavra-chave NUNCA deve ser o destaque do texto.

3. **A Regra da Transição Orgânica (A Cimentação da Âncora)**: Você OBRIGATORIAMENTE deve incluir o texto âncora exato "${req.anchorText}" exatamente UMA VEZ.

- A inserção deve passar em um "teste de naturalidade falada". Se lido em voz alta, a frase da âncora não pode soar robótica, estrangeira ou forçada (Exemplo de erro: "na busca por uma residência, como um [quinta da baroneza aluguel]").

- Se a palavra-chave ("${req.keyword}") for solta ou truncada (como termos de busca de Google ex: "comprar apartamento sp"), você DEVE construir uma frase de apoio ao redor dela para que ela faça sentido gramatical (ex: "quem decide [comprar apartamento sp] enfrenta os mesmos dilemas de ansiedade").

- Introduza o Nicho alvo ("${req.targetNiche}") como um exemplo pontual e cotidiano da vida real de alguem do Nicho "${req.hostNiche}", e não como a solução mágica de todos os problemas. Apenas cite de passagem, coloque o link, e continue o raciocínio focado original.

- Formato do Link: Use INVARIAVELMENTE o formato Markdown OBRIGATÓRIO: [${req.anchorText}](${req.targetLink}).

4. **Tamanho do Artigo**: Escreva um artigo LONGO e aprofundado, com no **mínimo 1500 palavras**.

5. **Estrutura**: Use cabeçalhos Markdown adequados (H1, H2, H3), bullet points e parágrafos curtos.

6. **Conclusão**: Encerre focando totalmente no aprendizado para o Nicho "${req.hostNiche}". O site alvo não deve ser a conclusão da história.

SAÍDA EXIGIDA:

Retorne APENAS o conteúdo completo do artigo em formato Markdown, começando com o # Título. Não inclua texto introdutório.
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