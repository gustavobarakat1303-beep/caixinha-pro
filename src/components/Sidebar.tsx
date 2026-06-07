import React from 'react';
import { 
  LayoutDashboard, 
  Users, 
  Briefcase, 
  CalendarDays, 
  Settings as SettingsIcon,
  LogOut,
  Menu,
  X,
  History,
  Lock,
  ChevronRight,
  ShieldCheck,
  Calculator
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from './ui/button';
import { 
  Tooltip, 
  TooltipTrigger, 
  TooltipContent 
} from './ui/tooltip';

export type Module = 'dashboard' | 'colaboradores' | 'cargos' | 'lancamentos' | 'fechamento' | 'auditoria' | 'settings' | 'usuarios' | 'gerenciamento_pontos';

interface SidebarProps {
  activeModule: Module;
  setActiveModule: (module: Module) => void;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (isOpen: boolean) => void;
  user: any;
  profile: any;
  isAdmin: boolean;
  isManagement: boolean;
  logout: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  activeModule,
  setActiveModule,
  isSidebarOpen,
  setIsSidebarOpen,
  user,
  profile,
  isAdmin,
  isManagement,
  logout
}) => {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'gerenciamento_pontos', label: 'Gestão de Pontos', icon: Calculator, permission: isManagement },
    { id: 'colaboradores', label: 'Colaboradores', icon: Users, permission: isManagement },
    { id: 'cargos', label: 'Cargos', icon: Briefcase, permission: isManagement },
    { id: 'lancamentos', label: 'Lançamentos', icon: CalendarDays, permission: isManagement },
    { id: 'fechamento', label: 'Fechamento', icon: Lock, permission: isManagement },
    { id: 'auditoria', label: 'Auditoria', icon: History, permission: isManagement },
    { id: 'usuarios', label: 'Usuários', icon: ShieldCheck, permission: isAdmin },
    { id: 'settings', label: 'Configurações', icon: SettingsIcon, permission: isAdmin },
  ].filter(item => item.permission !== false && (item.permission === true || !('permission' in item)));

  return (
    <>
      {/* Sidebar Overlay for Mobile */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-zinc-900/60 backdrop-blur-sm z-40 lg:hidden" 
            onClick={() => setIsSidebarOpen(false)}
            id="sidebar-overlay"
          />
        )}
      </AnimatePresence>

      <aside 
        id="app-sidebar"
        className={`
          bg-sidebar border-r border-sidebar-border transition-all duration-500 ease-in-out flex flex-col
          fixed inset-y-0 left-0 z-50 lg:relative
          ${isSidebarOpen ? 'w-72 translate-x-0' : 'w-72 -translate-x-full lg:w-20 lg:translate-x-0'}
          shadow-[2px_0_12px_rgba(0,0,0,0.015)]
        `}
      >
        <div className="p-8 lg:p-9 flex items-center justify-between" id="sidebar-header">
          <div 
            className={`flex items-center gap-4 transition-all duration-500 ${!isSidebarOpen && 'lg:opacity-0 lg:scale-90'}`}
            id="sidebar-logo-container"
          >
            <div className="h-11 w-11 bg-primary rounded-xl flex items-center justify-center text-white shadow-xl shadow-primary/20 shrink-0 relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <Briefcase className="h-5 w-5 relative z-10" />
            </div>
            <div className="flex flex-col">
              <span className="font-black tracking-tighter text-2xl leading-none text-zinc-900 italic">Caixinha<span className="text-primary italic">Pro</span></span>
              <div className="flex items-center gap-2 mt-1.5">
                <div className="h-1 w-1 bg-primary rounded-full group-hover:scale-150 transition-transform" />
                <span className="text-[8px] font-bold uppercase tracking-[0.4em] text-zinc-400 leading-none">Management System</span>
              </div>
            </div>
          </div>
          
          <Button 
            id="sidebar-toggle-btn"
            variant="ghost" 
            size="icon" 
            onClick={() => setIsSidebarOpen(false)}
            className="lg:hidden flex rounded-lg bg-muted border border-border/40 hover:bg-muted/80 transition-all p-2"
          >
            <X className="h-5 w-5 text-foreground" />
          </Button>

          <Button 
            id="sidebar-desktop-toggle"
            variant="ghost" 
            size="icon" 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="hidden lg:flex rounded-lg bg-muted border border-border/40 hover:bg-muted/80 transition-all"
          >
            {isSidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>
        </div>

        <nav className="flex-1 px-5 py-4 space-y-1.5 overflow-y-auto custom-scrollbar" id="sidebar-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeModule === item.id;
            const navButton = (
              <button
                id={`sidebar-item-${item.id}`}
                onClick={() => {
                  setActiveModule(item.id as Module);
                  if (window.innerWidth < 1024) setIsSidebarOpen(false);
                }}
                className={`
                  w-full flex items-center gap-3.5 px-4 py-3 rounded-xl transition-all group relative border border-transparent
                  ${isActive 
                    ? 'bg-zinc-900 text-white shadow-xl shadow-zinc-950/20' 
                    : 'text-zinc-500 hover:bg-zinc-100/80 hover:text-foreground font-bold'}
                `}
              >
                <div className={`flex items-center gap-3.5 w-full ${!isSidebarOpen && 'lg:justify-center'}`}>
                  <div className={`transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-105'}`}>
                    <Icon className={`h-4.5 w-4.5 shrink-0 ${isActive ? 'text-accent' : ''}`} />
                  </div>
                  <span className={`text-[13px] font-bold tracking-tight whitespace-nowrap transition-all duration-500 ${!isSidebarOpen && 'lg:opacity-0 lg:hidden'}`}>
                    {item.label}
                  </span>
                </div>
                {isActive && isSidebarOpen && (
                  <motion.div layoutId="active-indicator" className="ml-auto opacity-30">
                    <ChevronRight className="h-3 w-3" />
                  </motion.div>
                )}
              </button>
            );

            if (isSidebarOpen) {
              return <React.Fragment key={item.id}>{navButton}</React.Fragment>;
            }

            return (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>
                  {navButton}
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={12} className="ml-2 bg-primary text-primary-foreground font-bold text-[10px] py-1">
                  {item.label}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </nav>

        <div className="p-8 mt-auto" id="sidebar-footer">
          <div className={`flex items-center gap-4 transition-all ${isSidebarOpen ? 'bg-zinc-50 p-4 rounded-xl border border-sidebar-border shadow-sm' : 'lg:justify-center'}`}>
            <div className="relative shrink-0 group">
              <img src={user.photoURL || ''} className="h-9 w-9 rounded-lg border border-white shadow-sm object-cover group-hover:scale-105 transition-all" alt="Avatar" />
              <div className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 bg-emerald-500 border-2 border-white rounded-full" />
            </div>
            <div className={`flex-1 min-w-0 transition-all duration-500 ${!isSidebarOpen && 'lg:opacity-0 lg:hidden'}`}>
              <p className="text-[13px] font-black text-foreground truncate tracking-tight">{user.displayName}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-md ${isManagement ? 'bg-primary text-accent' : 'bg-secondary text-foreground'}`}>
                  {profile?.role || (isAdmin ? 'ADMINISTRADOR' : 'CONSULTA')}
                </span>
              </div>
            </div>
            {isSidebarOpen && (
              <button 
                id="logout-btn"
                onClick={logout} 
                className="text-zinc-400 hover:text-destructive p-2 rounded-lg transition-all"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
          {isSidebarOpen && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-6 text-center pt-6 border-t border-sidebar-border/60"
            >
              <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-[0.2em] whitespace-nowrap">
                Desenvolvido por <span className="text-zinc-900 font-bold">Gustavo Barakat</span>
              </p>
            </motion.div>
          )}
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
