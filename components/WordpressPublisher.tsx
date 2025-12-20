import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { 
    FileText, Link as LinkIcon, ArrowRight, Globe, Layout, Type, 
    Image as ImageIcon, CheckCircle, Loader2, Bold, Italic, 
    List, Heading2, Heading3, Quote, Eye, Code, Plus, Server, User, Lock, X, AlertTriangle, ExternalLink, Trash2, Search, Copy, RefreshCw
} from 'lucide-react';
import { extractSheetId } from '../services/sheets';
import { getGoogleDocContent } from '../services/drive';
import { fetchWpCategories, createWpPost, uploadWpMedia } from '../services/wordpress';
import { WordpressSite, WordpressCategory } from '../types';

interface WordpressPublisherProps {
    initialTitle?: string;
    initialContent?: string;
}

const WordpressPublisher: React.FC<WordpressPublisherProps> = ({ initialTitle, initialContent }) => {
  const [step, setStep] = useState<'input' | 'editor'>('input');
  const [importMode, setImportMode] = useState<'text' | 'gdoc'>('text');
  const [editorMode, setEditorMode] = useState<'visual' | 'text'>('text');
  
  // Data State
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [gdocLink, setGdocLink] = useState('');
  const [slug, setSlug] = useState('');
  const [metaDesc, setMetaDesc] = useState('');
  
  // Image State
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Site Management State
  const [sites, setSites] = useState<WordpressSite[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>('');
  const [isAddSiteModalOpen, setIsAddSiteModalOpen] = useState(false);
  const [newSite, setNewSite] = useState({ name: '', url: '', username: '', appPassword: '' });
  
  // Categories State
  const [categories, setCategories] = useState<WordpressCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | ''>('');
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [categoryError, setCategoryError] = useState('');
  const [refreshTrigger, setRefreshTrigger] = useState(0); // Helper to force re-fetch

  // UI State
  const [isLoading, setIsLoading] = useState(false); // For Import
  const [publishingStatus, setPublishingStatus] = useState<'idle' | 'uploading_img' | 'drafting' | 'publishing'>('idle');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState<{msg: string, link: string} | null>(null);
  const [publishedData, setPublishedData] = useState<{link: string, title: string} | null>(null); // Persistent Success State

  // Editor Refs
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // --- INITIALIZATION ---
  useEffect(() => {
      // Load Sites from LocalStorage
      try {
          const stored = localStorage.getItem('guestpost_wp_sites');
          if (stored) {
              const parsed = JSON.parse(stored);
              setSites(parsed);
              if (parsed.length > 0) {
                  setSelectedSiteId(parsed[0].id);
              }
          }
      } catch (e) {
          console.error("Erro ao carregar sites", e);
      }
  }, []);

  // --- HYDRATE FROM PROPS (EDIT MODE) ---
  useEffect(() => {
      if (initialTitle || initialContent) {
          setTitle(initialTitle || '');
          setContent(initialContent || '');
          // If we have content, jump straight to editor
          if (initialContent) {
              setStep('editor');
              setEditorMode('text'); // Start in text mode to be safe with Markdown
          }
      }
  }, [initialTitle, initialContent]);

  // Update slug automatically when title changes (if not manually edited logic could be added)
  useEffect(() => {
      if (title) {
          setSlug(title.toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
            .replace(/[^a-z0-9]+/g, '-') // replace non-alphanum with dash
            .replace(/^-+|-+$/g, '') // remove leading/trailing dashes
          );
      }
  }, [title]);

  // --- FETCH CATEGORIES WHEN SITE CHANGES ---
  useEffect(() => {
    const fetchCats = async () => {
        setCategories([]);
        setSelectedCategoryId('');
        setCategoryError('');

        if (!selectedSiteId) return;

        const site = sites.find(s => s.id === selectedSiteId);
        if (!site) return;

        setIsLoadingCategories(true);
        try {
            const cats = await fetchWpCategories(site);
            setCategories(cats);
            if (cats.length > 0) {
                // Try to find 'Uncategorized' or just pick the first one
                const defaultCat = cats.find(c => c.slug === 'sem-categoria' || c.slug === 'uncategorized') || cats[0];
                setSelectedCategoryId(defaultCat.id);
            }
        } catch (err: any) {
            console.error(err);
            setCategoryError('Falha ao buscar categorias. Verifique CORS ou credenciais.');
        } finally {
            setIsLoadingCategories(false);
        }
    };

    fetchCats();
  }, [selectedSiteId, sites, refreshTrigger]);


  // --- SITE MANAGEMENT ---
  const handleSaveNewSite = () => {
      if (!newSite.name || !newSite.url || !newSite.username || !newSite.appPassword) {
          alert("Preencha todos os campos.");
          return;
      }

      const site: WordpressSite = {
          id: Date.now().toString(),
          name: newSite.name,
          url: newSite.url.replace(/\/$/, ''), // Remove trailing slash
          username: newSite.username,
          appPassword: newSite.appPassword
      };

      const updatedSites = [...sites, site];
      setSites(updatedSites);
      localStorage.setItem('guestpost_wp_sites', JSON.stringify(updatedSites));
      setSelectedSiteId(site.id);
      
      setNewSite({ name: '', url: '', username: '', appPassword: '' });
      setIsAddSiteModalOpen(false);
  };

  const getSelectedSite = () => sites.find(s => s.id === selectedSiteId);

  // --- IMAGE HANDLING ---
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          setImageFile(file);
          const previewUrl = URL.createObjectURL(file);
          setImagePreview(previewUrl);
      }
  };

  const removeImage = () => {
      setImageFile(null);
      setImagePreview('');
      if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // --- PUBLISHING LOGIC ---
  const handlePublish = async (status: 'publish' | 'draft') => {
      setError('');
      setSuccessMsg(null);
      setPublishedData(null);
      
      const site = getSelectedSite();
      if (!site) {
          setError('Selecione um site para publicar.');
          return;
      }
      if (!title.trim() || !content.trim()) {
          setError('Título e conteúdo são obrigatórios.');
          return;
      }

      try {
          // 1. Upload Image (if exists)
          let featuredMediaId = undefined;
          if (imageFile) {
              setPublishingStatus('uploading_img');
              featuredMediaId = await uploadWpMedia(site, imageFile);
          }

          // 2. Create Post
          setPublishingStatus(status === 'publish' ? 'publishing' : 'drafting');
          const result = await createWpPost(site, {
              title,
              content,
              status,
              slug,
              excerpt: metaDesc,
              categories: selectedCategoryId ? [Number(selectedCategoryId)] : [],
              featuredMediaId
          });

          setSuccessMsg({
              msg: status === 'publish' ? 'Post publicado com sucesso!' : 'Rascunho salvo com sucesso!',
              link: result.link
          });

          if (status === 'publish') {
            setPublishedData({ link: result.link, title: title });
          }

      } catch (err: any) {
          setError(err.message);
      } finally {
          setPublishingStatus('idle');
      }
  };

  // --- MARKDOWN RENDER CONFIG ---
  const MarkdownComponents = {
    h1: ({...props}) => <h1 className="text-3xl font-bold text-white mb-4 border-b border-slate-700 pb-2" {...props} />, 
    h2: ({...props}) => <h2 className="text-2xl font-bold text-slate-100 mt-8 mb-4" {...props} />,
    h3: ({...props}) => <h3 className="text-xl font-semibold text-indigo-300 mt-6 mb-3" {...props} />,
    p: ({...props}) => <p className="text-slate-300 text-lg leading-7 mb-5" {...props} />,
    ul: ({...props}) => <ul className="list-disc list-outside ml-6 mb-5 space-y-1 text-slate-300 text-lg" {...props} />,
    ol: ({...props}) => <ol className="list-decimal list-outside ml-6 mb-5 space-y-1 text-slate-300 text-lg" {...props} />,
    li: ({...props}) => <li className="pl-1" {...props} />,
    a: ({...props}) => <a className="text-emerald-400 underline underline-offset-4 decoration-emerald-500/30 hover:text-emerald-300" target="_blank" {...props} />,
    blockquote: ({...props}) => (
        <blockquote className="border-l-4 border-indigo-500 bg-slate-900/50 rounded-r-lg pl-4 py-3 my-6 text-slate-400 italic" {...props} />
    ),
    strong: ({...props}) => <strong className="text-white font-bold" {...props} />,
  };

  // --- EDITOR TOOLBAR LOGIC ---
  const insertFormat = (prefix: string, suffix: string = '') => {
      if (!textareaRef.current) return;
      
      const start = textareaRef.current.selectionStart;
      const end = textareaRef.current.selectionEnd;
      const text = textareaRef.current.value;
      
      const before = text.substring(0, start);
      const selection = text.substring(start, end);
      const after = text.substring(end);
      
      const newText = before + prefix + selection + suffix + after;
      
      setContent(newText);
      
      // Reset focus and cursor
      setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus();
            textareaRef.current.setSelectionRange(start + prefix.length, end + prefix.length);
          }
      }, 0);
  };

  // Handle Google Doc Import
  const handleImportGDoc = async () => {
    setError('');
    const docId = extractSheetId(gdocLink); 
    
    if (!docId) {
        setError('Link do Google Docs inválido.');
        return;
    }

    const clientId = localStorage.getItem('google_client_id');
    if (!clientId) {
        setError('Client ID não configurado. Vá em Configurações.');
        return;
    }

    setIsLoading(true);

    try {
        const client = window.google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: 'https://www.googleapis.com/auth/drive.readonly',
            callback: async (response: any) => {
                if (response.error) {
                    setError('Erro na autenticação: ' + response.error.message);
                    setIsLoading(false);
                    return;
                }

                try {
                    const markdown = await getGoogleDocContent(response.access_token, docId);
                    
                    // Simple heuristic to extract title if found in first lines
                    let extractedTitle = "Sem Título";
                    let extractedContent = markdown;

                    const titleMatch = markdown.match(/^# (.*$)/m);
                    if (titleMatch) {
                        extractedTitle = titleMatch[1].trim();
                        // Remove the H1 from the body
                        extractedContent = markdown.replace(/^# .*$/m, '').trim();
                    }

                    setTitle(extractedTitle);
                    setContent(extractedContent);
                    setStep('editor');
                    // Automatically switch to Visual to show the "Visualmente igual" request
                    setEditorMode('visual'); 
                } catch (err: any) {
                    setError('Falha ao importar: ' + err.message);
                } finally {
                    setIsLoading(false);
                }
            },
        });
        client.requestAccessToken();

    } catch (e: any) {
        setError(e.message);
        setIsLoading(false);
    }
  };

  const handleManualStart = () => {
    if(!title.trim() && !content.trim()) {
        setError("Preencha pelo menos o título ou conteúdo.");
        return;
    }
    setStep('editor');
  };

  // --- RENDER STEPS ---

  if (step === 'input') {
    return (
        <div className="flex flex-col items-center justify-center min-h-[80vh] px-4 animate-in fade-in duration-500">
            <div className="w-full max-w-2xl">
                <div className="text-center mb-10">
                    <div className="inline-flex items-center justify-center p-3 bg-blue-600/20 rounded-xl mb-4 text-blue-400">
                        <Globe className="w-8 h-8" />
                    </div>
                    <h1 className="text-3xl font-bold text-white mb-2">Publicador WordPress</h1>
                    <p className="text-slate-400">Importe conteúdo do Docs mantendo a hierarquia (H1, H2, H3) ou escreva aqui.</p>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
                    {/* Tabs */}
                    <div className="flex border-b border-slate-800">
                        <button 
                            onClick={() => setImportMode('text')}
                            className={`flex-1 py-4 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${importMode === 'text' ? 'bg-slate-800 text-white border-b-2 border-blue-500' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            <FileText className="w-4 h-4" />
                            Colar Texto
                        </button>
                        <button 
                            onClick={() => setImportMode('gdoc')}
                            className={`flex-1 py-4 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${importMode === 'gdoc' ? 'bg-slate-800 text-white border-b-2 border-blue-500' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            <LinkIcon className="w-4 h-4" />
                            Google Docs
                        </button>
                    </div>

                    <div className="p-8">
                        {importMode === 'text' ? (
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Título do Artigo</label>
                                    <input 
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white outline-none focus:border-blue-500"
                                        placeholder="Ex: Como otimizar seu SEO..."
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 mb-1">Conteúdo</label>
                                    <textarea 
                                        value={content}
                                        onChange={(e) => setContent(e.target.value)}
                                        className="w-full h-40 bg-slate-950 border border-slate-700 rounded-lg p-3 text-slate-300 outline-none focus:border-blue-500 resize-none font-mono text-sm"
                                        placeholder="Escreva ou cole seu texto (Markdown suportado)..."
                                    />
                                </div>
                                {error && <p className="text-red-400 text-sm">{error}</p>}
                                <button 
                                    onClick={handleManualStart}
                                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors mt-2"
                                >
                                    Abrir Editor <ArrowRight className="w-4 h-4"/>
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-6 py-4">
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-slate-300">Link do Google Docs</label>
                                    <div className="relative">
                                        <div className="absolute left-3 top-3.5 text-slate-500">
                                            <LinkIcon className="w-5 h-5" />
                                        </div>
                                        <input 
                                            value={gdocLink}
                                            onChange={(e) => setGdocLink(e.target.value)}
                                            className="w-full bg-slate-950 border border-slate-700 rounded-lg py-3 pl-10 pr-4 text-white outline-none focus:border-blue-500"
                                            placeholder="https://docs.google.com/document/d/..."
                                        />
                                    </div>
                                    <p className="text-xs text-slate-500">
                                        O sistema irá ler o HTML do documento e converter para o formato do editor, preservando H1, H2, H3, negritos e listas.
                                    </p>
                                </div>

                                {error && <p className="text-red-400 text-sm bg-red-900/20 p-3 rounded-lg border border-red-900/50">{error}</p>}

                                <button 
                                    onClick={handleImportGDoc}
                                    disabled={isLoading || !gdocLink}
                                    className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
                                >
                                    {isLoading ? <Loader2 className="w-5 h-5 animate-spin"/> : <ArrowRight className="w-5 h-5"/>}
                                    {isLoading ? 'Importando...' : 'Importar e Editar'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
  }

  // EDITOR VIEW
  return (
    <div className="flex flex-col h-full relative">
        {/* ADD SITE MODAL */}
        {isAddSiteModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
                    <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
                        <h3 className="font-bold text-white flex items-center gap-2">
                            <Server className="w-4 h-4 text-blue-400" /> Conectar Novo Site
                        </h3>
                        <button onClick={() => setIsAddSiteModalOpen(false)} className="text-slate-400 hover:text-white">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="p-6 space-y-4">
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 uppercase">Nome do Site</label>
                            <input 
                                value={newSite.name}
                                onChange={e => setNewSite({...newSite, name: e.target.value})}
                                placeholder="Meu Blog Pessoal"
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm text-white focus:border-blue-500 outline-none"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-500 uppercase">URL do WordPress</label>
                            <div className="relative">
                                <Globe className="absolute left-3 top-3 w-4 h-4 text-slate-600" />
                                <input 
                                    value={newSite.url}
                                    onChange={e => setNewSite({...newSite, url: e.target.value})}
                                    placeholder="https://meusite.com"
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 pl-10 text-sm text-white focus:border-blue-500 outline-none"
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 uppercase">Usuário (Login)</label>
                                <div className="relative">
                                    <User className="absolute left-3 top-3 w-4 h-4 text-slate-600" />
                                    <input 
                                        value={newSite.username}
                                        onChange={e => setNewSite({...newSite, username: e.target.value})}
                                        placeholder="admin"
                                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 pl-10 text-sm text-white focus:border-blue-500 outline-none"
                                    />
                                </div>
                            </div>
                             <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 uppercase">Senha de Aplicação</label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-3 w-4 h-4 text-slate-600" />
                                    <input 
                                        type="password"
                                        value={newSite.appPassword}
                                        onChange={e => setNewSite({...newSite, appPassword: e.target.value})}
                                        placeholder="abcd 1234 ..."
                                        className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 pl-10 text-sm text-white focus:border-blue-500 outline-none"
                                    />
                                </div>
                            </div>
                        </div>
                        
                        <div className="text-[10px] text-slate-500 bg-blue-900/10 p-2 rounded border border-blue-900/30">
                            <strong>Dica:</strong> Vá em Usuários &gt; Seu Perfil &gt; Senhas de Aplicação no painel do WP para gerar a senha.
                        </div>

                        <button 
                            onClick={handleSaveNewSite}
                            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg mt-2 transition-colors"
                        >
                            Salvar e Conectar
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Toolbar Top */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-800 sticky top-0 z-10">
            <div className="flex items-center gap-4">
                <button onClick={() => setStep('input')} className="text-slate-500 hover:text-white text-sm font-medium">Voltar</button>
                <div className="h-6 w-px bg-slate-800"></div>
                <h2 className="text-white font-bold flex items-center gap-2">
                    <Globe className="w-4 h-4 text-blue-400" /> 
                    Editor WP
                </h2>
            </div>
            <div className="flex gap-3">
                <button 
                    onClick={() => handlePublish('draft')}
                    disabled={publishingStatus !== 'idle'}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                >
                    {publishingStatus === 'drafting' && <Loader2 className="w-4 h-4 animate-spin"/>}
                    Salvar Rascunho
                </button>
                <button 
                    onClick={() => handlePublish('publish')}
                    disabled={publishingStatus !== 'idle'}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold flex items-center gap-2 transition-colors shadow-lg shadow-blue-900/20"
                >
                    {publishingStatus === 'publishing' || publishingStatus === 'uploading_img' ? <Loader2 className="w-4 h-4 animate-spin"/> : <CheckCircle className="w-4 h-4" />} 
                    {publishingStatus === 'uploading_img' ? 'Enviando Foto...' : 'Publicar'}
                </button>
            </div>
        </div>

        {/* --- PERSISTENT SUCCESS PANEL --- */}
        {publishedData && (
            <div className="w-full bg-green-900/20 border-b border-green-900/50 px-6 py-4 animate-in slide-in-from-top-2">
                <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                         <div className="bg-green-600 p-2 rounded-full">
                             <CheckCircle className="w-5 h-5 text-white" />
                         </div>
                         <div>
                             <h4 className="text-green-400 font-bold">Artigo Publicado com Sucesso!</h4>
                             <a href={publishedData.link} target="_blank" className="text-white text-sm hover:underline flex items-center gap-1">
                                {publishedData.link} <ExternalLink className="w-3 h-3" />
                             </a>
                         </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => {
                                navigator.clipboard.writeText(publishedData.link);
                                alert("Link copiado!");
                            }}
                            className="px-3 py-1.5 bg-green-800/50 hover:bg-green-800 text-green-100 text-xs font-bold rounded flex items-center gap-1 transition-colors"
                        >
                            <Copy className="w-3 h-3"/> Copiar Link
                        </button>
                        <button onClick={() => setPublishedData(null)} className="p-2 text-green-400 hover:text-white">
                            <X className="w-4 h-4"/>
                        </button>
                    </div>
                </div>
            </div>
        )}

        <div className="flex-1 flex overflow-hidden">
            {/* Main Content Editor */}
            <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-950 flex flex-col items-center pt-8 pb-20 relative">
                
                {/* ERROR NOTIFICATIONS (Floating) */}
                {error && (
                    <div className="absolute top-4 z-20 bg-red-500 text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-3 animate-bounce-in">
                        <AlertTriangle className="w-5 h-5"/>
                        <span className="font-medium text-sm">{error}</span>
                        <button onClick={() => setError('')}><X className="w-4 h-4 opacity-70"/></button>
                    </div>
                )}
                
                {/* Title Input */}
                <div className="w-full max-w-3xl px-8 mb-6">
                    <input 
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="w-full bg-transparent text-4xl font-extrabold text-white placeholder:text-slate-700 outline-none border-none py-2"
                        placeholder="Adicione um título"
                    />
                </div>

                {/* Editor Surface */}
                <div className="w-full max-w-3xl flex-1 px-8 flex flex-col">
                    
                    {/* Visual/Text Toggle (WP Classic Style) */}
                    <div className="flex items-center justify-end mb-0">
                         <div className="flex bg-slate-900 border-t border-x border-slate-700 rounded-t-lg overflow-hidden">
                             <button 
                                onClick={() => setEditorMode('visual')}
                                className={`px-4 py-2 text-xs font-bold flex items-center gap-2 ${editorMode === 'visual' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                             >
                                <Eye className="w-3 h-3" /> Visual
                             </button>
                             <button 
                                onClick={() => setEditorMode('text')}
                                className={`px-4 py-2 text-xs font-bold flex items-center gap-2 ${editorMode === 'text' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                             >
                                <Code className="w-3 h-3" /> Texto
                             </button>
                         </div>
                    </div>

                    {editorMode === 'text' ? (
                        <>
                            {/* Formatting Toolbar - Only visible in Text Mode */}
                            <div className="sticky top-0 z-10 bg-slate-900 border border-slate-700 rounded-tl-lg rounded-bl-lg p-2 flex items-center gap-1 shadow-md mb-0">
                                <button onClick={() => insertFormat('## ')} title="Título 2" className="p-2 hover:bg-slate-800 rounded text-slate-300 hover:text-white transition-colors">
                                    <Heading2 className="w-4 h-4" />
                                </button>
                                <button onClick={() => insertFormat('### ')} title="Título 3" className="p-2 hover:bg-slate-800 rounded text-slate-300 hover:text-white transition-colors">
                                    <Heading3 className="w-4 h-4" />
                                </button>
                                <div className="w-px h-5 bg-slate-700 mx-1"></div>
                                <button onClick={() => insertFormat('**', '**')} title="Negrito" className="p-2 hover:bg-slate-800 rounded text-slate-300 hover:text-white transition-colors">
                                    <Bold className="w-4 h-4" />
                                </button>
                                <button onClick={() => insertFormat('*', '*')} title="Itálico" className="p-2 hover:bg-slate-800 rounded text-slate-300 hover:text-white transition-colors">
                                    <Italic className="w-4 h-4" />
                                </button>
                                <button onClick={() => insertFormat('> ')} title="Citação" className="p-2 hover:bg-slate-800 rounded text-slate-300 hover:text-white transition-colors">
                                    <Quote className="w-4 h-4" />
                                </button>
                                <div className="w-px h-5 bg-slate-700 mx-1"></div>
                                <button onClick={() => insertFormat('- ')} title="Lista" className="p-2 hover:bg-slate-800 rounded text-slate-300 hover:text-white transition-colors">
                                    <List className="w-4 h-4" />
                                </button>
                                <button onClick={() => insertFormat('[', '](url)')} title="Link" className="p-2 hover:bg-slate-800 rounded text-slate-300 hover:text-white transition-colors">
                                    <LinkIcon className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Raw Markdown Editor */}
                            <textarea 
                                ref={textareaRef}
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                className="w-full min-h-[600px] flex-1 bg-slate-900/50 border-x border-b border-slate-700 rounded-b-lg p-6 text-lg text-slate-300 placeholder:text-slate-600 outline-none resize-y leading-relaxed font-mono focus:bg-slate-900 focus:ring-1 focus:ring-slate-700 transition-colors"
                                placeholder="Comece a escrever seu post..."
                            />
                        </>
                    ) : (
                        /* Visual Preview Mode */
                        <div className="w-full min-h-[600px] flex-1 bg-slate-900/30 border border-slate-700 rounded-b-lg rounded-tl-lg p-8 custom-scrollbar">
                             <ReactMarkdown components={MarkdownComponents}>
                                {content || '*Nenhum conteúdo ainda...*'}
                             </ReactMarkdown>
                        </div>
                    )}
                    
                    <p className="text-xs text-slate-500 mt-2 text-right">
                        {editorMode === 'text' ? 'Editando em Markdown.' : 'Visualizando resultado final.'}
                    </p>
                </div>
            </div>

            {/* Right Sidebar - WP Config */}
            <div className="w-80 bg-slate-900 border-l border-slate-800 p-6 overflow-y-auto hidden xl:block">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-6">Configurações de Publicação</h3>
                
                <div className="space-y-6">
                    {/* Site Selector Dropdown */}
                    <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-300">
                            <Server className="w-4 h-4 text-slate-500" /> Destino da Publicação
                        </label>
                        <select 
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-300 outline-none focus:border-blue-500"
                            value={selectedSiteId}
                            onChange={(e) => setSelectedSiteId(e.target.value)}
                        >
                            {sites.length === 0 && <option value="">Nenhum site conectado</option>}
                            {sites.map(site => (
                                <option key={site.id} value={site.id}>{site.name}</option>
                            ))}
                        </select>
                        <button 
                            onClick={() => setIsAddSiteModalOpen(true)}
                            className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-slate-700 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-800 hover:border-slate-600 transition-colors"
                        >
                            <Plus className="w-3 h-3" /> Adicionar Novo Site
                        </button>
                    </div>

                    <div className="h-px bg-slate-800 my-4"></div>

                    {/* Category Selector */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <label className="flex items-center gap-2 text-sm font-medium text-slate-300">
                                <Layout className="w-4 h-4 text-slate-500" /> Categoria
                            </label>
                             <button 
                                onClick={() => setRefreshTrigger(prev => prev + 1)}
                                disabled={isLoadingCategories || !selectedSiteId}
                                className="p-1 text-slate-500 hover:text-indigo-400 transition-colors disabled:opacity-50"
                                title="Recarregar Categorias"
                             >
                                {isLoadingCategories ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                             </button>
                        </div>
                        
                        <select 
                            className={`w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-300 outline-none focus:border-blue-500 ${!selectedSiteId || categories.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                            value={selectedCategoryId}
                            onChange={(e) => setSelectedCategoryId(Number(e.target.value))}
                            disabled={!selectedSiteId || categories.length === 0 || isLoadingCategories}
                        >
                            {isLoadingCategories && <option>Carregando categorias...</option>}
                            {!isLoadingCategories && categories.length === 0 && <option>Nenhuma categoria encontrada</option>}
                            {categories.map(cat => (
                                <option key={cat.id} value={cat.id}>{cat.name}</option>
                            ))}
                        </select>
                        
                        {categoryError && (
                            <div className="text-[10px] text-red-400 flex items-center gap-1 mt-1 bg-red-900/10 p-1.5 rounded border border-red-900/30">
                                <AlertTriangle className="w-3 h-3 flex-shrink-0"/> <span className="truncate">{categoryError}</span>
                            </div>
                        )}
                    </div>

                    <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-300">
                            <Type className="w-4 h-4 text-slate-500" /> Slug (URL)
                        </label>
                        <input 
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-slate-300 outline-none" 
                            placeholder="url-amigavel" 
                            value={slug}
                            onChange={(e) => setSlug(e.target.value)}
                        />
                    </div>

                    {/* Featured Image */}
                    <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-300">
                            <ImageIcon className="w-4 h-4 text-slate-500" /> Imagem Destacada
                        </label>
                        <div 
                            className="h-32 bg-slate-950 border border-dashed border-slate-800 rounded-lg flex flex-col items-center justify-center text-slate-600 gap-2 hover:bg-slate-950/50 hover:border-slate-700 transition-colors cursor-pointer relative overflow-hidden group"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            {imagePreview ? (
                                <>
                                    <img src={imagePreview} className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-40 transition-opacity" />
                                    <div className="absolute inset-0 flex items-center justify-center z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <span className="text-xs bg-slate-900/80 px-2 py-1 rounded text-white">Alterar Imagem</span>
                                    </div>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); removeImage(); }}
                                        className="absolute top-2 right-2 p-1 bg-red-600/80 text-white rounded hover:bg-red-500 z-20"
                                        title="Remover Imagem"
                                    >
                                        <Trash2 className="w-3 h-3" />
                                    </button>
                                </>
                            ) : (
                                <>
                                    <ImageIcon className="w-6 h-6 opacity-50" />
                                    <span className="text-xs">Clique para upload</span>
                                </>
                            )}
                            <input 
                                type="file" 
                                ref={fileInputRef} 
                                className="hidden" 
                                accept="image/*"
                                onChange={handleImageSelect}
                            />
                        </div>
                    </div>

                    {/* Meta Description */}
                    <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-300">
                            <Search className="w-4 h-4 text-slate-500" /> Meta Descrição
                        </label>
                        <textarea
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-300 outline-none resize-none h-24"
                            placeholder="Resumo curto para o Google..."
                            value={metaDesc}
                            onChange={(e) => setMetaDesc(e.target.value)}
                            maxLength={160}
                        />
                        <p className="text-[10px] text-slate-600 text-right">{metaDesc.length}/160 caracteres</p>
                    </div>

                    <div className="pt-6 border-t border-slate-800">
                         {getSelectedSite() ? (
                             <div className="bg-green-900/10 p-4 rounded-lg border border-green-900/30">
                                <p className="text-xs text-green-400 mb-2">Conectado a:</p>
                                <p className="text-sm font-bold text-white flex items-center gap-2 truncate">
                                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                    {getSelectedSite()?.url}
                                </p>
                            </div>
                         ) : (
                             <div className="bg-yellow-900/10 p-4 rounded-lg border border-yellow-900/30">
                                <p className="text-xs text-yellow-500">Nenhum site selecionado.</p>
                            </div>
                         )}
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
};

export default WordpressPublisher;