import React from 'react';
import { motion } from 'motion/react';
import { 
  Bell, 
  Search, 
  Menu, 
  Briefcase,
  ChevronDown,
  User,
  Settings as SettingsIcon,
  LogOut
} from 'lucide-react';
import { Button } from './ui/button';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from './ui/dropdown-menu';
import { Module } from './Sidebar';

interface HeaderProps {
  activeModule: Module;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (isOpen: boolean) => void;
  user: any;
  isAdmin: boolean;
  logout: () => void;
}

const Header: React.FC<HeaderProps> = ({
  activeModule,
  setIsSidebarOpen,
  user,
  isAdmin,
  logout
}) => {
  const moduleLabels: Record<Module, string> = {
    dashboard: 'Dashboard Geral',
    colaboradores: 'Gestão de Colaboradores',
    cargos: 'Funções & Cargos',
    lancamentos: 'Lançamentos & Rateios',
    fechamento: 'Fechamento de Ciclo',
    auditoria: 'Painel de Auditoria',
    settings: 'Configurações do Sistema',
    usuarios: 'Gestão de Usuários',
    gerenciamento_pontos: 'Gestão de Pontos'
  };

  return (
    <header className="h-20 lg:h-24 bg-white/80 backdrop-blur-xl border-b border-sidebar-border sticky top-0 z-40 px-6 lg:px-12 flex items-center justify-between transition-all duration-500">
      <div className="flex items-center gap-6 lg:gap-10">
        {/* Mobile Menu Toggle */}
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => setIsSidebarOpen(true)} 
          className="lg:hidden rounded-2xl bg-muted/50 border border-border/40 hover:bg-muted transition-all"
        >
          <Menu className="h-5 w-5 text-foreground" />
        </Button>

        <div className="flex flex-col">
          <motion.div 
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            key={activeModule}
            className="flex flex-col"
          >
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/40 leading-none mb-1.5">
              Módulo Ativo
            </span>
            <h1 className="text-xl lg:text-2xl font-black tracking-tighter text-foreground">
              {moduleLabels[activeModule]}
            </h1>
          </motion.div>
        </div>
      </div>

      <div className="flex items-center gap-3 lg:gap-6">
        <div className="hidden md:flex items-center gap-2 bg-muted/30 border border-border/40 rounded-2xl px-4 py-2 ring-1 ring-border/5 focus-within:ring-primary/20 focus-within:bg-white transition-all group">
          <Search className="h-4 w-4 text-muted-foreground/40 group-focus-within:text-primary transition-colors" />
          <input 
            type="text" 
            placeholder="Pesquisar no sistema..." 
            className="bg-transparent border-none text-xs font-bold focus:outline-none placeholder:text-muted-foreground/30 text-foreground w-40 lg:w-64"
          />
        </div>

        <div className="h-10 w-[1px] bg-border/40 hidden lg:block mx-2" />

        <div className="flex items-center gap-2">
           <Button variant="ghost" size="icon" className="hidden sm:flex rounded-xl text-muted-foreground/60 hover:text-primary hover:bg-primary/5 transition-all relative">
            <Bell className="h-5 w-5" />
            <span className="absolute top-2.5 right-2.5 h-2 w-2 bg-primary border-2 border-white rounded-full" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="outline"
                className="flex items-center gap-3 pl-2 pr-4 h-auto py-1.5 rounded-2xl bg-white border-border/40 hover:border-primary/20 hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 group cursor-pointer"
              >
                <div className="relative shrink-0">
                  <img src={user.photoURL || ''} className="h-8 lg:h-9 w-8 lg:w-9 rounded-xl object-cover border border-muted ring-1 ring-border/5 group-hover:scale-105 transition-transform" alt="User" />
                  <div className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 bg-emerald-500 border-2 border-white rounded-full" />
                </div>
                <div className="hidden lg:flex flex-col items-start text-left">
                  <span className="text-[11px] font-black tracking-tight text-foreground leading-none">{user.displayName}</span>
                  <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">{isAdmin ? 'Administrador' : 'Usuário'}</span>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary transition-all group-hover:translate-y-0.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 rounded-[24px] border-border/40 shadow-2xl p-2 bg-white/95 backdrop-blur-xl -translate-x-4">
              <DropdownMenuLabel className="px-4 py-3">
                <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Minha Conta</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-border/40 mx-2" />
              <DropdownMenuItem className="rounded-xl py-3 px-4 focus:bg-primary/5 focus:text-primary group cursor-pointer transition-colors">
                <User className="h-4 w-4 mr-3 text-muted-foreground group-focus:text-primary transition-colors" />
                <span className="text-xs font-black">Meu Perfil</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="rounded-xl py-3 px-4 focus:bg-primary/5 focus:text-primary group cursor-pointer transition-colors">
                <SettingsIcon className="h-4 w-4 mr-3 text-muted-foreground group-focus:text-primary transition-colors" />
                <span className="text-xs font-black">Configurações</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-border/40 mx-2" />
              <DropdownMenuItem 
                onClick={logout}
                className="rounded-xl py-3 px-4 focus:bg-destructive/5 focus:text-destructive group cursor-pointer transition-colors"
              >
                <LogOut className="h-4 w-4 mr-3 text-muted-foreground group-focus:text-destructive transition-colors" />
                <span className="text-xs font-black">Sair do Sistema</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
};

export default Header;
