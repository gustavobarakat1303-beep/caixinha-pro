import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, FileText, Download, Printer, Share2, Eye, LayoutPanelLeft, Coffee, Users } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { exportService } from '../services/exportService';
import { ptBR } from 'date-fns/locale';
import { format } from 'date-fns';
import { Competencia, Unit, CalculoMensal, Colaborador, Cargo, Configuracao } from '../types';

interface SimplifiedReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  competencia: Competencia;
  unit: Unit | null;
  calculos: CalculoMensal[];
  colaboradores: Colaborador[];
  cargos: Cargo[];
  config: Configuracao | null;
  totalArrecadado: number;
}

type SectorFilter = 'SALAO' | 'COZINHA' | 'BOTH';

export default function SimplifiedReportModal({
  isOpen,
  onClose,
  competencia,
  unit,
  calculos,
  colaboradores,
  cargos,
  config,
  totalArrecadado
}: SimplifiedReportModalProps) {
  const [filter, setFilter] = useState<SectorFilter>('BOTH');

  const reportDetails = useMemo(() => {
    // 1. Get proportions from config
    const percentSalao = config?.percentualPoolSalao ?? 0.8;
    const percentCozinha = config?.percentualPoolCozinha ?? 0.2;
    const totalP = percentSalao + percentCozinha;
    const propSalao = totalP > 0 ? percentSalao / totalP : 0;
    const propCozinha = totalP > 0 ? percentCozinha / totalP : 0;

    // 2. Sum points by sector exactly like Dashboard.tsx
    const totalPontosSalao = calculos.filter(c => {
      const colaba = colaboradores.find(col => col.id === c.colaboradorId);
      if (!colaba) return false;
      const cargo = cargos.find(cg => cg.id === colaba.cargoId);
      return cargo?.pool === 'SALAO';
    }).reduce((sum, c) => sum + c.totalPontos, 0);

    const totalPontosCozinha = calculos.filter(c => {
      const colaba = colaboradores.find(col => col.id === c.colaboradorId);
      if (!colaba) return false;
      const cargo = cargos.find(cg => cg.id === colaba.cargoId);
      return cargo?.pool === 'COZINHA';
    }).reduce((sum, c) => sum + c.totalPontos, 0);

    // 3. Calculate Point Values exactly like Dashboard.tsx
    const valorPontoSalao = totalPontosSalao > 0 ? (totalArrecadado * propSalao) / totalPontosSalao : 0;
    const valorPontoCozinha = totalPontosCozinha > 0 ? (totalArrecadado * propCozinha) / totalPontosCozinha : 0;

    // 4. Totals per sector for the summary
    const totalTipsSalao = totalArrecadado * propSalao;
    const totalTipsCozinha = totalArrecadado * propCozinha;

    return {
      totalTipsSalao,
      totalPointsSalao: totalPontosSalao,
      valorPontoSalao,
      totalTipsCozinha,
      totalPointsCozinha: totalPontosCozinha,
      valorPontoCozinha
    };
  }, [calculos, colaboradores, cargos, config, totalArrecadado]);

  const handleGeneratePDF = async () => {
    const sectorsLabel = filter === 'BOTH' ? 'Salão + Cozinha' : filter === 'SALAO' ? 'Somente Salão' : 'Somente Cozinha';
    
    await exportService.exportSimplifiedReportPDF({
      unitName: unit?.name || 'Sistema Caixinha',
      unitLogo: unit?.logoUrl,
      competencia: format(new Date(competencia.ano, competencia.mes - 1), 'MMMM yyyy', { locale: ptBR }),
      totalArrecadado: totalArrecadado,
      setores: sectorsLabel,
      valorPontoSalao: (filter === 'BOTH' || filter === 'SALAO') ? reportDetails.valorPontoSalao : undefined,
      valorPontoCozinha: (filter === 'BOTH' || filter === 'COZINHA') ? reportDetails.valorPontoCozinha : undefined,
      totalSalao: (filter === 'BOTH' || filter === 'SALAO') ? reportDetails.totalTipsSalao : undefined,
      totalCozinha: (filter === 'BOTH' || filter === 'COZINHA') ? reportDetails.totalTipsCozinha : undefined,
    });
  };

  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-zinc-950/60 backdrop-blur-sm"
      />
      
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-2xl bg-white rounded-[40px] shadow-2xl overflow-hidden ring-1 ring-black/5"
      >
        {/* Header */}
        <div className="px-10 pt-10 pb-6 flex items-center justify-between border-b border-zinc-100">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 bg-primary text-white rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-zinc-900 tracking-tight">Relatório para Funcionários</h2>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1">Resumo simplificado de gorjetas</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="h-12 w-12 rounded-2xl flex items-center justify-center text-zinc-400 hover:bg-zinc-50 hover:text-zinc-900 transition-all active:scale-95 border border-transparent hover:border-border/40"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-10 space-y-10 max-h-[70vh] overflow-y-auto custom-scrollbar">
          {/* Filters */}
          <div className="flex items-center gap-2 p-1.5 bg-zinc-50 border border-zinc-100 rounded-[22px]">
            <button
              onClick={() => setFilter('SALAO')}
              className={`flex-1 h-12 flex items-center justify-center gap-3 rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all ${filter === 'SALAO' ? 'bg-white text-primary shadow-lg shadow-muted/10 border border-border/40' : 'text-zinc-400 hover:text-zinc-600'}`}
            >
              <Users className="h-4 w-4" /> Somente Salão
            </button>
            <button
              onClick={() => setFilter('COZINHA')}
              className={`flex-1 h-12 flex items-center justify-center gap-3 rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all ${filter === 'COZINHA' ? 'bg-white text-primary shadow-lg shadow-muted/10 border border-border/40' : 'text-zinc-400 hover:text-zinc-600'}`}
            >
              <Coffee className="h-4 w-4" /> Somente Cozinha
            </button>
            <button
              onClick={() => setFilter('BOTH')}
              className={`flex-1 h-12 flex items-center justify-center gap-3 rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all ${filter === 'BOTH' ? 'bg-white text-primary shadow-lg shadow-muted/10 border border-border/40' : 'text-zinc-400 hover:text-zinc-600'}`}
            >
              <LayoutPanelLeft className="h-4 w-4" /> Ambos
            </button>
          </div>

          {/* Report Preview */}
          <div id="printable-report" className="space-y-10 border border-zinc-100 rounded-[32px] p-10 bg-white shadow-sm overflow-hidden relative group">
             <div className="absolute top-0 inset-x-0 h-1.5 bg-primary/20" />
             
             <div className="text-center space-y-3">
                <h3 className="text-2xl font-bold text-zinc-900 tracking-tight uppercase">Relatório Mensal de Gorjetas</h3>
                <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest leading-none">{unit?.name}</p>
             </div>

             <div className="grid grid-cols-2 gap-8 py-8 border-y border-zinc-100">
                <div className="space-y-1">
                   <p className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest">Competência</p>
                   <p className="font-bold text-zinc-900 capitalize tracking-tight">{format(new Date(competencia.ano, competencia.mes - 1), 'MMMM yyyy', { locale: ptBR })}</p>
                </div>
                <div className="space-y-1">
                   <p className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest">Setores</p>
                   <p className="font-bold text-zinc-900 tracking-tight">{filter === 'BOTH' ? 'Salão + Cozinha' : filter === 'SALAO' ? 'Salão' : 'Cozinha'}</p>
                </div>
                {filter === 'BOTH' && (
                  <div className="space-y-1">
                     <p className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest">Total Arrecadado</p>
                     <p className="font-mono font-bold text-zinc-900 tracking-tighter">R$ {totalArrecadado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  </div>
                )}
                <div className="space-y-1">
                   <p className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest">Gerado em</p>
                   <p className="font-bold text-zinc-900 tracking-tight">{format(new Date(), 'dd/MM/yyyy')}</p>
                </div>
             </div>

             <div className="space-y-6">
                <h4 className="text-[10px] font-bold text-zinc-900 uppercase tracking-widest text-center">Resumo de Valores</h4>
                
                <div className="space-y-4">
                  {(filter === 'BOTH' || filter === 'SALAO') && (
                    <div className="p-6 bg-zinc-50 rounded-2xl border border-zinc-200/60 flex items-center justify-between shadow-sm">
                      <div>
                        <p className="text-[10px] font-bold text-zinc-400 uppercase mb-1 tracking-widest">Setor Salão</p>
                        <p className="text-sm font-bold text-zinc-700 tracking-tight">Valor do Ponto</p>
                      </div>
                      <p className="text-2xl font-bold text-primary font-mono tracking-tighter">R$ {reportDetails.valorPontoSalao.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</p>
                    </div>
                  )}

                  {(filter === 'BOTH' || filter === 'COZINHA') && (
                    <div className="p-6 bg-zinc-50 rounded-2xl border border-zinc-200/60 flex items-center justify-between shadow-sm">
                      <div>
                        <p className="text-[10px] font-bold text-zinc-400 uppercase mb-1 tracking-widest">Setor Cozinha</p>
                        <p className="text-sm font-bold text-zinc-700 tracking-tight">Valor do Ponto</p>
                      </div>
                      <p className="text-2xl font-bold text-primary font-mono tracking-tighter">R$ {reportDetails.valorPontoCozinha.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</p>
                    </div>
                  )}
                </div>
             </div>

             <div className="pt-8 text-center border-t border-zinc-100">
                <p className="text-[10px] font-bold text-zinc-400 italic leading-relaxed px-4">
                  Relatório simplificado para conferência dos funcionários. Os valores seguem os cálculos oficiais já realizados pelo sistema.
                </p>
             </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-10 py-8 bg-zinc-50 border-t border-zinc-100 flex items-center gap-4">
           <Button
             onClick={handleGeneratePDF}
             className="flex-1 h-14 bg-primary text-white rounded-2xl font-bold gap-3 shadow-xl shadow-primary/20 border-none transition-all active:scale-95 uppercase text-[10px] tracking-widest"
           >
             <Download className="h-5 w-5" /> Baixar PDF
           </Button>
           <Button
             variant="outline"
             onClick={handlePrint}
             className="h-14 px-6 rounded-2xl border-zinc-200 hover:bg-white text-zinc-600 gap-3 font-bold uppercase text-[10px] tracking-widest"
           >
             <Printer className="h-5 w-5" /> Imprimir
           </Button>
           <Button
             variant="outline"
             className="h-14 px-6 rounded-2xl border-zinc-200 hover:bg-white text-zinc-600 font-bold"
           >
             <Share2 className="h-5 w-5" />
           </Button>
        </div>
      </motion.div>
    </div>
  );
}
