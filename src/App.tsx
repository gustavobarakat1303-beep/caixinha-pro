import React, { useState } from 'react';
import { useAuth } from './contexts/AuthContext';
import { AnimatePresence, motion } from 'motion/react';
import Sidebar, { Module } from './components/Sidebar';

import Dashboard from './components/Dashboard';
import Colaboradores from './components/Colaboradores';
import Cargos from './components/Cargos';
import Lancamentos from './components/Lancamentos';
import Settings from './components/Settings';
import Auditoria from './components/Auditoria';
import Fechamento from './components/Fechamento';
import Usuarios from './components/Usuarios';
import GerenciamentoPontos from './components/GerenciamentoPontos';
import Header from './components/Header';
import { Toaster } from './components/ui/sonner';
import { Button } from './components/ui/button';
import { FaltasConfirmationModal } from './components/FaltasConfirmationModal';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from './lib/firebase';
import { 
  TooltipProvider 
} from './components/ui/tooltip';
import {
  Briefcase
} from 'lucide-react';

import { checkAndInitializeNewMonth } from './services/competenciaService';
import { toast } from 'sonner';

function App() {
  const { user, profile, loading, signIn, logout, isAdmin, isManagement } = useAuth();
  const [activeModule, setActiveModule] = useState<Module>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 1024);
  const [showFaltasModal, setShowFaltasModal] = useState(false);
  const [checkingFaltas, setCheckingFaltas] = useState(true);

  // Check for new month initialization
  React.useEffect(() => {
    if (!user || !profile || !isManagement || profile.unitId === 'ALL') return;

    const initNewMonth = async () => {
      try {
        const { created } = await checkAndInitializeNewMonth(profile.unitId);
        if (created) {
          toast.success('Novo mês criado com sucesso com base na configuração do mês anterior. Os lançamentos começaram zerados.');
        }
      } catch (error) {
        console.error('Error auto-initializing month:', error);
      }
    };

    initNewMonth();
  }, [user, profile, isManagement]);

  // Check for daily confirmation
  React.useEffect(() => {
    if (!user || !profile || !isManagement) {
      setCheckingFaltas(false);
      return;
    }

    const checkConfirmation = async () => {
      setCheckingFaltas(true);
      try {
        const today = new Date().toISOString().split('T')[0];
        const q = query(
          collection(db, 'confirmacoes_faltas'),
          where('userId', '==', profile.uid),
          where('date', '==', today),
          limit(1)
        );
        const snap = await getDocs(q);
        if (snap.empty) {
          setShowFaltasModal(true);
        }
      } catch (error) {
        console.error('Error checking faltas confirmation:', error);
      } finally {
        setCheckingFaltas(false);
      }
    };

    checkConfirmation();
  }, [user, profile, isManagement]);

  // Safeguard active module against role changes
  React.useEffect(() => {
    const isAdminOnly = [
      'colaboradores', 
      'cargos', 
      'lancamentos', 
      'fechamento', 
      'auditoria', 
      'usuarios', 
      'settings',
      'gerenciamento_pontos'
    ].includes(activeModule);

    if (isAdminOnly && !isManagement && !loading) {
      setActiveModule('dashboard');
    }
  }, [isManagement, activeModule, loading]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm bg-white shadow-[0_32px_64px_-12px_rgba(0,0,0,0.1)] rounded-[40px] overflow-hidden border border-border"
        >
          <div className="bg-primary p-12 text-white text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-primary/80" />
            <div className="relative z-10 flex flex-col items-center">
              <motion.div 
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", damping: 12 }}
                className="h-16 w-16 bg-white/10 backdrop-blur-xl rounded-2xl flex items-center justify-center mb-6 border border-white/20"
              >
                <Briefcase className="h-8 w-8 text-white" />
              </motion.div>
              <h1 className="text-4xl text-white font-bold italic tracking-tighter">Caixinha<span className="text-white/60">Pro</span></h1>
              <div className="h-0.5 w-8 bg-white/20 my-4 rounded-full" />
              <p className="text-white/40 text-[9px] font-bold uppercase tracking-[0.4em]">Management System</p>
            </div>
          </div>
          <div className="p-10 space-y-8">
            <div className="space-y-3 text-center">
              <h2 className="text-3xl font-bold text-zinc-900 tracking-tight">Boas-vindas</h2>
              <p className="text-zinc-400 font-semibold text-sm leading-relaxed px-2">
                Plataforma corporativa para gestão transparente e automatizada de gorjetas.
              </p>
            </div>
            <Button onClick={signIn} className="w-full h-16 bg-zinc-900 hover:bg-zinc-800 text-white font-bold rounded-2xl gap-4 shadow-2xl shadow-zinc-950/20 transition-all active:scale-95 text-lg border-none uppercase tracking-widest">
              <img src="https://www.google.com/favicon.ico" className="h-5 w-5 grayscale invert" alt="Google" />
              Entrar agora
            </Button>
            <p className="text-center text-[10px] text-zinc-300 font-bold uppercase tracking-[0.2em] leading-none">
              Pé de Manga • Hub Corporativo
            </p>
            <div className="pt-4 border-t border-zinc-50 text-center">
              <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-[0.2em] whitespace-nowrap">
                Desenvolvido por <span className="text-zinc-900 font-bold">Gustavo Barakat</span>
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  const ActiveComponent = {
    dashboard: Dashboard,
    colaboradores: Colaboradores,
    cargos: Cargos,
    lancamentos: Lancamentos,
    fechamento: Fechamento,
    auditoria: Auditoria,
    usuarios: Usuarios,
    settings: Settings,
    gerenciamento_pontos: GerenciamentoPontos
  }[activeModule];

  return (
    <TooltipProvider>
      <div className="h-screen bg-zinc-50 flex flex-col lg:flex-row font-sans text-zinc-900 selection:bg-zinc-900 selection:text-white overflow-hidden">
        <Toaster position="top-right" expand={false} richColors />
        
        <Sidebar 
          activeModule={activeModule}
          setActiveModule={setActiveModule}
          isSidebarOpen={isSidebarOpen}
          setIsSidebarOpen={setIsSidebarOpen}
          user={user}
          profile={profile}
          isAdmin={isAdmin}
          isManagement={isManagement}
          logout={logout}
        />

        {isManagement && profile && (
          <FaltasConfirmationModal 
            isOpen={showFaltasModal}
            profile={profile}
            onConfirm={() => setShowFaltasModal(false)}
            onGoToLancamentos={() => {
              setActiveModule('lancamentos');
              setShowFaltasModal(false);
            }}
          />
        )}

        <div className="flex-1 flex flex-col min-w-0">
          <Header 
            activeModule={activeModule}
            isSidebarOpen={isSidebarOpen}
            setIsSidebarOpen={setIsSidebarOpen}
            user={user}
            isAdmin={isAdmin}
            logout={logout}
          />

          {/* Main Content */}
          <main className="flex-1 overflow-x-hidden overflow-y-auto bg-zinc-50/50 p-6 lg:p-12 relative custom-scrollbar">
            <div className="max-w-[1600px] mx-auto min-h-full" id="main-content-container">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeModule}
                  initial={{ opacity: 0, scale: 0.99, y: 10, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, scale: 0.99, y: -10, filter: 'blur(4px)' }}
                  transition={{ 
                    duration: 0.4, 
                    ease: [0.16, 1, 0.3, 1] // Custom ease-out cubic
                  }}
                  className="h-full"
                >
                  <ActiveComponent />
                </motion.div>
              </AnimatePresence>
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}

export default App;
