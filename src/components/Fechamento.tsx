import React, { useEffect, useMemo, useState } from 'react';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { collection, onSnapshot, query, where, updateDoc, doc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Competencia, ArrecadacaoDiaria, PresencaDiaria, CalculoMensal, Colaborador, Unit, Cargo, Configuracao } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { CheckCircle2, XCircle, Lock, Unlock, AlertTriangle, FileCheck, Download, Calendar as CalendarIcon, Info, Loader2, History, FileSpreadsheet, FileText, ShieldCheck, Zap, Users } from 'lucide-react';
import { toast } from 'sonner';
import { logAudit } from '../services/calculationService';
import { exportService } from '../services/exportService';
import { format, eachDayOfInterval, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import { Badge } from './ui/badge';
import SimplifiedReportModal from './SimplifiedReportModal';

export default function Fechamento() {
  const { profile } = useAuth();
  const [competencias, setCompetencias] = useState<Competencia[]>([]);
  const [selectedCompId, setSelectedCompId] = useState<string>('');
  const [arrecadacoes, setArrecadacoes] = useState<ArrecadacaoDiaria[]>([]);
  const [presencas, setPresencas] = useState<PresencaDiaria[]>([]);
  const [calculos, setCalculos] = useState<CalculoMensal[]>([]);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [unit, setUnit] = useState<Unit | null>(null);
  const [config, setConfig] = useState<Configuracao | null>(null);
  const [loading, setLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState<string | null>(null);
  const [expandedDetail, setExpandedDetail] = useState<string | null>(null);
  const [showSimplifiedReport, setShowSimplifiedReport] = useState(false);

  useEffect(() => {
    let q = query(collection(db, 'competencias'));
    if (profile?.unitId && profile.unitId !== 'ALL') {
      q = query(collection(db, 'competencias'), where('unitId', '==', profile.unitId));
    }

    return onSnapshot(q, (snapshot) => {
      const comps = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Competencia));
      setCompetencias(comps);
      setSelectedCompId(currentSelectedCompId => {
        if (currentSelectedCompId && comps.some(comp => comp.id === currentSelectedCompId)) {
          return currentSelectedCompId;
        }
        return comps[0]?.id ?? '';
      });
    });
  }, [profile?.unitId]);

  useEffect(() => {
    return onSnapshot(collection(db, 'cargos'), (snapshot) => {
      setCargos(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Cargo)));
    });
  }, []);

  const comp = competencias.find(c => c.id === selectedCompId);

  useEffect(() => {
    if (!selectedCompId || !comp) return;

    const unsubArrec = onSnapshot(query(collection(db, 'arrecadacoes'), where('competenciaId', '==', selectedCompId)), (snap) => {
      setArrecadacoes(snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }) as ArrecadacaoDiaria));
    });

    const unsubPres = onSnapshot(query(collection(db, 'presencas'), where('competenciaId', '==', selectedCompId)), (snap) => {
      setPresencas(snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }) as PresencaDiaria));
    });

    const unsubCalc = onSnapshot(query(collection(db, 'calculos'), where('competenciaId', '==', selectedCompId)), (snap) => {
      setCalculos(snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }) as CalculoMensal));
    });

    const unsubColab = onSnapshot(query(collection(db, 'colaboradores'), where('unitId', '==', comp.unitId)), (snap) => {
      setColaboradores(snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Colaborador)));
    });

    const unsubUnit = onSnapshot(doc(db, 'units', comp.unitId), (snap) => {
      if (snap.exists()) {
        setUnit({ id: snap.id, ...snap.data() } as Unit);
      } else {
        setUnit(null);
      }
    });

    const unsubConfig = onSnapshot(query(collection(db, 'configuracoes'), where('competenciaId', '==', selectedCompId)), (snap) => {
      if (!snap.empty) {
        setConfig(snap.docs[0].data() as Configuracao);
      } else {
        setConfig(null);
      }
    });

    return () => {
      unsubArrec();
      unsubPres();
      unsubCalc();
      unsubColab();
      unsubUnit();
      unsubConfig();
    };
  }, [selectedCompId, comp]);

  const days = comp ? eachDayOfInterval({
    start: startOfMonth(new Date(comp.ano, comp.mes - 1, 1)),
    end: endOfMonth(new Date(comp.ano, comp.mes - 1, 1))
  }) : [];

  const colaboradoresAtivos = useMemo(
    () => colaboradores.filter(colaborador => colaborador.status === 'ATIVO'),
    [colaboradores]
  );

  const colaboradoresAtivosIds = useMemo(
    () => new Set(colaboradoresAtivos.map(colaborador => colaborador.id)),
    [colaboradoresAtivos]
  );

  const presencasEsperadas = colaboradoresAtivos.length * days.length;
  const presencasRegistradas = useMemo(() => {
    const combinacoes = new Set<string>();

    presencas.forEach(presenca => {
      if (colaboradoresAtivosIds.has(presenca.colaboradorId)) {
        combinacoes.add(`${presenca.colaboradorId}:${presenca.data}`);
      }
    });

    return combinacoes.size;
  }, [presencas, colaboradoresAtivosIds]);

  const checkArrecadacao = arrecadacoes.length === days.length;
  const checkPresencas = presencasEsperadas === 0 ? true : presencasRegistradas === presencasEsperadas;
  const checkCalculo = calculos.length > 0;
  const totalLiquido = arrecadacoes.reduce((sum, a) => sum + a.valorLiquido, 0);
  const totalDistribuido = calculos.reduce((sum, c) => sum + c.valorFinal, 0);
  const checkDiferenca = Math.abs(totalLiquido - totalDistribuido) < 0.01;

  const handleFechar = async () => {
    if (!checkArrecadacao || !checkCalculo) {
      toast.error('Verifique as pendências de Auditoria de Receitas e Validação de Rateio antes de fechar.');
      return;
    }

    setLoading(true);
    try {
      await updateDoc(doc(db, 'competencias', selectedCompId), {
        status: 'FECHADO',
        dataFechamento: new Date().toISOString(),
        fechadoPor: auth.currentUser?.email
      });
      await logAudit('FECHAMENTO', 'FECHAR', 'Competencia', selectedCompId, { status: 'ABERTO' }, { status: 'FECHADO' });
      toast.success('Competência encerrada com sucesso');
    } catch (error) {
      toast.error('Falha ao encerrar competência');
    } finally {
      setLoading(false);
    }
  };

  const handleReabrir = async () => {
    setLoading(true);
    try {
      await updateDoc(doc(db, 'competencias', selectedCompId), {
        status: 'ABERTO',
        dataFechamento: null,
        fechadoPor: null
      });
      await logAudit('FECHAMENTO', 'REABRIR', 'Competencia', selectedCompId, { status: 'FECHADO' }, { status: 'ABERTO' });
      toast.success('Competência reaberta para edições');
    } catch (error) {
      toast.error('Erro ao reabrir competência');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (exportFormat: 'pdf' | 'excel') => {
    if (!comp || calculos.length === 0) {
      toast.error('Gere os cálculos antes de exportar o relatório.');
      return;
    }

    setExportLoading(exportFormat);
    try {
      const reportData = calculos.map(calc => {
        const colab = colaboradores.find(c => c.id === calc.colaboradorId);
        const cargo = cargos.find(c => c.id === colab?.cargoId);
        const colabPresencas = presencas.filter(p => p.colaboradorId === calc.colaboradorId);
        
        return {
          colaborador: colab?.nome || 'N/A',
          cargo: cargo?.nome || 'N/A',
          setor: cargo?.pool || 'N/A',
          pontos: calc.totalPontos,
          valor: calc.valorFinal,
          faltas: colabPresencas.filter(p => p.status === 'FALTA').length,
          diasTrabalhados: colabPresencas.filter(p => p.status === 'PRESENTE').length
        };
      });

      const params = {
        unitName: unit?.name || 'Sistema Caixinha',
        unitLogo: unit?.logoUrl,
        competencia: format(new Date(comp.ano, comp.mes - 1), 'MMMM yyyy', { locale: ptBR }),
        data: reportData
      };

      if (exportFormat === 'excel') {
        exportService.exportToExcel(params);
      } else {
        await exportService.exportToPDF(params);
      }
      
      toast.success(`Relatório em ${exportFormat.toUpperCase()} gerado com sucesso`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Erro ao gerar relatório');
    } finally {
      setExportLoading(null);
    }
  };

  const handleIndividualExport = async (calc: CalculoMensal) => {
    if (!comp) return;
    
    setExportLoading(calc.id);
    try {
      const colab = colaboradores.find(c => c.id === calc.colaboradorId);
      const cargo = cargos.find(c => c.id === colab?.cargoId);
      const colabPresencas = presencas.filter(p => p.colaboradorId === calc.colaboradorId);
      
      await exportService.exportToPDF({
        unitName: unit?.name || 'Sistema Caixinha',
        unitLogo: unit?.logoUrl,
        competencia: format(new Date(comp.ano, comp.mes - 1), 'MMMM yyyy', { locale: ptBR }),
        data: [{
          colaborador: colab?.nome || 'N/A',
          cargo: cargo?.nome || 'N/A',
          setor: cargo?.pool || 'N/A',
          pontos: calc.totalPontos,
          valor: calc.valorFinal,
          faltas: colabPresencas.filter(p => p.status === 'FALTA').length,
          diasTrabalhados: colabPresencas.filter(p => p.status === 'PRESENTE').length
        }]
      });
      toast.success(`Recibo de ${colab?.nome} gerado.`);
    } catch (error) {
      toast.error('Erro ao gerar recibo');
    } finally {
      setExportLoading(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-12 pb-24">
      {/* Header */}
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-8 px-1">
        <div className="flex items-center gap-8">
          {unit?.logoUrl ? (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="h-20 w-40 bg-white rounded-[24px] border border-border/40 shadow-2xl shadow-muted/50 p-4 flex items-center justify-center shrink-0 ring-1 ring-border/5"
            >
              <img 
                src={unit.logoUrl} 
                alt={unit.name} 
                className="h-full w-full object-contain"
                referrerPolicy="no-referrer"
              />
            </motion.div>
          ) : (
            <div className="h-20 w-20 rounded-[24px] bg-primary flex items-center justify-center text-white shadow-xl shadow-primary/30 rotate-2">
              <FileCheck className="h-10 w-10 -rotate-2" />
            </div>
          )}
          <div className="space-y-1">
            <div className="flex items-center gap-4">
              <motion.h1 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-4xl font-bold text-foreground"
              >
                Fechamento Operacional
              </motion.h1>
            </div>
            <motion.p 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-zinc-600 font-bold text-sm tracking-wide"
            >
              Autenticação de resultados, conformidade fiscal e auditoria de rateio.
            </motion.p>
          </div>
        </div>

        <div className="flex items-center gap-4 bg-white p-2.5 rounded-[22px] border border-border/60 shadow-md ring-1 ring-border/5 group">
          <div className="h-11 w-11 bg-muted/60 rounded-xl flex items-center justify-center ml-1 group-hover:bg-primary group-hover:text-white transition-colors shadow-inner">
             <CalendarIcon className="h-5 w-5 text-zinc-500" />
          </div>
          <Select value={selectedCompId} onValueChange={setSelectedCompId}>
            <SelectTrigger className="h-12 w-[260px] border-none focus:ring-0 shadow-none rounded-xl font-bold text-foreground capitalize text-lg">
              <SelectValue placeholder="Selecionar Ciclo">
                {comp ? format(new Date(comp.ano, comp.mes - 1), 'MMMM yyyy', { locale: ptBR }) : undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="rounded-3xl border-border/40 shadow-2xl p-3 bg-white/95 backdrop-blur-xl">
              {competencias.map(c => (
                <SelectItem key={c.id} value={c.id} className="font-semibold py-4 px-5 rounded-2xl focus:bg-muted mb-1 capitalize text-sm tracking-tight last:mb-0">
                  {format(new Date(c.ano, c.mes - 1), 'MMMM yyyy', { locale: ptBR })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
        {/* Checklist */}
        <div className="md:col-span-2 space-y-8">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <Card className="border-border/50 shadow-2xl shadow-zinc-200 rounded-[40px] overflow-hidden bg-white ring-1 ring-border/5">
              <CardHeader className="p-10 pb-6 border-b border-border/60 bg-muted/20">
                <CardTitle className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500 leading-none">Matriz de Integridade Corporativa</CardTitle>
              </CardHeader>
              <CardContent className="p-10 pt-8 space-y-6">
                <IntegrityItem 
                  title="Auditoria de Receitas" 
                  subtitle={`Sincronização: ${arrecadacoes.length} de ${days.length} períodos fiscais`}
                  isValid={checkArrecadacao}
                  errorLabel={arrecadacoes.length < days.length ? `${days.length - arrecadacoes.length} dias em aberto` : ''}
                />
                <IntegrityItem 
                  title="Certificação de Horas" 
                  subtitle={`Frequência: ${presencasRegistradas} de ${presencasEsperadas} entradas registradas`}
                  isValid={checkPresencas}
                  errorLabel={!checkPresencas ? 'Pendência Reportada' : ''}
                />
                <IntegrityItem 
                  title="Validação de Rateio" 
                  subtitle={checkCalculo ? 'Memória de cálculo processada com sucesso' : 'Processamento em espera'}
                  isValid={checkCalculo}
                  errorLabel={!checkCalculo ? 'Cálculo Nulo' : ''}
                />
                <IntegrityItem 
                  title="Conciliação Financeira" 
                  subtitle={`Delta de Arredondamento: R$ ${(totalLiquido - totalDistribuido).toFixed(4)}`}
                  isValid={checkDiferenca}
                  errorLabel={!checkDiferenca ? 'Discrepância Crítica' : ''}
                />
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="border-border/60 bg-muted/10 rounded-[32px] p-8 border-dashed flex items-start gap-6 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                 <ShieldCheck className="h-32 w-32" />
              </div>
              <div className="h-14 w-14 bg-white rounded-2xl shadow-xl border border-border/20 flex items-center justify-center shrink-0 rotate-3 group-hover:rotate-0 transition-transform">
                <Info className="h-7 w-7 text-primary/60" />
              </div>
              <div className="space-y-2 relative">
                <p className="text-sm font-black text-foreground uppercase tracking-widest leading-none mb-2">Protocolo de Segurança</p>
                <p className="text-sm text-zinc-700 font-bold leading-relaxed max-w-lg">
                   O encerramento é um ato final irrevogável. Ao processar, todos os inputs e parâmetros serão <strong>blindados</strong> para auditoria contábil. Reaberturas dependem de privilégios de Direção.
                </p>
              </div>
            </Card>
          </motion.div>
        </div>

        {/* Actions Pane */}
        <div className="space-y-8">
          <AnimatePresence mode="wait">
            {comp?.status === 'ABERTO' ? (
              <motion.div
                key="aberto"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
              >
                <Card className="border-border/60 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.12)] rounded-[40px] overflow-hidden ring-1 ring-border/5 bg-white relative">
                  <div className="absolute top-0 inset-x-0 h-2 bg-primary/20" />
                  <div className="p-10 space-y-10">
                    <div className="space-y-4">
                       <Badge className="bg-zinc-900 text-white border-none rounded-2xl px-4 py-1.5 text-[11px] font-black uppercase tracking-widest">
                         STATUS: EM OPERAÇÃO
                       </Badge>
                       <h3 className="text-3xl font-black text-foreground leading-tight tracking-tighter">Selar Período Fiscal</h3>
                    </div>

                    <div className="space-y-6">
                      <div className="p-6 bg-primary/5 rounded-3xl border border-primary/10 flex gap-4">
                        <AlertTriangle className="h-6 w-6 text-primary shrink-0" />
                        <p className="text-xs text-primary/80 font-bold leading-relaxed">
                          Confirmar conformidade de todos os lançamentos antes de prosseguir com a blindagem.
                        </p>
                      </div>

                      <Button
                        onClick={handleFechar}
                        disabled={loading || !checkArrecadacao || !checkCalculo}
                        className="w-full h-20 rounded-[28px] bg-zinc-900 hover:bg-black text-white font-black text-xl shadow-2xl shadow-black/20 transition-all active:scale-95 disabled:grayscale disabled:opacity-30 group"
                      >
                        {loading ? <Loader2 className="h-8 w-8 animate-spin" /> : <Lock className="h-6 w-6 mr-4 group-hover:scale-110 transition-transform" />}
                        {loading ? 'SINCRONIZANDO...' : 'CERRAR COMPETÊNCIA'}
                      </Button>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ) : (
              <motion.div
                key="fechado"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
              >
                <Card className="border-emerald-500/50 shadow-2xl rounded-[40px] overflow-hidden ring-1 ring-emerald-500/10 bg-white relative">
                  <div className="absolute top-0 inset-x-0 h-2 bg-emerald-500" />
                  <div className="p-10 space-y-10 text-center">
                    <div className="flex justify-center">
                       <div className="h-24 w-24 rounded-[32px] bg-emerald-50 flex items-center justify-center text-emerald-500 border border-emerald-100 shadow-xl shadow-emerald-500/10">
                          <FileCheck className="h-12 w-12" />
                       </div>
                    </div>

                    <div className="space-y-4">
                       <h3 className="text-3xl font-bold text-foreground leading-none">Mês Homologado</h3>
                       <div className="flex flex-col gap-2 items-center">
                         <span className="text-[11px] font-black text-emerald-700 uppercase bg-emerald-50 px-4 py-1 rounded-full tracking-widest border border-emerald-500/30 shadow-sm">Certificado Digital</span>
                         <div className="text-xs text-zinc-600 font-bold flex items-center gap-2 mt-4 bg-muted/50 px-4 py-2 rounded-xl">
                           <History className="h-4 w-4" />
                           {comp?.dataFechamento ? format(new Date(comp.dataFechamento), "dd MMM, 'às' HH:mm", { locale: ptBR }) : '-'}
                         </div>
                       </div>
                    </div>

                    <div className="pt-6 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <Button 
                          variant="outline" 
                          className="h-14 rounded-2xl gap-3 font-black uppercase text-[10px] tracking-[0.2em] border-border/60 hover:bg-white hover:border-primary/40 text-muted-foreground shadow-sm" 
                          onClick={() => handleExport('excel')}
                          disabled={exportLoading !== null}
                        >
                          {exportLoading === 'excel' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-5 w-5 text-emerald-500" />} 
                          EXCEL
                        </Button>
                        <Button 
                          variant="outline" 
                          className="h-14 rounded-2xl gap-3 font-black uppercase text-[10px] tracking-[0.2em] border-border/60 hover:bg-white hover:border-primary/40 text-muted-foreground shadow-sm" 
                          onClick={() => handleExport('pdf')}
                          disabled={exportLoading !== null}
                        >
                          {exportLoading === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-5 w-5 text-primary" />} 
                          PDF
                        </Button>
                      </div>
                        <Button variant="ghost" className="w-full h-14 rounded-2xl gap-3 font-black uppercase text-[10px] tracking-[0.2em] text-destructive hover:bg-destructive/5" onClick={handleReabrir} disabled={loading}>
                        <Unlock className="h-4 w-4" /> Quebrar Lacre Operacional
                      </Button>
                      <Button 
                        variant="ghost" 
                        className="w-full h-14 rounded-2xl gap-3 font-black uppercase text-[10px] tracking-[0.2em] text-primary hover:bg-primary/5"
                        onClick={() => setShowSimplifiedReport(true)}
                      >
                        <FileText className="h-4 w-4" /> Relatório Simplificado (Funcionários)
                      </Button>
                    </div>
                  </div>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {comp && (
        <SimplifiedReportModal
          isOpen={showSimplifiedReport}
          onClose={() => setShowSimplifiedReport(false)}
          competencia={comp}
          unit={unit}
          calculos={calculos}
          colaboradores={colaboradores}
          cargos={cargos}
          config={config}
          totalArrecadado={totalLiquido}
        />
      )}

      {/* Results Table */}
      <AnimatePresence>
        {checkCalculo && (
          <motion.section
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-1">
              <div className="flex items-center gap-6">
                <div className="h-16 w-16 bg-primary text-white rounded-[22px] flex items-center justify-center shadow-xl shadow-primary/20 rotate-3">
                  <Zap className="h-8 w-8 -rotate-3" />
                </div>
                <div>
                  <h2 className="text-3xl font-bold text-foreground tracking-tight leading-none mb-2">Relatório de Distribuição</h2>
                  <p className="text-sm font-bold text-zinc-600 uppercase tracking-widest">Resultado consolidado por colaborador e mérito</p>
                </div>
              </div>
              <div className="hidden md:flex items-center gap-4">
                <Button 
                  variant="outline" 
                  className="rounded-2xl border-border/80 h-14 px-8 font-black uppercase text-[10px] tracking-[0.2em] hover:bg-white hover:border-primary/40 text-zinc-700 shadow-sm"
                  onClick={() => handleExport('excel')}
                  disabled={exportLoading !== null}
                >
                  <FileSpreadsheet className="h-5 w-5 mr-3 text-emerald-600" /> Planilha Mestre
                </Button>
                <Button 
                  className="rounded-2xl h-14 px-8 font-black uppercase text-[10px] tracking-[0.2em] bg-primary hover:bg-primary/90 text-white shadow-2xl shadow-primary/20 border-none"
                  onClick={() => handleExport('pdf')}
                  disabled={exportLoading !== null}
                >
                  {exportLoading === 'pdf' ? <Loader2 className="h-5 w-5 animate-spin mr-3" /> : <FileText className="h-5 w-5 mr-3" />} 
                  Relatório Master PDF
                </Button>
                <Button 
                  variant="outline"
                  className="rounded-2xl h-14 px-8 font-black uppercase text-[10px] tracking-[0.2em] border-primary/40 text-primary hover:bg-primary/5 shadow-xl shadow-primary/5"
                  onClick={() => setShowSimplifiedReport(true)}
                >
                  <Users className="h-5 w-5 mr-3" /> Relatório Funcionários
                </Button>
              </div>
            </div>

            {/* Desktop Distribution Table */}
            <div className="hidden lg:block">
              <Card className="border-border/50 shadow-2xl shadow-muted/50 rounded-[40px] overflow-hidden bg-white ring-1 ring-border/5">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-zinc-50 border-b border-border/60">
                        <th className="p-8 text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500 pl-12">Colaborador Principal</th>
                        <th className="p-8 text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500">Classificação / Setor</th>
                        <th className="p-8 text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500 text-center">Mérito (Pts)</th>
                        <th className="p-8 text-[11px] font-black uppercase tracking-[0.2em] text-zinc-900 text-right">Quota Líquida</th>
                        <th className="p-8 text-[11px] font-black uppercase tracking-[0.2em] text-zinc-400 text-center pr-12">Documento</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {calculos.map((calc, idx) => {
                        const colab = colaboradores.find(c => c.id === calc.colaboradorId);
                        const cargo = cargos.find(c => c.id === colab?.cargoId);
                        return (
                          <motion.tr 
                            key={calc.id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: idx * 0.01 }}
                            className="hover:bg-zinc-50 transition-colors group h-24"
                          >
                            <td className="p-8 pl-12">
                              <div className="flex items-center gap-5">
                                <div className="h-11 w-11 bg-zinc-100 rounded-xl flex items-center justify-center font-black text-zinc-500 group-hover:bg-zinc-900 group-hover:text-white transition-all shadow-inner text-sm uppercase">
                                  {colab?.nome.charAt(0)}
                                </div>
                                <div className="font-bold text-[17px] text-zinc-900 tracking-tight">{colab?.nome}</div>
                              </div>
                            </td>
                            <td className="p-8">
                              <div className="text-xs font-black text-zinc-900 mb-1 uppercase tracking-wider">{cargo?.nome}</div>
                              <Badge variant="secondary" className="h-5 px-2 bg-zinc-100 text-zinc-500 text-[9px] font-black uppercase rounded-md border-none">
                                 {cargo?.pool}
                              </Badge>
                            </td>
                            <td className="p-8 text-center">
                              <div className="inline-flex h-10 px-4 items-center justify-center bg-zinc-50 rounded-xl font-mono font-black text-sm text-zinc-900 border border-border/40">
                                {calc.totalPontos}
                              </div>
                            </td>
                            <td className="p-8 text-right">
                              <div className="font-black text-zinc-900 text-xl tracking-tighter">
                                R$ {calc.valorFinal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </div>
                            </td>
                            <td className="p-8 text-center pr-12">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-12 w-12 p-0 rounded-2xl hover:bg-zinc-900 hover:text-white transition-all shadow-sm border-border/60 bg-white"
                                onClick={() => handleIndividualExport(calc)}
                                disabled={exportLoading !== null}
                              >
                                {exportLoading === calc.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
                              </Button>
                            </td>
                          </motion.tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>

            {/* Mobile Distribution Cards */}
            <div className="lg:hidden space-y-4">
              {calculos.map((calc, idx) => {
                const colab = colaboradores.find(c => c.id === calc.colaboradorId);
                const cargo = cargos.find(c => c.id === colab?.cargoId);
                const isExpanded = expandedDetail === calc.id;
                
                return (
                  <motion.div
                    key={calc.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                  >
                    <Card className={`border-zinc-200 overflow-hidden transition-all ${isExpanded ? 'ring-2 ring-zinc-900 shadow-2xl' : 'shadow-sm'}`}>
                      <div 
                        className="p-5 flex items-center justify-between cursor-pointer"
                        onClick={() => setExpandedDetail(isExpanded ? null : calc.id)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 bg-zinc-100 rounded-xl flex items-center justify-center font-black text-zinc-400">
                            {colab?.nome.charAt(0)}
                          </div>
                          <div>
                            <h4 className="font-black text-sm text-zinc-900">{colab?.nome}</h4>
                            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-tight">{cargo?.nome}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-black text-zinc-900 px-2 py-1 bg-zinc-50 rounded-lg">
                            R$ {calc.valorFinal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="p-5 pt-0 bg-zinc-50/50 border-t border-zinc-50 space-y-4">
                          <div className="grid grid-cols-2 gap-4 mt-4">
                            <div className="p-3 bg-white rounded-xl border border-zinc-100 shadow-sm">
                              <p className="text-[8px] font-black text-zinc-400 uppercase mb-1">Setor / Pool</p>
                              <p className="text-xs font-black text-zinc-700">{cargo?.pool}</p>
                            </div>
                            <div className="p-3 bg-white rounded-xl border border-zinc-100 shadow-sm">
                              <p className="text-[8px] font-black text-zinc-400 uppercase mb-1">Total acumulado</p>
                              <p className="text-xs font-black text-zinc-700">{calc.totalPontos} pontos</p>
                            </div>
                          </div>
                          <Button 
                            className="w-full h-12 bg-zinc-900 text-white rounded-xl font-bold gap-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleIndividualExport(calc);
                            }}
                            disabled={exportLoading !== null}
                          >
                            {exportLoading === calc.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                            Download Recibo PDF
                          </Button>
                        </div>
                      )}
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}

function IntegrityItem({ title, subtitle, isValid, errorLabel }: { title: string, subtitle: string, isValid: boolean, errorLabel?: string }) {
  return (
    <div className={cn(
      "group flex items-center justify-between p-6 rounded-2xl border transition-all relative overflow-hidden",
      isValid ? 'bg-muted/30 border-border/40 hover:bg-muted/50' : 'bg-destructive/5 border-destructive/20 hover:bg-destructive/10'
    )}>
      <div className="flex items-center gap-5">
        <div className={cn(
          "h-12 w-12 rounded-xl flex items-center justify-center transition-all shadow-sm shrink-0",
          isValid ? 'bg-white text-emerald-600 group-hover:scale-110' : 'bg-white text-destructive group-hover:scale-110'
        )}>
          {isValid ? <CheckCircle2 className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6" />}
        </div>
        <div className="space-y-0.5">
          <p className="text-sm font-semibold text-foreground uppercase tracking-tight">{title}</p>
          <p className="text-[11px] font-bold text-muted-foreground/60 leading-tight">{subtitle}</p>
        </div>
      </div>
      {!isValid && errorLabel && (
        <Badge variant="destructive" className="rounded-xl px-3 py-1 text-[9px] font-black uppercase tracking-widest border-none shadow-sm shadow-destructive/20 scale-90">
          {errorLabel}
        </Badge>
      )}
    </div>
  );
}
