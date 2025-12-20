import React, { useState, useEffect, useRef } from 'react';
import Layout from './components/Layout';
import PostForm from './components/PostForm';
import ArticlePreview from './components/ArticlePreview';
import Settings from './components/Settings';
import SheetImportModal from './components/SheetImportModal';
import BatchStatus from './components/BatchStatus';
import WordpressPublisher from './components/WordpressPublisher';
import BulkPostManager from './components/BulkPostManager'; // Imported
import { generateGuestPostContent } from './services/gemini';
import { uploadToDrive, convertMarkdownToHtml } from './services/drive';
import { updateSheetCell } from './services/sheets';
import { AppMode, GeneratedArticle, GuestPostRequest, QueueItem, BatchProgress } from './types';
import { Trash2, AlertTriangle, CheckCircle2, Cloud, History, PenTool, FileSpreadsheet, FlaskConical } from 'lucide-react';

// Declare global augmentation for window.google
declare global {
    interface Window {
        google: any;
    }
}

const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Simple mock for "Drive" download (local fallback)
const downloadAsDoc = (article: GeneratedArticle) => {
  const htmlContent = convertMarkdownToHtml(article.content, article.title);
  const source = 'data:application/vnd.ms-word;charset=utf-8,' + encodeURIComponent(htmlContent);
  const fileDownload = document.createElement("a");
  document.body.appendChild(fileDownload);
  fileDownload.href = source;
  fileDownload.download = `${article.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.doc`;
  fileDownload.click();
  document.body.removeChild(fileDownload);
};

// DEMO DATA
const DEMO_ROWS = [
    ["Importância do Yoga no Trabalho", "Blog de RH e Carreira", "https://lojasports.com/kits-yoga", "kits de yoga corporativo", "E-commerce Esportivo"],
    ["Estratégias de Marketing Digital 2024", "Portal de Tecnologia", "https://agenciaxyz.com/seo", "consultoria de SEO", "Agência de Marketing"],
    ["Dicas de Alimentação Saudável", "Revista Vida Leve", "https://nutriapp.com", "app de nutrição", "Aplicativo Mobile"]
];

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.SINGLE);
  
  // Storage
  const [articles, setArticles] = useState<GeneratedArticle[]>(() => {
    try {
        const saved = localStorage.getItem('guestpost_articles');
        return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
  });

  // UI State
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [activeArticle, setActiveArticle] = useState<GeneratedArticle | null>(null);
  const [notification, setNotification] = useState<{msg: string, type: 'success' | 'error'} | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [isSheetModalOpen, setIsSheetModalOpen] = useState(false);
  
  // New State for Bulk Import Data Transfer
  const [bulkImportData, setBulkImportData] = useState<{ sheetId: string, rows: any[][], token: string } | null>(null);

  // --- BACKGROUND BATCH PROCESSING STATE ---
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const [batchToken, setBatchToken] = useState<string | null>(null); // Store auth token for batch
  const [batchProgress, setBatchProgress] = useState<BatchProgress>({
    isActive: false,
    total: 0,
    processed: 0,
    currentKeyword: '',
    logs: []
  });

  // Init
  useEffect(() => {
    const initializeGoogle = () => {
        if (window.google) console.log("Google Identity Services loaded");
    };
    if (window.google) initializeGoogle();
    else window.addEventListener('load', initializeGoogle);

    const checkDemo = localStorage.getItem('guestpost_demo_mode');
    setIsDemoMode(checkDemo === 'true');

    return () => window.removeEventListener('load', initializeGoogle);
  }, [mode]);

  useEffect(() => {
    localStorage.setItem('guestpost_articles', JSON.stringify(articles));
  }, [articles]);

  useEffect(() => {
    if(notification) {
        const timer = setTimeout(() => setNotification(null), 4000);
        return () => clearTimeout(timer);
    }
  }, [notification]);

  // --- BATCH WORKER (useEffect) ---
  useEffect(() => {
    const processNextItem = async () => {
        if (queue.length === 0 || isProcessingBatch) return;

        setIsProcessingBatch(true);
        const item = queue[0];
        
        // Update Status UI
        setBatchProgress(prev => ({
            ...prev,
            isActive: true,
            currentKeyword: item.request.keyword,
        }));

        const addLog = (msg: string) => {
            setBatchProgress(prev => ({ ...prev, logs: [...prev.logs, msg] }));
        };

        try {
            addLog(`Iniciando: ${item.request.keyword}`);

            // 1. Generate AI Content
            let content = "";
            let title = "";
            
            if (isDemoMode) {
                await delay(1500); // Simulate AI thinking
                content = `# ${item.request.keyword} (Demo)\n\nConteúdo gerado automaticamente...`;
                title = item.request.keyword;
            } else {
                content = await generateGuestPostContent(item.request);
                const titleMatch = content.match(/^#\s+(.+)$/m) || content.match(/^(.+)$/m);
                title = titleMatch ? titleMatch[1].replace(/\*\*/g, '') : item.request.keyword;
            }

            addLog(`Artigo gerado. Salvando...`);

            // 2. Upload to Drive & Update Sheet
            let driveUrl = "";
            let driveId = "";

            if (isDemoMode) {
                await delay(1000);
                driveUrl = "https://docs.google.com/demo-link";
                driveId = "demo-id";
            } else if (batchToken) {
                const htmlContent = convertMarkdownToHtml(content, title);
                const driveResult = await uploadToDrive(batchToken, title, htmlContent);
                driveUrl = driveResult.webViewLink;
                driveId = driveResult.id;
                
                addLog(`Atualizando planilha...`);
                await updateSheetCell(batchToken, item.sheetId, item.rowIndex, driveUrl);
            } else {
                throw new Error("Token de autenticação perdido.");
            }

            // 3. Save to History
            const newArticle: GeneratedArticle = {
                id: generateId(),
                requestId: item.request.id,
                title: title,
                content: content,
                createdAt: new Date(),
                status: 'completed',
                driveUrl,
                driveId
            };
            
            setArticles(prev => [newArticle, ...prev]);
            addLog(`Sucesso: "${item.request.keyword}" - Link salvo na planilha.`);

        } catch (error: any) {
            console.error(error);
            // Error handling improvements
            let errorMsg = error.message || "Erro desconhecido";
            // Clean up common error prefixes
            if (errorMsg.includes('GoogleGenAIError:')) errorMsg = errorMsg.split('GoogleGenAIError:')[1].trim();
            addLog(`Erro em "${item.request.keyword}": ${errorMsg}`);
        } finally {
            
            // IMPORTANT: Add a delay to prevent API Rate Limiting (429)
            // If we are not in demo mode and there are more items, wait 3 seconds
            if (!isDemoMode && queue.length > 1) {
                await delay(3000);
            }

            // Remove item from queue and update progress counts
            setQueue(prev => prev.slice(1));
            setBatchProgress(prev => ({
                ...prev,
                processed: prev.processed + 1
            }));
            setIsProcessingBatch(false);
        }
    };

    processNextItem();
  }, [queue, isProcessingBatch, batchToken, isDemoMode]);


  // Handler called by the Modal when user clicks "Start"
  const handleSheetImport = (sheetId: string, rows: any[][], token: string) => {
    
    // IF WE ARE IN BULK PUBLISH MODE, REDIRECT DATA THERE
    if (mode === AppMode.BULK_PUBLISH) {
        setBulkImportData({ sheetId, rows, token });
        setNotification({ msg: 'Dados importados! Revisando...', type: 'success' });
        return;
    }

    // ELSE: GENERATION MODE (Existing logic)
    // 1. Transform rows into Queue Items
    let newQueue: QueueItem[] = [];
    const rowsToProcess = isDemoMode ? DEMO_ROWS : rows;

    rowsToProcess.forEach((row, index) => {
        if (!row[0]) return;
        const req: GuestPostRequest = {
            id: generateId(),
            keyword: row[0],
            hostNiche: row[1] || 'Geral',
            targetLink: row[2] || '#',
            anchorText: row[3] || 'link',
            targetNiche: row[4] || 'Geral'
        };
        newQueue.push({
            id: generateId(),
            request: req,
            rowIndex: index, 
            sheetId: sheetId,
            status: 'pending'
        });
    });

    if (newQueue.length === 0) {
        setNotification({ msg: 'Nenhuma linha válida encontrada para processar.', type: 'error' });
        return;
    }

    setBatchToken(token); 
    setQueue(newQueue);
    setBatchProgress({
        isActive: true,
        total: newQueue.length,
        processed: 0,
        currentKeyword: '',
        logs: [`Importado ${newQueue.length} linhas. Iniciando fila...`]
    });

    setNotification({ msg: 'Processamento iniciado em segundo plano!', type: 'success' });
  };


  // Single Post Generation
  const handleGenerate = async (req: GuestPostRequest) => {
    setIsLoading(true);
    try {
      const content = await generateGuestPostContent(req);
      const titleMatch = content.match(/^#\s+(.+)$/m) || content.match(/^(.+)$/m);
      const title = titleMatch ? titleMatch[1].replace(/\*\*/g, '') : req.keyword;

      const newArticle: GeneratedArticle = {
        id: generateId(),
        requestId: req.id,
        title: title,
        content: content,
        createdAt: new Date(),
        status: 'completed'
      };

      setArticles(prev => [newArticle, ...prev]);
      setActiveArticle(newArticle);
      setNotification({ msg: 'Artigo gerado com sucesso!', type: 'success' });
    } catch (error) {
      console.error(error);
      setNotification({ msg: 'Falha ao gerar artigo. Verifique o console.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveToDrive = (article: GeneratedArticle) => {
    if (isDemoMode) {
        setIsUploading(true);
        setTimeout(() => {
            const updated = articles.map(a => a.id === article.id ? { ...a, driveUrl: 'https://docs.google.com/demo', driveId: 'demo' } : a);
            setArticles(updated);
            if (activeArticle?.id === article.id) setActiveArticle({ ...article, driveUrl: 'https://docs.google.com/demo', driveId: 'demo' });
            setIsUploading(false);
            setNotification({ msg: '[DEMO] Salvo!', type: 'success' });
        }, 1000);
        return;
    }

    const clientId = localStorage.getItem('google_client_id');
    if (!clientId) {
        setNotification({ msg: 'Configure o Client ID nas Configurações.', type: 'error' });
        setMode(AppMode.SETTINGS);
        return;
    }

    const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: async (response: any) => {
            if (response.error) {
                setNotification({ msg: 'Erro na autenticação.', type: 'error' });
                return;
            }
            setIsUploading(true);
            try {
                const html = convertMarkdownToHtml(article.content, article.title);
                const result = await uploadToDrive(response.access_token, article.title, html);
                const updated = articles.map(a => a.id === article.id ? { ...a, driveUrl: result.webViewLink, driveId: result.id } : a);
                setArticles(updated);
                if (activeArticle?.id === article.id) setActiveArticle({ ...article, driveUrl: result.webViewLink, driveId: result.id });
                setNotification({ msg: 'Salvo no Drive!', type: 'success' });
            } catch (error: any) {
                setNotification({ msg: `Erro: ${error.message}`, type: 'error' });
            } finally {
                setIsUploading(false);
            }
        },
    });
    client.requestAccessToken();
  };

  // Navigates to WP Publisher with active article data
  const handleEditInWp = () => {
      setMode(AppMode.WORDPRESS);
      // We do NOT clear activeArticle here, so it can be passed as props
  };

  // Render Helpers
  const renderContent = () => {
    if (mode === AppMode.SETTINGS) {
        return <Settings onSave={() => {
              const checkDemo = localStorage.getItem('guestpost_demo_mode');
              setIsDemoMode(checkDemo === 'true');
              setMode(AppMode.SINGLE);
              setNotification({ msg: 'Salvo!', type: 'success' });
          }} />;
    }

    // BULK PUBLISH MODE
    if (mode === AppMode.BULK_PUBLISH) {
        return <BulkPostManager 
            onOpenImportModal={() => setIsSheetModalOpen(true)}
            importedData={bulkImportData}
            clearImportedData={() => setBulkImportData(null)}
        />;
    }

    // EDITOR WP MODE
    if (mode === AppMode.WORDPRESS) {
        return <WordpressPublisher 
            initialTitle={activeArticle?.title}
            initialContent={activeArticle?.content}
        />;
    }

    if (mode === AppMode.SINGLE) {
        if (activeArticle) {
            return (
                <ArticlePreview 
                    article={activeArticle} 
                    onDownloadDoc={downloadAsDoc} 
                    onSaveToDrive={handleSaveToDrive}
                    onBack={() => setActiveArticle(null)}
                    onEditWp={handleEditInWp}
                    isUploading={isUploading}
                />
            );
        }
        return (
          <div className="h-full flex flex-col justify-center relative">
            <PostForm 
                onSubmit={handleGenerate} 
                isLoading={isLoading} 
                onOpenBatchImport={() => setIsSheetModalOpen(true)}
            />
            
            <div className="fixed bottom-4 left-0 right-0 flex justify-center pointer-events-none">
                 <button onClick={() => setMode(AppMode.SETTINGS)} className="pointer-events-auto text-[10px] text-slate-600 hover:text-indigo-400 flex items-center gap-2 transition-colors">
                    <Cloud className="w-3 h-3" /> Configurar Drive
                </button>
            </div>

            {isDemoMode && (
                <div className="absolute top-0 right-0 m-4 text-xs font-bold text-indigo-400 bg-indigo-900/30 px-3 py-1 rounded-full border border-indigo-500/30 flex items-center gap-2">
                    <FlaskConical className="w-3 h-3"/> MODO DEMO
                </div>
            )}
          </div>
        );
    }

    if (mode === AppMode.HISTORY) {
        return (
          <div className="space-y-6 pt-12 md:pt-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-white">Histórico</h2>
                <button onClick={() => setArticles([])} className="text-red-400 hover:text-red-300 text-sm flex items-center gap-1 px-3 py-1 rounded-lg hover:bg-red-900/20 transition-colors">
                    <Trash2 className="w-4 h-4" /> Limpar
                </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {articles.map(article => (
                    <div key={article.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-indigo-500/30 transition-all flex flex-col justify-between h-[250px]">
                        <div>
                            <div className="flex justify-between items-start mb-3">
                                <h3 className="font-semibold text-lg text-slate-200 line-clamp-2">{article.title}</h3>
                            </div>
                            <p className="text-slate-500 text-sm mb-4 line-clamp-3">{article.content.slice(0, 150)}...</p>
                        </div>
                        <div className="flex gap-2 w-full pt-4 border-t border-slate-800">
                            <button onClick={() => { setActiveArticle(article); setMode(AppMode.SINGLE); }} className="text-xs bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg transition-colors flex-1">Ver</button>
                            {article.driveUrl ? (
                                <a href={article.driveUrl} target="_blank" rel="noreferrer" className="text-xs bg-emerald-600/10 hover:bg-emerald-600 hover:text-white text-emerald-400 border border-emerald-600/20 px-3 py-1.5 rounded-lg transition-colors flex-1 text-center flex items-center justify-center gap-1">
                                    <Cloud className="w-3 h-3"/> Drive
                                </a>
                            ) : (
                                <button onClick={() => handleSaveToDrive(article)} className="text-xs bg-blue-600/10 hover:bg-blue-600 hover:text-white text-blue-400 border border-blue-600/20 px-3 py-1.5 rounded-lg transition-colors flex-1 text-center">Salvar</button>
                            )}
                        </div>
                    </div>
                ))}
                {articles.length === 0 && (
                    <div className="col-span-full py-20 text-center text-slate-600 bg-slate-900/30 rounded-2xl border-2 border-dashed border-slate-800">
                        <History className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p>Nenhum artigo.</p>
                    </div>
                )}
            </div>
          </div>
        );
    }
  };

  return (
    <Layout 
        currentMode={mode} 
        setMode={(newMode) => {
            // When user clicks the Sidebar, we clear any active editing context
            // so the tool opens fresh.
            setMode(newMode);
            setActiveArticle(null);
            setBulkImportData(null); // Clear bulk data on nav change
        }} 
        isFullWidth={mode === AppMode.SINGLE && activeArticle !== null || mode === AppMode.WORDPRESS || mode === AppMode.BULK_PUBLISH}
    >
        {notification && (
            <div className={`fixed top-4 right-4 z-50 px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-bounce-in ${notification.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                {notification.type === 'success' ? <CheckCircle2 className="w-5 h-5"/> : <AlertTriangle className="w-5 h-5"/>}
                <span className="font-medium">{notification.msg}</span>
            </div>
        )}
        
        {/* Background Status Widget */}
        <BatchStatus 
            progress={batchProgress} 
            onClose={() => setBatchProgress(prev => ({ ...prev, isActive: false, processed: 0, total: 0, logs: [] }))} 
        />

        <SheetImportModal 
            isOpen={isSheetModalOpen}
            onClose={() => setIsSheetModalOpen(false)}
            onImport={handleSheetImport}
            isDemoMode={isDemoMode}
            currentMode={mode}
        />

        {renderContent()}
    </Layout>
  );
};

export default App;