import React, { useState } from 'react';
import { AppMode } from '../types';
import { PenTool, History, Settings, Zap, Menu, X } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  currentMode: AppMode;
  setMode: (mode: AppMode) => void;
  isFullWidth?: boolean;
}

const Layout: React.FC<LayoutProps> = ({ children, currentMode, setMode, isFullWidth = false }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleModeChange = (mode: AppMode) => {
    setMode(mode);
    setIsSidebarOpen(false); // Close sidebar on selection
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200 font-sans overflow-hidden relative">
      
      {/* Mobile/Desktop Header Trigger - Animating Position */}
      <div 
        className={`absolute top-4 z-50 transition-all duration-300 ease-in-out ${
            isSidebarOpen ? 'left-60' : 'left-4'
        }`}
      >
        <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className={`p-2 rounded-lg transition-all ${
                isSidebarOpen 
                ? 'text-slate-400 hover:text-white hover:bg-slate-800' // Clean look when open (inside sidebar)
                : 'bg-slate-900/50 hover:bg-slate-800 backdrop-blur border border-slate-700 text-slate-300 hover:text-white shadow-lg' // Button look when closed
            }`}
        >
            {isSidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Sidebar - Drawer Style */}
      <aside 
        className={`
            fixed inset-y-0 left-0 z-40 w-72 bg-slate-900 border-r border-slate-800 transform transition-transform duration-300 ease-in-out shadow-2xl
            ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="p-6 flex items-center gap-3 border-b border-slate-800 mt-12 md:mt-0">
          <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2 rounded-lg">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
            GuestPost AI
          </h1>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <button
            onClick={() => handleModeChange(AppMode.SINGLE)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
              currentMode === AppMode.SINGLE
                ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-600/20'
                : 'hover:bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <PenTool className="w-5 h-5" />
            <span className="font-medium">Criar Post</span>
          </button>

          <button
            onClick={() => handleModeChange(AppMode.HISTORY)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
              currentMode === AppMode.HISTORY
                ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-600/20'
                : 'hover:bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <History className="w-5 h-5" />
            <span className="font-medium">Histórico</span>
          </button>
        </nav>

        <div className="p-4 border-t border-slate-800">
          <button 
            onClick={() => handleModeChange(AppMode.SETTINGS)}
            className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-all text-sm ${
                currentMode === AppMode.SETTINGS
                ? 'bg-slate-800 text-white'
                : 'text-slate-500 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>Configurações</span>
          </button>
        </div>
      </aside>

      {/* Overlay to close sidebar on click outside */}
      {isSidebarOpen && (
        <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30"
            onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className={`flex-1 relative flex flex-col w-full ${isFullWidth ? 'overflow-hidden p-0' : 'overflow-auto'}`}>
         {/* If Full Width, render directly without container constraints */}
         {isFullWidth ? (
            <div className="w-full h-full flex flex-col">
                {children}
            </div>
         ) : (
            <div className="max-w-5xl mx-auto w-full flex-1 flex flex-col">
                {children}
            </div>
         )}
      </main>
    </div>
  );
};

export default Layout;