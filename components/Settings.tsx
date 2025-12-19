import React, { useState, useEffect } from 'react';
import { Save, Key, AlertCircle, LogIn, CheckCircle2, XCircle, FlaskConical, Plus, Trash2, ShieldCheck } from 'lucide-react';

interface SettingsProps {
  onSave: () => void;
}

const Settings: React.FC<SettingsProps> = ({ onSave }) => {
  const [clientId, setClientId] = useState('');
  const [isDemo, setIsDemo] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  // Gemini Keys State
  const [geminiKeys, setGeminiKeys] = useState<string[]>([]);
  const [newKey, setNewKey] = useState('');

  useEffect(() => {
    // Load Drive Client ID
    const storedClientId = localStorage.getItem('google_client_id');
    if (storedClientId) setClientId(storedClientId);
    
    // Load Demo Mode
    const demo = localStorage.getItem('guestpost_demo_mode');
    setIsDemo(demo === 'true');

    // Load Gemini Keys
    try {
        const storedKeys = localStorage.getItem('guestpost_gemini_keys');
        if (storedKeys) setGeminiKeys(JSON.parse(storedKeys));
    } catch (e) {
        setGeminiKeys([]);
    }
  }, []);

  const handleSave = () => {
    localStorage.setItem('guestpost_demo_mode', String(isDemo));
    
    if (clientId.trim()) {
      localStorage.setItem('google_client_id', clientId.trim());
    }
    
    // Save Gemini Keys
    localStorage.setItem('guestpost_gemini_keys', JSON.stringify(geminiKeys));

    onSave();
  };

  const addGeminiKey = () => {
    if (newKey.trim() && !geminiKeys.includes(newKey.trim())) {
        setGeminiKeys([...geminiKeys, newKey.trim()]);
        setNewKey('');
    }
  };

  const removeGeminiKey = (keyToRemove: string) => {
    setGeminiKeys(geminiKeys.filter(k => k !== keyToRemove));
  };

  const handleTestConnection = () => {
    if (isDemo) {
        setStatus('success');
        return;
    }

    if (!clientId.trim()) {
        setStatus('error');
        setErrorMsg('Por favor, insira e salve um Client ID primeiro.');
        return;
    }

    // Ensure it's saved
    localStorage.setItem('google_client_id', clientId.trim());
    setStatus('loading');
    setErrorMsg('');

    try {
        if (!window.google || !window.google.accounts) {
            setStatus('error');
            setErrorMsg('Script do Google não carregado. Recarregue a página.');
            return;
        }

        const client = window.google.accounts.oauth2.initTokenClient({
            client_id: clientId.trim(),
            scope: 'https://www.googleapis.com/auth/drive.file',
            callback: (response: any) => {
                if (response.error) {
                    console.error(response);
                    setStatus('error');
                    setErrorMsg('Erro na autenticação: ' + (response.error.message || response.error));
                } else {
                    setStatus('success');
                }
            },
        });
        
        // This triggers the Google Popup
        client.requestAccessToken();

    } catch (e: any) {
        setStatus('error');
        setErrorMsg(e.message || 'Erro desconhecido ao tentar conectar.');
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Configurações</h2>
        <p className="text-slate-400">Gerencie suas credenciais de IA e Google Drive.</p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-8">
        
        {/* Demo Mode Toggle */}
        <div className="flex items-start gap-4 p-4 bg-indigo-900/20 border border-indigo-500/30 rounded-xl">
             <div className="p-2 bg-indigo-500 rounded-lg">
                <FlaskConical className="w-5 h-5 text-white" />
             </div>
             <div className="flex-1">
                <div className="flex justify-between items-center mb-1">
                    <h3 className="text-base font-bold text-white">Modo de Demonstração</h3>
                    <button 
                        onClick={() => setIsDemo(!isDemo)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${isDemo ? 'bg-indigo-500' : 'bg-slate-700'}`}
                    >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isDemo ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                </div>
                <p className="text-sm text-slate-300">
                    Ative para testar o fluxo completo usando dados simulados, sem precisar de chaves reais.
                </p>
             </div>
        </div>

        <div className={`space-y-8 transition-opacity ${isDemo ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
            
            {/* GEMINI API KEYS SECTION */}
            <div className="flex items-start gap-4">
                <div className="p-3 bg-slate-800 rounded-lg">
                    <ShieldCheck className="w-6 h-6 text-emerald-400" />
                </div>
                <div className="flex-1 space-y-4">
                    <div>
                        <h3 className="text-lg font-semibold text-white">Chaves Gemini API (Rotação)</h3>
                        <p className="text-sm text-slate-400 mt-1">
                            Adicione múltiplas chaves do <a href="https://aistudio.google.com/" target="_blank" className="text-indigo-400 hover:underline">Google AI Studio</a>. 
                            O sistema irá rotacionar automaticamente caso uma chave atinja o limite de cota.
                        </p>
                    </div>

                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={newKey}
                            onChange={(e) => setNewKey(e.target.value)}
                            placeholder="Cole sua API Key aqui (AIzaSy...)"
                            className="flex-1 bg-slate-950 border border-slate-800 rounded-lg py-2 px-4 text-slate-200 focus:ring-2 focus:ring-emerald-500/50 outline-none font-mono text-sm"
                        />
                        <button 
                            onClick={addGeminiKey}
                            disabled={!newKey}
                            className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 text-white px-4 rounded-lg transition-colors flex items-center justify-center"
                        >
                            <Plus className="w-5 h-5" />
                        </button>
                    </div>

                    {geminiKeys.length > 0 && (
                        <div className="bg-slate-950/50 rounded-lg border border-slate-800 overflow-hidden">
                            {geminiKeys.map((key, index) => (
                                <div key={index} className="flex justify-between items-center p-3 border-b border-slate-800 last:border-0 hover:bg-slate-800/50 transition-colors group">
                                    <div className="flex items-center gap-3">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                        <code className="text-xs text-slate-400 font-mono">
                                            {key.substring(0, 8)}...{key.substring(key.length - 6)}
                                        </code>
                                    </div>
                                    <button 
                                        onClick={() => removeGeminiKey(key)}
                                        className="text-slate-600 hover:text-red-400 transition-colors p-1"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    
                    {geminiKeys.length === 0 && (
                        <div className="text-xs text-yellow-500 bg-yellow-500/10 p-3 rounded-lg border border-yellow-500/20">
                            Nenhuma chave salva. O sistema tentará usar a chave padrão da Vercel (se configurada).
                        </div>
                    )}
                </div>
            </div>

            <div className="h-px bg-slate-800 w-full"></div>

            {/* GOOGLE DRIVE OAUTH */}
            <div className="flex items-start gap-4">
            <div className="p-3 bg-slate-800 rounded-lg">
                <Key className="w-6 h-6 text-slate-400" />
            </div>
            <div className="flex-1">
                <h3 className="text-lg font-semibold text-white">Google Drive OAuth (Client ID)</h3>
                <p className="text-sm text-slate-400 mt-1 mb-4">
                Necessário para criar arquivos Google Docs na sua conta.
                </p>
                
                <label className="block text-xs font-medium text-slate-500 mb-1">CLIENT ID</label>
                <input
                type="text"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="ex: 123456789-abcdefg.apps.googleusercontent.com"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg py-3 px-4 text-slate-200 focus:ring-2 focus:ring-indigo-500/50 outline-none font-mono text-sm mb-2"
                />
                
                <div className="flex flex-col gap-3 mt-4">
                        <button
                            onClick={handleTestConnection}
                            disabled={!clientId || status === 'loading'}
                            className={`
                                flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-all text-sm
                                ${status === 'success' 
                                    ? 'bg-green-600/20 text-green-400 border border-green-600/30 cursor-default' 
                                    : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700'}
                            `}
                        >
                            {status === 'loading' && <div className="animate-spin w-4 h-4 border-2 border-current rounded-full border-t-transparent"></div>}
                            {status === 'idle' && <><LogIn className="w-4 h-4"/> Testar Conexão com Google</>}
                            {status === 'success' && <><CheckCircle2 className="w-4 h-4"/> Conectado com Sucesso</>}
                            {status === 'error' && 'Tentar Novamente'}
                        </button>

                        {status === 'error' && (
                            <div className="text-xs text-red-400 flex items-center gap-2 bg-red-900/10 p-2 rounded border border-red-900/30">
                                <XCircle className="w-4 h-4"/> {errorMsg}
                            </div>
                        )}
                    </div>
            </div>
            </div>
        </div>

        <div className="h-px bg-slate-800 w-full"></div>

        <button
            onClick={handleSave}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-3 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20"
        >
            <Save className="w-4 h-4" />
            Salvar Configurações
        </button>

      </div>
    </div>
  );
};

export default Settings;