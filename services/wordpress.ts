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
    // btoa alone fails on unicode strings, we need to escape first
    try {
        return btoa(unescape(encodeURIComponent(`${user}:${pass}`)));
    } catch (e) {
        return btoa(`${user}:${pass}`);
    }
};

// Generic Fetch Wrapper with Fallback Strategy
const fetchWpWithFallback = async (site: WordpressSite, endpointPath: string, options: RequestInit = {}) => {
    const baseUrl = cleanWpUrl(site.url);
    const authString = encodeBasicAuth(site.username, site.appPassword);
    
    const headers = {
        'Authorization': `Basic ${authString}`,
        // Merge custom headers if any (like Content-Type for POST)
        ...(options.headers as Record<string, string> || {})
    };

    // Strategy 1: Standard REST API (Pretty Permalinks) -> /wp-json/wp/v2/...
    const urlStandard = `${baseUrl}/wp-json/wp/v2${endpointPath}`;
    
    try {
        const response = await fetch(urlStandard, { ...options, headers });
        
        if (response.ok) return await response.json();
        
        // If 401 (Unauthorized), no point trying fallback, creds are wrong.
        if (response.status === 401 || response.status === 403) {
            throw new Error(`Erro ${response.status}: Acesso Negado. Verifique Usuário e Senha de Aplicação.`);
        }
        
        // If 404, maybe API is disabled or moved. Try fallback.
        if (response.status !== 404) {
             const err = await response.json().catch(() => ({}));
             throw new Error(err.message || `Erro ${response.status} na rota padrão.`);
        }
    } catch (error: any) {
        const msg = String(error.message || '');
        // Do not retry if explicit auth failure
        if (msg.includes('Acesso Negado') || msg.includes('401') || msg.includes('403')) {
            throw error;
        }
        // Proceed to Strategy 2
        console.warn(`Standard API (${urlStandard}) failed, trying fallback...`, error);
    }

    // Strategy 2: Query Param REST API (Plain Permalinks) -> /?rest_route=/wp/v2/...
    const urlFallback = `${baseUrl}/?rest_route=/wp/v2${endpointPath}`;
    
    try {
        const response = await fetch(urlFallback, { ...options, headers });
        if (response.ok) return await response.json();
        
        if (response.status === 401 || response.status === 403) {
            throw new Error(`Erro ${response.status}: Acesso Negado (Fallback). Verifique Usuário e Senha.`);
        }

        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || `Erro ${response.status}: Falha na conexão (Fallback).`);
    } catch (error: any) {
        console.error("WP API Fallback Error:", error);
        
        let msg = error.message || "Falha desconhecida.";
        
        // Improve error message for common "Failed to fetch" (CORS/Network)
        if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
            msg = `Erro de Conexão/CORS. Verifique:
            1. O site é HTTPS? (Obrigatório se este app usar HTTPS)
            2. A URL está correta? (${baseUrl})
            3. Algum plugin de segurança (Wordfence/iThemes) bloqueia a API REST?
            4. Tente acessar ${baseUrl}/wp-json/wp/v2/posts no navegador para testar.`;
        }
        
        throw new Error(msg);
    }
};

export const fetchWpCategories = async (site: WordpressSite): Promise<WordpressCategory[]> => {
    try {
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

    // Media upload is tricky with the generic fallback because body is binary.
    // We try standard first, then fallback manually to control headers precisely.

    const tryUpload = async (url: string) => {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${authString}`,
                'Content-Disposition': `attachment; filename="${file.name}"`,
                'Content-Type': file.type
            },
            body: file
        });
        if (!response.ok) {
            if(response.status === 401) throw new Error("401 Unauthorized");
            throw new Error(`Erro ${response.status}`);
        }
        return await response.json();
    };

    try {
        const data = await tryUpload(`${baseUrl}/wp-json/wp/v2/media`);
        return data.id;
    } catch (e: any) {
        if (e.message.includes('401')) throw new Error("Erro de Autenticação ao enviar imagem.");
        
        // Try fallback
        try {
            const data = await tryUpload(`${baseUrl}/?rest_route=/wp/v2/media`);
            return data.id;
        } catch (e2: any) {
            throw new Error("Falha ao enviar imagem (CORS ou Permissões).");
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