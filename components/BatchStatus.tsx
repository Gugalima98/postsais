import React, { useState } from 'react';
import { Loader2, CheckCircle2, XCircle, ChevronDown, ChevronUp, FileSpreadsheet } from 'lucide-react';
import { BatchProgress } from '../types';

interface BatchStatusProps {
  progress: BatchProgress;
  onClose: () => void;
}

const BatchStatus: React.FC<BatchStatusProps> = ({ progress, onClose }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!progress.isActive && progress.processed === 0) return null;

  const isComplete = progress.processed === progress.total && progress.total > 0;
  const percentage = progress.total > 0 ? (progress.processed / progress.total) * 100 : 0;

  return (
    <div className={`fixed bottom-4 right-4 z-50 transition-all duration-300 ${isExpanded ? 'w-80' : 'w-64'}`}>
      <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl overflow-hidden flex flex-col">
        
        {/* Header */}
        <div 
            className="p-3 bg-slate-800 flex items-center justify-between cursor-pointer border-b border-slate-700"
            onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2">
            {isComplete ? (
                <CheckCircle2 className="w-5 h-5 text-green-400" />
            ) : (
                <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
            )}
            <span className="font-bold text-sm text-white">
                {isComplete ? 'Processamento Concluído' : 'Gerando em Massa...'}
            </span>
          </div>
          <div className="flex items-center gap-1">
             <button className="text-slate-400 hover:text-white">
                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
             </button>
          </div>
        </div>

        {/* Content */}
        {isExpanded && (
            <div className="p-4 bg-slate-900/95 backdrop-blur">
                <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <span>Progresso</span>
                    <span>{progress.processed} / {progress.total}</span>
                </div>
                
                {/* Progress Bar */}
                <div className="w-full bg-slate-800 rounded-full h-2 mb-3">
                    <div 
                        className={`h-2 rounded-full transition-all duration-500 ${isComplete ? 'bg-green-500' : 'bg-indigo-500'}`}
                        style={{ width: `${percentage}%` }}
                    ></div>
                </div>

                {!isComplete && (
                    <div className="flex items-center gap-2 text-xs text-indigo-300 mb-3 animate-pulse">
                        <FileSpreadsheet className="w-3 h-3" />
                        <span className="truncate">Criando: {progress.currentKeyword || 'Aguardando...'}</span>
                    </div>
                )}

                {/* Mini Log */}
                <div className="h-24 overflow-y-auto bg-black/40 rounded border border-slate-800 p-2 space-y-1 mb-3 custom-scrollbar">
                    {progress.logs.length === 0 && <span className="text-[10px] text-slate-600">Iniciando...</span>}
                    {progress.logs.slice().reverse().map((log, i) => (
                        <div key={i} className="text-[10px] text-slate-400 truncate border-b border-slate-800/50 pb-1 last:border-0">
                            {log}
                        </div>
                    ))}
                </div>

                {isComplete && (
                    <button 
                        onClick={onClose}
                        className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded transition-colors"
                    >
                        Fechar
                    </button>
                )}
            </div>
        )}
      </div>
    </div>
  );
};

export default BatchStatus;