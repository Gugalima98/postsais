import { WordpressSite, WordpressCategory } from "../types";

// Helper simple Markdown to HTML converter for WP Content
const markdownToHtml = (markdown: string): string => {
    let html = markdown;

    // Headers
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^#### (.*$)/gim, '<h4>$1</h4>');

    // Bold & Italic
    html = html.replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>');
    html = html.replace(/\*(.*)\*/gim, '<em>$1</em>');

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/gim, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    // Lists (Simple implementation)
    // Bullet points
    html = html.replace(/^\s*-\s+(.*)$/gim, '<li>$1</li>');
    // Wrap consecutive <li> in <ul> (This is a simplified regex approach, might not catch edge cases perfectly but works for simple lists)
    html = html.replace(/(<li>.*<\/li>)/gim, '<ul>$1</ul>'); 
    // Fix nested ULs created by the line above (collapsing multiple <ul><ul>... into one) - Basic cleanup
    html = html.replace(/<\/ul>\s*<ul>/gim, '');

    // Paragraphs: Double newlines to <p>
    html = html.replace(/\n\s*\n/g, '</p><p>');
    
    // Wrap raw text at start/end if not already wrapped
    if (!html.trim().startsWith('<')) {
        html = '<p>' + html;
    }
    if (!html.trim().endsWith('>')) {
        html = html + '</p>';
    }

    // Convert single newlines to <br> inside paragraphs
    html = html.replace(/\n/g, '<br>');

    return html;
};

// Helper to clean URL (remove wp-admin, trailing slashes, ensure protocol)
const cleanWpUrl = (url: string): string => {
    let clean = url.trim();
    
    // 1. Ensure Protocol (default to https if missing)
    if (!/^https?:\/\//i.test(clean)) {
        clean = 'https://' + clean;
    }

    // 2. Remove common WP paths if user pasted them
    clean = clean.replace(/\/$/, ''); // Remove trailing slash
    clean = clean.replace(/\/wp-admin.*$/, ''); 
    clean = clean.replace(/\/wp-login\.php.*$/, ''); 
    clean = clean.replace(/\/wp-json.*$/, ''); // If user pasted the API root
    
    return clean;
};

// Safe Basic Auth Encoding for Unicode (e.g. special chars in password)
const encodeBasicAuth = (user: string, pass: string) => {
    // Ensure no spaces
    const safeUser = user.trim();
    const safePass = pass.trim();

    // btoa alone fails on unicode strings, we need to escape first
    try {
        return btoa(unescape(encodeURIComponent(`${safeUser}:${safePass}`)));
    } catch (e) {
        return btoa(`${safeUser}:${safePass}`);
    }
};

// Generic Fetch Wrapper with 4-Step Fallback Strategy
const fetchWpWithFallback = async (site: WordpressSite, endpointPath: string, options: RequestInit = {}) => {
    const baseUrl = cleanWpUrl(site.url);
    const authString = encodeBasicAuth(site.username, site.appPassword);
    
    const headers = {
        'Authorization': `Basic ${authString}`,
        'Cache-Control': 'no-store, no-cache',
        'Pragma': 'no-cache',
        // Merge custom headers if any (like Content-Type for POST)
        ...(options.headers as Record<string, string> || {})
    };

    // Helper to execute a strategy
    const tryStrategy = async (label: string, url: string) => {
        console.log(`[WP] Trying ${label}: ${url}`);
        try {
            const response = await fetch(url, { ...options, headers });
            
            if (response.ok) return await response.json();
            
            if (response.status === 401 || response.status === 403) {
                 // Return explicit auth error to stop trying other strategies
                 throw new Error("AUTH_ERROR");
            }

            throw new Error(`Status ${response.status}`);
        } catch (error: any) {
            if (error.message === "AUTH_ERROR") throw new Error(`Erro 401/403: Acesso Negado em ${label}. Verifique Usuário e Senha.`);
            throw error; // Rethrow to move to next strategy
        }
    };

    let lastError = new Error("Unknown Error");

    // --- STRATEGY 1: Standard REST API ---
    try {
        return await tryStrategy("Strategy 1 (Direct Standard)", `${baseUrl}/wp-json/wp/v2${endpointPath}`);
    } catch (e: any) {
        if (e.message.includes("Acesso Negado")) throw e;
        console.warn("Strategy 1 failed", e.message);
        lastError = e;
    }

    // --- STRATEGY 2: Query Param REST API (Plain Permalinks) ---
    try {
        return await tryStrategy("Strategy 2 (Direct Fallback)", `${baseUrl}/?rest_route=/wp/v2${endpointPath}`);
    } catch (e: any) {
        if (e.message.includes("Acesso Negado")) throw e;
        console.warn("Strategy 2 failed", e.message);
        lastError = e;
    }

    // --- STRATEGY 3: CORS Proxy Standard ---
    try {
        const target = `${baseUrl}/wp-json/wp/v2${endpointPath}`;
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(target)}`;
        return await tryStrategy("Strategy 3 (Proxy Standard)", proxyUrl);
    } catch (e: any) {
        if (e.message.includes("Acesso Negado")) throw e;
        console.warn("Strategy 3 failed", e.message);
        lastError = e;
    }

    // --- STRATEGY 4: CORS Proxy Fallback (Deep Fallback) ---
    // Useful when firewall blocks /wp-json/ even via proxy, but allows query params
    try {
        const target = `${baseUrl}/?rest_route=/wp/v2${endpointPath}`;
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(target)}`;
        return await tryStrategy("Strategy 4 (Proxy Fallback)", proxyUrl);
    } catch (e: any) {
        if (e.message.includes("Acesso Negado")) throw e;
        console.error("All strategies failed.");
        
        let msg = lastError.message || "Falha na conexão.";
        if (msg.includes("Failed to fetch") || msg.includes("502")) {
            msg = `FALHA CRÍTICA (CORS/502): Não foi possível conectar ao site ${baseUrl}.
            
            Possíveis causas:
            1. Firewall (Wordfence, Cloudflare) bloqueando a API REST.
            2. Bloqueio de região (Geo-block) no servidor.
            3. Permalinks não configurados corretamente.
            
            Solução: Tente instalar um plugin de "CORS" no WordPress ou whitelistar o domínio.`;
        }
        throw new Error(msg);
    }
};

export const fetchWpCategories = async (site: WordpressSite): Promise<WordpressCategory[]> => {
    try {
        // Query param ensures we get enough cats and non-empty ones usually
        const data = await fetchWpWithFallback(site, '/categories?per_page=100&hide_empty=0', {
            method: 'GET'
        });
        return data as WordpressCategory[];
    } catch (error: any) {
        throw new Error(error.message || "Não foi possível carregar as categorias.");
    }
};

export const uploadWpMedia = async (site: WordpressSite, file: File): Promise<number> => {
    const baseUrl = cleanWpUrl(site.url);
    const authString = encodeBasicAuth(site.username, site.appPassword);
    
    // Media Upload Strategies (Manual implementation required due to binary body)
    
    const tryUpload = async (url: string, useProxy = false) => {
        const finalUrl = useProxy ? `https://corsproxy.io/?${encodeURIComponent(url)}` : url;
        
        const response = await fetch(finalUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${authString}`,
                'Content-Disposition': `attachment; filename="${file.name}"`,
                'Content-Type': file.type,
                'Cache-Control': 'no-store'
            },
            body: file
        });
        
        if (!response.ok) {
            if(response.status === 401) throw new Error("AUTH_ERROR");
            throw new Error(`Status ${response.status}`);
        }
        return await response.json();
    };

    // 1. Direct Standard
    try {
        const data = await tryUpload(`${baseUrl}/wp-json/wp/v2/media`);
        return data.id;
    } catch (e: any) {
        if (e.message === "AUTH_ERROR") throw new Error("Erro de Autenticação ao enviar imagem.");
        
        // 2. Direct Fallback
        try {
            const data = await tryUpload(`${baseUrl}/?rest_route=/wp/v2/media`);
            return data.id;
        } catch (e2: any) {
            // 3. Proxy Standard
            try {
                const data = await tryUpload(`${baseUrl}/wp-json/wp/v2/media`, true);
                return data.id;
            } catch (e3) {
                 // 4. Proxy Fallback
                 try {
                    const data = await tryUpload(`${baseUrl}/?rest_route=/wp/v2/media`, true);
                    return data.id;
                 } catch (e4) {
                    throw new Error("Falha ao enviar imagem (Todas as estratégias falharam).");
                 }
            }
        }
    }
};

export interface CreatePostParams {
    title: string;
    content: string; // Markdown
    status: 'publish' | 'draft';
    slug: string;
    categories?: number[];
    excerpt?: string;      // Meta Description
    featuredMediaId?: number; // Featured Image ID
}

export const createWpPost = async (site: WordpressSite, params: CreatePostParams) => {
    // Convert Markdown to HTML for WordPress
    const htmlContent = markdownToHtml(params.content);

    const body: any = {
        title: params.title,
        content: htmlContent,
        status: params.status,
        slug: params.slug
    };

    if (params.categories && params.categories.length > 0) {
        body.categories = params.categories;
    }

    if (params.excerpt) {
        body.excerpt = params.excerpt;
    }

    if (params.featuredMediaId) {
        body.featured_media = params.featuredMediaId;
    }

    try {
        const data = await fetchWpWithFallback(site, '/posts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        return data;
    } catch (error: any) {
        console.error("WP Publish Error:", error);
        throw new Error(error.message || "Falha ao enviar post para o WordPress.");
    }
};