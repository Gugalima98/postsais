import React, { useState } from 'react';
import { X, FileSpreadsheet, Play, Loader2, AlertCircle } from 'lucide-react';
import { extractSheetId, fetchSheetRows } from '../services/sheets';
import { AppMode } from '../types';

interface SheetImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (sheetId: string, rows: any[][], token: string) => void;
  isDemoMode: boolean;
  currentMode?: AppMode; // Added to handle different instructions
}

const SheetImportModal: React.FC<SheetImportModalProps> = ({ isOpen, onClose, onImport, isDemoMode, currentMode }) => {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleStart = async () => {
    setError('');
    
    // DEMO BYPASS
    if (isDemoMode) {
        onImport('demo-sheet-id', [], 'demo-token');
        onClose();
        return;
    }

    const sheetId = extractSheetId(url);
    if (!sheetId) {
        setError('URL da planilha inválida.');
        return;
    }

    const clientId = localStorage.getItem('google_client_id');
    if (!clientId) {
        setError('Client ID não configurado nas Configurações.');
        return;
    }

    setIsLoading(true);

    try {
        const client = window.google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets',
            callback: async (response: any) => {
                if (response.error) {
                    setError('Erro na autenticação Google.');
                    setIsLoading(false);
                    return;
                }

                try {
                    // Fetch rows immediately to validate and count
                    const rows = await fetchSheetRows(response.access_token, sheetId);
                    
                    if (!rows || rows.length === 0) {
                        setError('A planilha está vazia.');
                        setIsLoading(false);
                        return;
                    }

                    // Pass data to App parent to handle background processing
                    onImport(sheetId, rows, response.access_token);
                    onClose(); // Close modal immediately
                } catch (err: any) {
                    setError('Erro ao ler planilha: ' + err.message);
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

  const isBulkPublish = currentMode === AppMode.BULK_PUBLISH;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="bg-green-600/20 p-2 rounded-lg text-green-500">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">{isBulkPublish ? 'Importar Artigos Prontos' : 'Gerar Novos Artigos'}</h2>
              <p className="text-xs text-slate-400">O processamento ocorrerá em segundo plano.</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
             <div className="bg-slate-950 rounded-xl p-4 border border-slate-800 text-sm">
                <p className="font-semibold text-slate-300 mb-2">Estrutura das Colunas:</p>
                
                {isBulkPublish ? (
                    // BULK PUBLISH INSTRUCTIONS
                    <div className="flex flex-col gap-2 pb-2">
                        <div className="flex items-center gap-2"><span className="font-mono text-emerald-400">Col A:</span> <span className="text-slate-400">Palavra-chave (Keyword)</span></div>
                        <div className="flex items-center gap-2"><span className="font-mono text-emerald-400">Col B:</span> <span className="text-slate-400">Site WordPress (URL)</span></div>
                        <div className="flex items-center gap-2"><span className="font-mono text-emerald-400">Col C:</span> <span className="text-slate-400">Link do Google Docs</span></div>
                    </div>
                ) : (
                    // GENERATION INSTRUCTIONS
                    <div className="flex flex-wrap gap-2 pb-2">
                        {['A: Palavra-chave', 'B: Nicho Host', 'C: Link Alvo', 'D: Texto Âncora', 'E: Nicho Alvo'].map(col => (
                            <span key={col} className="px-2 py-1 bg-slate-800 rounded text-slate-300 text-[10px] border border-slate-700">{col}</span>
                        ))}
                    </div>
                )}
                
                {!isBulkPublish && (
                    <p className="text-slate-500 text-xs italic mt-2">
                        A coluna F receberá o link do documento gerado.
                    </p>
                )}
             </div>

            <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Link da Planilha Google</label>
                <input 
                    type="text" 
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-slate-200 outline-none focus:border-indigo-500 transition-colors"
                />
            </div>

            {error && (
                <div className="text-xs text-red-400 flex items-center gap-2 bg-red-900/10 p-3 rounded-lg border border-red-900/30">
                    <AlertCircle className="w-4 h-4"/> {error}
                </div>
            )}

            <button 
                onClick={handleStart}
                disabled={isLoading || !url}
                className="w-full bg-green-600 hover:bg-green-500 disabled:bg-slate-800 disabled:text-slate-600 text-white px-6 py-3.5 rounded-lg font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-green-900/20"
            >
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 fill-current" />}
                {isLoading ? 'Conectando...' : 'Iniciar Processamento'}
            </button>
        </div>
      </div>
    </div>
  );
};

export default SheetImportModal;