import React, { useEffect, useState } from 'react';
import { cn } from '../lib/utils';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Auditoria } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { History, Search, Filter, ArrowRight, User, Terminal, Calendar as CalendarIcon, Info, Zap } from 'lucide-react';
import { Input } from './ui/input';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';

export default function AuditoriaComponent() {
  const [logs, setLogs] = useState<Auditoria[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'auditoria'), orderBy('timestamp', 'desc'), limit(100));
    return onSnapshot(q, (snapshot) => {
      setLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Auditoria)));
    }, (error) => {
      console.error("Auditoria listener error:", error);
      if (error.code !== 'permission-denied') {
        // Only show toast if it's not a permission error (which we handle by UI)
      }
    });
  }, []);

  const filteredLogs = logs.filter(log => 
    log.modulo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.acao.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.usuario.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.entidade.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getModuloColor = (modulo: string) => {
    switch (modulo.toUpperCase()) {
      case 'CARGOS': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'COLABORADORES': return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'CONFIG': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'FECHAMENTO': return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'CÁLCULO': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      default: return 'bg-zinc-50 text-zinc-700 border-zinc-200';
    }
  };

  return (
    <div className="space-y-8 pb-10">
      {/* Header */}
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-1">
        <div className="flex items-center gap-6">
          <div className="h-16 w-16 rounded-[22px] bg-primary flex items-center justify-center text-white shadow-xl shadow-primary/30 rotate-2">
            <History className="h-8 w-8 -rotate-2" />
          </div>
          <div className="space-y-1">
            <motion.h1 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-3xl font-bold tracking-tight text-foreground"
            >
              Trilha de Auditoria
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-zinc-500 font-semibold text-sm tracking-wide"
            >
              Histórico de alterações e conformidade do sistema.
            </motion.p>
          </div>
        </div>
      </section>

      {/* Search Bar */}
      <Card className="border-border/40 shadow-xl shadow-muted/5 rounded-[32px] overflow-hidden bg-white/80 backdrop-blur-xl ring-1 ring-border/5">
        <div className="p-6">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400 group-focus-within:text-primary transition-colors" />
            <Input 
              placeholder="Localizar eventos por módulo, ação ou usuário..." 
              className="pl-12 h-14 bg-muted/20 border-border/40 rounded-2xl focus:ring-primary focus:border-primary transition-all font-bold placeholder:text-zinc-400 text-foreground"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </Card>

      {/* Table Section */}
      <Card className="border-border/40 shadow-xl shadow-muted/5 rounded-[40px] overflow-hidden bg-white ring-1 ring-border/5">
        <div className="overflow-x-auto">
          <Table className="min-w-[900px]">
            <TableHeader className="bg-muted/30">
              <TableRow className="border-b border-border/40">
                <TableHead className="py-6 px-8 text-[11px] font-bold uppercase tracking-widest text-zinc-500 w-[180px]">Timestamp</TableHead>
                <TableHead className="py-6 px-8 text-[11px] font-bold uppercase tracking-widest text-zinc-500">Módulo</TableHead>
                <TableHead className="py-6 px-8 text-[11px] font-bold uppercase tracking-widest text-zinc-500">Ação</TableHead>
                <TableHead className="py-6 px-8 text-[11px] font-bold uppercase tracking-widest text-zinc-500">Operador</TableHead>
                <TableHead className="py-6 px-8 text-[11px] font-bold uppercase tracking-widest text-zinc-500 text-right">Contexto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLogs.map((log, idx) => (
                <motion.tr 
                  key={log.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.01 }}
                  className="group border-b border-border/40 last:border-0 hover:bg-muted/10 transition-colors"
                >
                  <TableCell className="py-6 px-8">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-xl bg-muted flex items-center justify-center text-zinc-400 group-hover:bg-primary group-hover:text-white transition-all shadow-sm">
                        <CalendarIcon className="h-4 w-4" />
                      </div>
                      <span className="font-mono text-[11px] font-bold text-zinc-500 whitespace-nowrap tracking-tighter">
                        {log.timestamp ? format(new Date(log.timestamp), 'dd/MM HH:mm:ss') : 'N/A'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="py-6 px-8">
                    <Badge variant="outline" className={cn(
                      "rounded-xl px-3 py-1 text-[9px] font-bold uppercase border border-border/40",
                      getModuloColor(log.modulo)
                    )}>
                      {log.modulo}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-6 px-8">
                    <div className="flex items-center gap-3">
                      <Terminal className="h-4 w-4 text-zinc-300 group-hover:text-primary transition-colors" />
                      <span className="font-bold text-zinc-900 text-sm tracking-tight uppercase">{log.acao}</span>
                    </div>
                  </TableCell>
                  <TableCell className="py-6 px-8">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-zinc-100 border border-border/40 flex items-center justify-center shadow-sm overflow-hidden uppercase font-bold text-[10px] text-zinc-400">
                         {log.usuario.charAt(0)}
                      </div>
                      <span className="text-zinc-600 font-bold text-[11px] uppercase tracking-widest">{log.usuario.split('@')[0]}</span>
                    </div>
                  </TableCell>
                  <TableCell className="py-6 px-8 text-right">
                    <div className="flex flex-col items-end gap-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-zinc-300 font-bold tracking-tighter truncate max-w-[120px]">{log.entidadeId}</span>
                        <Badge variant="ghost" className="h-6 px-3 bg-zinc-100 text-zinc-500 text-[10px] font-bold uppercase hover:bg-muted transition-colors rounded-lg tracking-widest border border-border/10">
                          {log.entidade}
                        </Badge>
                      </div>
                      {log.antes && log.depois && (
                        <div className="flex items-center gap-2 text-[9px] font-bold text-primary bg-primary/5 px-3 py-1 rounded-full border border-primary/10 tracking-widest">
                          <Zap className="h-3 w-3" />
                           ALTERAÇÕES DETECTADAS
                        </div>
                      )}
                    </div>
                  </TableCell>
                </motion.tr>
              ))}
              {filteredLogs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-32">
                    <div className="flex flex-col items-center justify-center gap-4 text-zinc-300">
                      <div className="h-24 w-24 rounded-[32px] bg-muted/30 flex items-center justify-center">
                        <Terminal className="h-10 w-10" />
                      </div>
                      <p className="font-bold uppercase text-[10px] tracking-widest">
                        {searchTerm ? 'Nenhum resultado para o filtro' : 'Sem registros na trilha'}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
