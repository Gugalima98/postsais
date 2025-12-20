import React, { useState, useEffect } from 'react';
import { 
    FileSpreadsheet, Loader2, Globe, AlertTriangle, CheckCircle, 
    ImageIcon, Edit, UploadCloud, Search, Plus, Trash2, ExternalLink, X, Save, Server, User, Lock, FileText
} from 'lucide-react';
import { BulkPostDraft, WordpressSite, WordpressCategory } from '../types';
import { extractSheetId } from '../services/sheets';
import { getGoogleDocContent } from '../services/drive';
import { fetchWpCategories, createWpPost, uploadWpMedia } from '../services/wordpress';
import ContentEditorModal from './ContentEditorModal';

interface BulkPostManagerProps {
    onOpenImportModal: () => void;
    // Data passed from App.tsx when import finishes
    importedData: { sheetId: string, rows: any[][], token: string } | null;
    clearImportedData: () => void;
}

const BulkPostManager: React.FC<BulkPostManagerProps> = ({ onOpenImportModal, importedData, clearImportedData }) => {
    const [drafts, setDrafts] = useState<BulkPostDraft[]>([]);
    const [sites, setSites] = useState<WordpressSite[]>([]);
    
    // Modal & Editor States
    const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
    const [isAddSiteModalOpen, setIsAddSiteModalOpen] = useState(false);
    const [newSite, setNewSite] = useState({ name: '', url: '', username: '', appPassword: '' });

    // Cache categories to avoid fetching for every row
    const [categoryCache, setCategoryCache] = useState<Record<string, WordpressCategory[]>>({});

    // Load Sites
    useEffect(() => {
        const stored = localStorage.getItem('guestpost_wp_sites');
        if (stored) setSites(JSON.parse(stored));
    }, []);

    // Process Imported Data
    useEffect(() => {
        if (!importedData) return;

        const processRows = async () => {
            const newDrafts: BulkPostDraft[] = [];
            
            // NEW MAPPING: A=Keyword, B=SiteURL, C=DocLink
            for (let i = 0; i < importedData.rows.length; i++) {
                const row = importedData.rows[i];
                if (!row[0]) continue; // Skip rows without keyword

                const keyword = row[0].trim();
                const siteUrl = row[1]?.trim() || '';
                const docLink = row[2]?.trim() || '';

                // Try to match site
                const matchedSite = sites.find(s => {
                    if (!siteUrl) return false;
                    // Normalize for comparison
                    const sUrl = s.url.replace(/^https?:\/\//, '').replace(/\/$/, '');
                    const rowUrlNorm = siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
                    return sUrl === rowUrlNorm;
                });

                const draft: BulkPostDraft = {
                    id: Date.now().toString() + Math.random(),
                    sheetRowIndex: i,
                    keyword,
                    originalDocUrl: docLink,
                    siteUrlFromSheet: siteUrl,
                    title: 'Carregando...',
                    content: '',
                    matchedSiteId: matchedSite ? matchedSite.id : '',
                    slug: keyword.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, '-'),
                    metaDesc: '',
                    image: null,
                    imagePreview: '',
                    categoryId: '',
                    status: docLink ? 'loading_doc' : 'idle' // Only load doc if link exists
                };

                // If no doc link, set title to keyword immediately
                if (!docLink) {
                    draft.title = keyword;
                    draft.content = `Artigo sobre: ${keyword} (Importado sem link do Docs)`;
                }

                newDrafts.push(draft);
            }

            setDrafts(prev => [...prev, ...newDrafts]);
            clearImportedData();

            // Fetch Doc Contents in background
            newDrafts.forEach(async (draft) => {
                if (!draft.originalDocUrl) return;

                try {
                    const docId = extractSheetId(draft.originalDocUrl);
                    if (!docId) throw new Error("Link do Doc inválido");
                    
                    const markdown = await getGoogleDocContent(importedData.token, docId);
                    
                    // Parse Title
                    let extractedTitle = draft.keyword || "Sem Título";
                    let extractedContent = markdown;
                    const titleMatch = markdown.match(/^# (.*$)/m);
                    if (titleMatch) {
                        extractedTitle = titleMatch[1].trim();
                        extractedContent = markdown.replace(/^# .*$/m, '').trim();
                    }

                    // Parse Slug if not set
                    const slug = extractedTitle.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, '-');

                    setDrafts(current => current.map(d => 
                        d.id === draft.id ? { 
                            ...d, 
                            title: extractedTitle, 
                            content: extractedContent, 
                            slug: slug,
                            status: 'idle' 
                        } : d
                    ));

                } catch (e: any) {
                    setDrafts(current => current.map(d => 
                        d.id === draft.id ? { ...d, title: 'Erro ao carregar', status: 'error', errorMsg: e.message } : d
                    ));
                }
            });
        };

        processRows();
    }, [importedData, sites]);

    // Fetch Categories when a matched site is set
    useEffect(() => {
        drafts.forEach(draft => {
            if (draft.matchedSiteId && !categoryCache[draft.matchedSiteId]) {
                const site = sites.find(s => s.id === draft.matchedSiteId);
                if (site) {
                    fetchWpCategories(site).then(cats => {
                        setCategoryCache(prev => ({ ...prev, [site.id]: cats }));
                        // Auto-select first category for drafts with this site
                        setDrafts(curr => curr.map(d => d.matchedSiteId === site.id && !d.categoryId ? {...d, categoryId: cats[0]?.id || ''} : d));
                    }).catch(console.error);
                }
            }
        });
    }, [drafts, sites, categoryCache]);

    // Handlers
    const updateDraft = (id: string, updates: Partial<BulkPostDraft>) => {
        setDrafts(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
    };

    const handleImageSelect = (id: string, file: File) => {
        const preview = URL.createObjectURL(file);
        updateDraft(id, { image: file, imagePreview: preview });
    };

    const handleAddSite = () => {
         if (!newSite.name || !newSite.url || !newSite.username || !newSite.appPassword) return;

         const site: WordpressSite = {
             id: Date.now().toString(),
             name: newSite.name,
             url: newSite.url.replace(/\/$/, ''),
             username: newSite.username,
             appPassword: newSite.appPassword
         };

         const updatedSites = [...sites, site];
         setSites(updatedSites);
         localStorage.setItem('guestpost_wp_sites', JSON.stringify(updatedSites));
         setNewSite({ name: '', url: '', username: '', appPassword: '' });
         setIsAddSiteModalOpen(false);

         // Auto-match existing drafts
         setDrafts(prev => prev.map(d => {
             const sUrl = site.url.replace(/^https?:\/\//, '').replace(/\/$/, '');
             const rowUrlNorm = d.siteUrlFromSheet.replace(/^https?:\/\//, '').replace(/\/$/, '');
             if (sUrl === rowUrlNorm && !d.matchedSiteId) {
                 return { ...d, matchedSiteId: site.id };
             }
             return d;
         }));
    };

    const handlePublish = async (id: string) => {
        const draft = drafts.find(d => d.id === id);
        if (!draft) return;
        
        if (!draft.matchedSiteId) {
            alert("Selecione um site primeiro.");
            return;
        }

        const site = sites.find(s => s.id === draft.matchedSiteId);
        if (!site) return;

        updateDraft(id, { status: 'publishing', errorMsg: '' });

        try {
            let mediaId = undefined;
            if (draft.image) {
                mediaId = await uploadWpMedia(site, draft.image);
            }

            const result = await createWpPost(site, {
                title: draft.title,
                content: draft.content,
                status: 'publish',
                slug: draft.slug,
                excerpt: draft.metaDesc,
                categories: draft.categoryId ? [Number(draft.categoryId)] : [],
                featuredMediaId: mediaId
            });

            updateDraft(id, { status: 'success', publishedLink: result.link });

        } catch (e: any) {
            updateDraft(id, { status: 'error', errorMsg: e.message });
        }
    };

    const handleRemoveDraft = (id: string) => {
        setDrafts(prev => prev.filter(d => d.id !== id));
    };

    return (
        <div className="flex flex-col h-full bg-slate-950 p-6 overflow-y-auto">
            
            {/* Header */}
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                        <Globe className="w-8 h-8 text-emerald-400" />
                        Postagem em Massa
                    </h1>
                    <p className="text-slate-400 mt-2">
                        Importe uma lista, revise e publique múltiplos artigos de uma vez.
                    </p>
                </div>
                <div className="flex gap-3">
                    <button 
                        onClick={() => setDrafts([])}
                        disabled={drafts.length === 0}
                        className="px-4 py-2 border border-slate-700 text-slate-400 rounded-lg hover:text-white hover:border-slate-500 transition-colors disabled:opacity-50"
                    >
                        Limpar Tudo
                    </button>
                    <button 
                        onClick={onOpenImportModal}
                        className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg flex items-center gap-2 shadow-lg shadow-emerald-900/20 transition-colors"
                    >
                        <FileSpreadsheet className="w-5 h-5" /> Importar Planilha
                    </button>
                </div>
            </div>

            {/* List */}
            {drafts.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-800 rounded-2xl p-12 text-slate-500">
                    <FileSpreadsheet className="w-16 h-16 mb-4 opacity-20" />
                    <p className="text-lg font-medium">Nenhum artigo importado</p>
                    <p className="text-sm">Clique em "Importar Planilha" para começar.</p>
                </div>
            ) : (
                <div className="space-y-6 pb-20">
                    {drafts.map(draft => (
                        <div key={draft.id} className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl relative animate-in fade-in slide-in-from-bottom-2 duration-500">
                            
                            {/* REVERTED CARD HEADER STRUCTURE (Title Input on Top) */}
                            <div className="flex justify-between items-start mb-6">
                                <div className="flex-1 mr-4">
                                    {draft.status === 'loading_doc' ? (
                                        <div className="flex items-center gap-2 text-indigo-400 mb-2">
                                            <Loader2 className="w-4 h-4 animate-spin" /> Carregando conteúdo do Doc...
                                        </div>
                                    ) : (
                                        <input 
                                            value={draft.title}
                                            onChange={(e) => updateDraft(draft.id, { title: e.target.value })}
                                            className="w-full bg-transparent text-xl font-bold text-white outline-none border-b border-transparent hover:border-slate-700 focus:border-indigo-500 transition-colors pb-1"
                                            placeholder="Título do Artigo"
                                        />
                                    )}
                                    <div className="flex items-center gap-4 text-xs mt-2">
                                        <span className="text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
                                            KW: <span className="text-white font-bold">{draft.keyword}</span>
                                        </span>
                                        
                                        {draft.originalDocUrl ? (
                                            <a href={draft.originalDocUrl} target="_blank" className="flex items-center gap-1 text-slate-500 hover:text-indigo-400 transition-colors">
                                                <ExternalLink className="w-3 h-3" /> Ver Doc
                                            </a>
                                        ) : (
                                            <span className="text-slate-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> Sem Doc</span>
                                        )}

                                        {draft.status === 'success' && (
                                             <a href={draft.publishedLink} target="_blank" className="flex items-center gap-1 text-green-400 hover:text-green-300 font-bold bg-green-900/20 px-2 py-0.5 rounded">
                                                <CheckCircle className="w-3 h-3" /> Publicado
                                            </a>
                                        )}
                                        {draft.status === 'error' && (
                                            <span className="text-red-400 bg-red-900/20 px-2 py-0.5 rounded flex items-center gap-1">
                                                <AlertTriangle className="w-3 h-3"/> {draft.errorMsg}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                     <button 
                                        onClick={() => setEditingDraftId(draft.id)}
                                        disabled={draft.status === 'loading_doc' || draft.status === 'success'}
                                        className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
                                        title="Editar Conteúdo"
                                     >
                                        <Edit className="w-4 h-4" />
                                    </button>
                                    <button 
                                        onClick={() => handleRemoveDraft(draft.id)}
                                        className="p-2 text-slate-400 hover:text-red-400 bg-slate-800 hover:bg-red-900/20 rounded-lg transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            {/* Config Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 pt-4 border-t border-slate-800">
                                
                                {/* Col 1: Site & Category (4 cols) */}
                                <div className="md:col-span-4 space-y-4">
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-500 uppercase flex justify-between">
                                            Site de Destino
                                            {!draft.matchedSiteId && <span className="text-yellow-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> Não encontrado</span>}
                                        </label>
                                        <div className="flex gap-2">
                                            <select 
                                                className={`flex-1 bg-slate-950 border rounded-lg p-2 text-sm outline-none focus:border-indigo-500 ${!draft.matchedSiteId ? 'border-yellow-600/50 text-yellow-500' : 'border-slate-700 text-slate-300'}`}
                                                value={draft.matchedSiteId || ''}
                                                onChange={(e) => updateDraft(draft.id, { matchedSiteId: e.target.value })}
                                            >
                                                <option value="">Selecione...</option>
                                                {sites.map(s => <option key={s.id} value={s.id}>{s.name} ({s.url})</option>)}
                                            </select>
                                            <button 
                                                onClick={() => setIsAddSiteModalOpen(true)}
                                                className="p-2 bg-slate-800 text-slate-400 hover:text-white rounded-lg border border-slate-700"
                                                title="Adicionar Novo Site"
                                            >
                                                <Plus className="w-4 h-4"/>
                                            </button>
                                        </div>
                                        {draft.siteUrlFromSheet && (
                                            <p className="text-[10px] text-slate-600 truncate" title={draft.siteUrlFromSheet}>
                                                Alvo da Planilha: {draft.siteUrlFromSheet}
                                            </p>
                                        )}
                                    </div>

                                    {draft.matchedSiteId && (
                                        <div className="space-y-1">
                                            <label className="text-xs font-bold text-slate-500 uppercase">Categoria</label>
                                            <select 
                                                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-sm text-slate-300 outline-none focus:border-indigo-500"
                                                value={draft.categoryId}
                                                onChange={(e) => updateDraft(draft.id, { categoryId: Number(e.target.value) })}
                                            >
                                                <option value="">Selecione...</option>
                                                {categoryCache[draft.matchedSiteId]?.map(c => (
                                                    <option key={c.id} value={c.id}>{c.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                </div>

                                {/* Col 2: SEO (4 cols) */}
                                <div className="md:col-span-5 space-y-4">
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-500 uppercase">Slug (URL)</label>
                                        <input 
                                            value={draft.slug}
                                            onChange={(e) => updateDraft(draft.id, { slug: e.target.value })}
                                            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-sm text-slate-300 outline-none focus:border-indigo-500"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-500 uppercase">Meta Descrição</label>
                                        <textarea 
                                            value={draft.metaDesc}
                                            onChange={(e) => updateDraft(draft.id, { metaDesc: e.target.value })}
                                            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-sm text-slate-300 outline-none focus:border-indigo-500 h-[38px] resize-none overflow-hidden focus:h-20 transition-all"
                                            placeholder="Resumo para o Google..."
                                        />
                                    </div>
                                </div>

                                {/* Col 3: Image & Action (3 cols) */}
                                <div className="md:col-span-3 flex flex-col justify-between gap-4">
                                    
                                    {/* Image Upload */}
                                    <div className="relative group cursor-pointer" onClick={() => document.getElementById(`file-${draft.id}`)?.click()}>
                                        <input 
                                            id={`file-${draft.id}`}
                                            type="file" 
                                            className="hidden" 
                                            accept="image/*"
                                            onChange={(e) => e.target.files?.[0] && handleImageSelect(draft.id, e.target.files[0])}
                                        />
                                        <div className="h-20 w-full bg-slate-950 border border-dashed border-slate-700 rounded-lg flex items-center justify-center overflow-hidden hover:border-slate-500 transition-colors">
                                            {draft.imagePreview ? (
                                                <img src={draft.imagePreview} className="w-full h-full object-cover opacity-80" />
                                            ) : (
                                                <div className="flex flex-col items-center text-slate-600">
                                                    <ImageIcon className="w-5 h-5 mb-1" />
                                                    <span className="text-[10px]">Add Imagem</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Publish Button */}
                                    <button 
                                        onClick={() => handlePublish(draft.id)}
                                        disabled={draft.status === 'publishing' || draft.status === 'success' || !draft.matchedSiteId || draft.status === 'loading_doc'}
                                        className={`
                                            w-full py-2 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all
                                            ${draft.status === 'success' 
                                                ? 'bg-green-600/20 text-green-400 border border-green-600/50 cursor-default'
                                                : draft.status === 'publishing'
                                                ? 'bg-blue-600/50 text-white cursor-wait'
                                                : !draft.matchedSiteId
                                                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                                                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20'}
                                        `}
                                    >
                                        {draft.status === 'publishing' && <Loader2 className="w-4 h-4 animate-spin" />}
                                        {draft.status === 'success' ? 'Publicado' : draft.status === 'publishing' ? 'Publicando...' : 'Publicar'}
                                    </button>

                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* MODALS */}
            
            {/* 1. Content Editor */}
            {editingDraftId && (
                <ContentEditorModal 
                    isOpen={!!editingDraftId}
                    onClose={() => setEditingDraftId(null)}
                    title={drafts.find(d => d.id === editingDraftId)?.title || ''}
                    initialContent={drafts.find(d => d.id === editingDraftId)?.content || ''}
                    onSave={(newContent) => updateDraft(editingDraftId, { content: newContent })}
                />
            )}

            {/* 2. Add Site Modal */}
            {isAddSiteModalOpen && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
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
                                onClick={handleAddSite}
                                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg mt-2 transition-colors"
                            >
                                Salvar e Conectar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BulkPostManager;