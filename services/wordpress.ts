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

export const fetchWpCategories = async (site: WordpressSite): Promise<WordpressCategory[]> => {
    // Basic Auth Header using App Password
    const authString = btoa(`${site.username}:${site.appPassword}`);
    
    // Normalize URL (ensure no trailing slash)
    const baseUrl = site.url.replace(/\/$/, '');
    
    try {
        const response = await fetch(`${baseUrl}/wp-json/wp/v2/categories?per_page=100&hide_empty=0`, {
            method: 'GET',
            headers: {
                'Authorization': `Basic ${authString}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.message || `Erro ${response.status}: Falha ao buscar categorias.`);
        }

        const data = await response.json();
        return data as WordpressCategory[];
    } catch (error: any) {
        console.error("WP API Error:", error);
        throw new Error(error.message || "Falha na conexão com o WordPress.");
    }
};

export const uploadWpMedia = async (site: WordpressSite, file: File): Promise<number> => {
    const authString = btoa(`${site.username}:${site.appPassword}`);
    const baseUrl = site.url.replace(/\/$/, '');

    try {
        const response = await fetch(`${baseUrl}/wp-json/wp/v2/media`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${authString}`,
                'Content-Disposition': `attachment; filename="${file.name}"`,
                'Content-Type': file.type
            },
            body: file
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.message || `Erro ${response.status}: Falha ao enviar imagem.`);
        }

        const data = await response.json();
        return data.id; // Return the Media ID
    } catch (error: any) {
        console.error("WP Upload Error:", error);
        throw new Error(error.message || "Falha ao fazer upload da imagem.");
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
    const authString = btoa(`${site.username}:${site.appPassword}`);
    const baseUrl = site.url.replace(/\/$/, '');

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
        const response = await fetch(`${baseUrl}/wp-json/wp/v2/posts`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${authString}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.message || `Erro ${response.status}: Falha ao publicar.`);
        }

        return await response.json(); // Returns the created post object
    } catch (error: any) {
        console.error("WP Publish Error:", error);
        throw new Error(error.message || "Falha ao enviar post para o WordPress.");
    }
};