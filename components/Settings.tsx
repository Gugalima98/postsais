import React, { useState, useEffect } from 'react';
import { Save, Key, AlertCircle, LogIn, CheckCircle2, XCircle, FlaskConical, Plus, Trash2, ShieldCheck, Globe, Edit, Server, User, Lock, X } from 'lucide-react';
import { WordpressSite } from '../types';

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

  // WP Sites State
  const [wpSites, setWpSites] = useState<WordpressSite[]>([]);
  const [isEditSiteOpen, setIsEditSiteOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<WordpressSite | null>(null); // null = new site

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

    // Load WP Sites
    try {
        const storedSites = localStorage.getItem('guestpost_wp_sites');
        if (storedSites) setWpSites(JSON.parse(storedSites));
    } catch (e) {
        setWpSites([]);
    }
  }, []);

  const handleSave = () => {
    localStorage.setItem('guestpost_demo_mode', String(isDemo));
    
    if (clientId.trim()) {
      localStorage.setItem('google_client_id', clientId.trim());
    }
    
    // Save Gemini Keys
    localStorage.setItem('guestpost_gemini_keys', JSON.stringify(geminiKeys));

    // Save WP Sites
    localStorage.setItem('guestpost_wp_sites', JSON.stringify(wpSites));

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

  // --- WP SITES MANAGEMENT ---
  const handleEditSite = (site: WordpressSite) => {
      setEditingSite(site);
      setIsEditSiteOpen(true);
  };

  const handleDeleteSite = (id: string) => {
      if (confirm('Tem certeza que deseja remover este site?')) {
          const updated = wpSites.filter(s => s.id !== id);
          setWpSites(updated);
          localStorage.setItem('guestpost_wp_sites', JSON.stringify(updated));
      }
  };

  const handleSaveSite = () => {
      if (!editingSite || !editingSite.name || !editingSite.url || !editingSite.username || !editingSite.appPassword) {
          alert('Preencha todos os campos do site.');
          return;
      }

      // Check if updating or creating
      const isNew = !wpSites.find(s => s.id === editingSite.id);
      
      let updatedSites;
      if (isNew) {
          updatedSites = [...wpSites, editingSite];
      } else {
          updatedSites = wpSites.map(s => s.id === editingSite.id ? editingSite : s);
      }

      setWpSites(updatedSites);
      localStorage.setItem('guestpost_wp_sites', JSON.stringify(updatedSites));
      setIsEditSiteOpen(false);
      setEditingSite(null);
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
        <p className="text-slate-400">Gerencie suas credenciais de IA, Google Drive e Sites WordPress.</p>
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
                            Adicione múltiplas chaves do Google AI Studio. O sistema irá rotacionar caso uma falhe.
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
                </div>
            </div>

            <div className="h-px bg-slate-800 w-full"></div>

            {/* WORDPRESS SITES SECTION */}
            <div className="flex items-start gap-4">
                <div className="p-3 bg-slate-800 rounded-lg">
                    <Globe className="w-6 h-6 text-blue-400" />
                </div>
                <div className="flex-1 space-y-4">
                    <div className="flex justify-between items-start">
                        <div>
                            <h3 className="text-lg font-semibold text-white">Conexões WordPress</h3>
                            <p className="text-sm text-slate-400 mt-1">
                                Gerencie os sites onde os artigos serão publicados.
                            </p>
                        </div>
                        <button 
                            onClick={() => {
                                setEditingSite({ id: Date.now().toString(), name: '', url: '', username: '', appPassword: '' });
                                setIsEditSiteOpen(true);
                            }}
                            className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 transition-colors"
                        >
                            <Plus className="w-3 h-3"/> Novo Site
                        </button>
                    </div>

                    {wpSites.length > 0 ? (
                        <div className="grid grid-cols-1 gap-3">
                            {wpSites.map(site => (
                                <div key={site.id} className="bg-slate-950 border border-slate-800 rounded-lg p-4 flex justify-between items-center hover:border-blue-500/30 transition-colors group">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <div className="bg-blue-900/20 p-2 rounded text-blue-400">
                                            <Globe className="w-4 h-4" />
                                        </div>
                                        <div className="min-w-0">
                                            <h4 className="font-bold text-slate-200 truncate">{site.name}</h4>
                                            <p className="text-xs text-slate-500 truncate">{site.url}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button 
                                            onClick={() => handleEditSite(site)}
                                            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                                            title="Editar Credenciais"
                                        >
                                            <Edit className="w-4 h-4" />
                                        </button>
                                        <button 
                                            onClick={() => handleDeleteSite(site.id)}
                                            className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
                                            title="Remover Site"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center p-6 border-2 border-dashed border-slate-800 rounded-lg text-slate-500 text-sm">
                            Nenhum site conectado.
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

      {/* EDIT SITE MODAL */}
      {isEditSiteOpen && editingSite && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
                <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
                    <h3 className="font-bold text-white flex items-center gap-2">
                        <Server className="w-4 h-4 text-blue-400" /> {editingSite.name ? 'Editar Site' : 'Novo Site'}
                    </h3>
                    <button onClick={() => setIsEditSiteOpen(false)} className="text-slate-400 hover:text-white">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="p-6 space-y-4">
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase">Nome do Site</label>
                        <input 
                            value={editingSite.name}
                            onChange={e => setEditingSite({...editingSite, name: e.target.value})}
                            placeholder="Meu Blog Pessoal"
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm text-white focus:border-blue-500 outline-none"
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500 uppercase">URL do WordPress</label>
                        <div className="relative">
                            <Globe className="absolute left-3 top-3 w-4 h-4 text-slate-600" />
                            <input 
                                value={editingSite.url}
                                onChange={e => setEditingSite({...editingSite, url: e.target.value})}
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
                                    value={editingSite.username}
                                    onChange={e => setEditingSite({...editingSite, username: e.target.value})}
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
                                    value={editingSite.appPassword}
                                    onChange={e => setEditingSite({...editingSite, appPassword: e.target.value})}
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
                        onClick={handleSaveSite}
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg mt-2 transition-colors"
                    >
                        Salvar Site
                    </button>
                </div>
            </div>
          </div>
      )}
    </div>
  );
};

export default Settings;