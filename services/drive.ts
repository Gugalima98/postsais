// Helper to convert Markdown to basic HTML for Google Docs
export const convertMarkdownToHtml = (markdown: string, title: string) => {
    let html = markdown
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/\*\*(.*)\*\*/gim, '<b>$1</b>')
      .replace(/\*(.*)\*/gim, '<i>$1</i>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/gim, '<a href="$2">$1</a>')
      .replace(/\n/gim, '<br>');
  
    return `
      <html>
        <head><meta charset='utf-8'><title>${title}</title></head>
        <body style="font-family: Arial; font-size: 11pt;">
          ${html}
        </body>
      </html>
    `;
  };
  
  export const uploadToDrive = async (accessToken: string, title: string, htmlContent: string) => {
    const metadata = {
      name: title,
      mimeType: 'application/vnd.google-apps.document',
    };
  
    const multipart = [
      '--foo_bar_baz',
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(metadata),
      '--foo_bar_baz',
      'Content-Type: text/html',
      '',
      htmlContent,
      '--foo_bar_baz--',
    ].join('\r\n');
  
    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'multipart/related; boundary=foo_bar_baz',
      },
      body: multipart,
    });
  
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Falha no upload para o Google Drive');
    }
  
    return await response.json(); // Returns { id, webViewLink }
  };

  // Basic HTML to Markdown converter to preserve Hierarchy from Google Docs
  const htmlToMarkdown = (html: string): string => {
      let md = html;

      // Clean up Google Docs span mess (simplified)
      md = md.replace(/<span[^>]*>/g, '').replace(/<\/span>/g, '');
      md = md.replace(/<body[^>]*>/g, '').replace(/<\/body>/g, '');
      md = md.replace(/<html[^>]*>/g, '').replace(/<\/html>/g, '');
      md = md.replace(/<head>.*<\/head>/s, ''); // Remove head

      // Headers
      md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n');
      md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n');
      md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n');
      md = md.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n');

      // Formatting
      md = md.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
      md = md.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
      md = md.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');
      md = md.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');

      // Links
      md = md.replace(/<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');

      // Lists (Basic support)
      md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
      md = md.replace(/<ul[^>]*>/gi, '\n');
      md = md.replace(/<\/ul>/gi, '\n');
      md = md.replace(/<ol[^>]*>/gi, '\n');
      md = md.replace(/<\/ol>/gi, '\n');

      // Paragraphs and breaks
      md = md.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');
      md = md.replace(/<br\s*\/?>/gi, '\n');
      md = md.replace(/&nbsp;/g, ' ');

      // Decoding entities (Basic)
      md = md.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

      // Collapse multiple newlines
      md = md.replace(/\n\s*\n\s*\n/g, '\n\n');

      return md.trim();
  };

  export const getGoogleDocContent = async (accessToken: string, fileId: string): Promise<string> => {
    // We export as HTML now to preserve headers (H1, H2) structure
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/html`, {
        headers: {
            Authorization: `Bearer ${accessToken}`
        }
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Falha ao ler o Google Doc');
    }

    const htmlText = await response.text();
    return htmlToMarkdown(htmlText);
  };