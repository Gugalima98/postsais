import React, { useState } from 'react';
import { FileSpreadsheet, Play, AlertTriangle, Loader2, CheckCircle2 } from 'lucide-react';
import { SeoArticleRequest, SeoTopic, QueueItem, AppMode } from '../types';
import { extractSheetId, fetchSeoSheetData } from '../services/sheets';

interface SeoArticleManagerProps {
    onStartBatch: (queueItems: QueueItem[], token: string) => void;
    isDemoMode: boolean;
    onGoToSettings: () => void;
}

const DEMO_TABS = [
    { title: "Benefícios do Yoga", topics: [{topic: "Introdução", tag: "h2"}, {topic: "Posturas", tag: "h3"}] },
    { title: "Dieta Low Carb", topics: [{topic: "O que é", tag: "h2"}, {topic: "Alimentos Permitidos", tag: "h3"}] }
];

const SeoArticleManager: React.FC<SeoArticleManagerProps> = ({ onStartBatch, isDemoMode, onGoToSettings }) => {
    const [sheetUrl, setSheetUrl] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState('');
    const [scannedItems, setScannedItems] = useState<{keyword: string, count: number}[]>([]);

    const handleAnalyzeAndStart = async () => {
        if (isDemoMode) {
            setStatus('loading');
            setTimeout(() => {
                const queue: QueueItem[] = DEMO_TABS.map((tab, idx) => ({
                    id: Date.now().toString() + idx,
                    type: 'seo_article',
                    request: {
                        id: Date.now().toString() + idx,
                        keyword: tab.title,
                        topics: tab.topics
                    },
                    rowIndex: 0,
                    sheetId: 'demo-sheet',
                    status: 'pending',
                    tabName: tab.title
                }));
                setStatus('success');
                setScannedItems(queue.map(q => ({keyword: q.request.keyword, count: q.request.topics.length})));
                setTimeout(() => onStartBatch(queue, 'demo-token'), 1500);
            }, 1000);
            return;
        }

        const clientId = localStorage.getItem('google_client_id');
        if (!clientId) {
            setErrorMsg('Configure o Client ID do Google nas Configurações.');
            setStatus('error');
            return;
        }

        const rawSheetId = extractSheetId(sheetUrl);
        if (!rawSheetId) {
            setErrorMsg('Link da planilha inválido.');
            setStatus('error');
            return;
        }

        setStatus('loading');
        setErrorMsg('');

        try {
            const client = window.google.accounts.oauth2.initTokenClient({
                client_id: clientId,
                scope: 'https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/drive.file',
                callback: async (response: any) => {
                    if (response.error) {
                        setStatus('error');
                        setErrorMsg('Erro na autenticação.');
                        return;
                    }

                    try {
                        const data = await fetchSeoSheetData(response.access_token, rawSheetId);
                        
                        const queue: QueueItem[] = [];
                        
                        data.sheetTitles.forEach((title: string, index: number) => {
                            const rangeData = data.valueRanges[index];
                            if (!rangeData || !rangeData.values) return; // empty sheet
                            
                            const topics: SeoTopic[] = [];
                            
                            // Iterate rows, starting after header if needed. Assume Row 1 is header.
                            // Assuming Col A = Topic, Col B = Tag
                            rangeData.values.forEach((row: any[], rIndex: number) => {
                                if (rIndex === 0 && row[0]?.toLowerCase().includes('topic')) return; // skip header
                                if (row[0] && row[1]) {
                                    topics.push({
                                        topic: row[0].trim(),
                                        tag: row[1].trim()
                                    });
                                }
                            });

                            if (topics.length > 0) {
                                queue.push({
                                    id: Date.now().toString() + index,
                                    type: 'seo_article',
                                    request: {
                                        id: Date.now().toString() + index,
                                        keyword: title,
                                        topics
                                    },
                                    rowIndex: 0, // not used for saving back here yet
                                    sheetId: rawSheetId,
                                    status: 'pending',
                                    tabName: title
                                });
                            }
                        });

                        if (queue.length === 0) {
                            setStatus('error');
                            setErrorMsg('Nenhum dado válido encontrado nas abas. Preencha Coluna A (Tópico) e B (Tag).');
                            return;
                        }

                        setStatus('success');
                        setScannedItems(queue.map(q => ({keyword: q.request.keyword, count: q.request.topics.length})));
                        
                        // Pass queue and token to App.tsx batch processor
                        onStartBatch(queue, response.access_token);

                    } catch (e: any) {
                        setStatus('error');
                        setErrorMsg('Erro ao ler planilha: ' + e.message);
                    }
                }
            });
            client.requestAccessToken();
        } catch (e: any) {
            setStatus('error');
            setErrorMsg(e.message);
        }
    };

    return (
        <div className="max-w-3xl mx-auto space-y-6 pt-12 md:pt-6">
            <div>
                <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
                    <FileSpreadsheet className="w-6 h-6 text-orange-400" /> Criador de Artigo SEO
                </h2>
                <p className="text-slate-400">Gere artigos otimizados em lote lendo diretamente a estrutura de tópicos da sua planilha.</p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8 shadow-2xl relative overflow-hidden">
                <div className="space-y-6 relative z-10">
                    <div>
                        <label className="block text-sm font-semibold text-slate-300 mb-2">Link da Planilha do Google</label>
                        <input
                            type="text"
                            value={sheetUrl}
                            onChange={(e) => setSheetUrl(e.target.value)}
                            placeholder="https://docs.google.com/spreadsheets/d/..."
                            className="w-full bg-slate-950 border border-slate-700/50 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-orange-500/50 transition-all font-mono text-sm"
                            disabled={status === 'loading' || status === 'success'}
                        />
                        <p className="text-xs text-slate-500 mt-2">
                            * Cada aba da planilha será lida como a Palavra-chave (H1).<br/>
                            * A Coluna A deve conter o Tópico e a Coluna B a Hierarquia (H2, H3, etc).
                        </p>
                    </div>

                    <div className="flex gap-4">
                         <button
                            onClick={handleAnalyzeAndStart}
                            disabled={(!sheetUrl.trim() && !isDemoMode) || status === 'loading' || status === 'success'}
                            className="flex-1 bg-orange-600 hover:bg-orange-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2"
                        >
                            {status === 'loading' ? (
                                <><Loader2 className="w-5 h-5 animate-spin" /> Analisando Planilha...</>
                            ) : status === 'success' ? (
                                <><CheckCircle2 className="w-5 h-5" /> Iniciando Fila!</>
                            ) : (
                                <><Play className="w-5 h-5" /> Importar e Gerar</>
                            )}
                        </button>
                    </div>

                    {status === 'error' && (
                        <div className="p-4 bg-red-900/20 border border-red-900/30 rounded-xl flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                            <div className="text-sm text-red-400">
                                {errorMsg}
                                {errorMsg.includes('Client ID') && (
                                    <button onClick={onGoToSettings} className="ml-2 underline text-red-300">Ir para Configurações</button>
                                )}
                            </div>
                        </div>
                    )}

                    {scannedItems.length > 0 && (
                        <div className="mt-6 border-t border-slate-800 pt-6">
                            <h3 className="text-sm font-bold text-slate-400 mb-3">Planilha Analisada ({scannedItems.length} Abas/Artigos)</h3>
                            <div className="bg-slate-950 rounded-lg p-3 max-h-40 overflow-y-auto space-y-2 border border-slate-800">
                                {scannedItems.map((item, idx) => (
                                    <div key={idx} className="flex justify-between items-center text-xs">
                                        <span className="font-semibold text-slate-300">{item.keyword}</span>
                                        <span className="bg-slate-800 text-slate-400 px-2 py-1 rounded">{item.count} tópicos</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SeoArticleManager;
