import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { List } from 'react-window';
import { collection, onSnapshot, addDoc, updateDoc, doc, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Competencia, Colaborador, ArrecadacaoDiaria, PresencaDiaria, StatusPresenca, Configuracao, CalculoMensal, Cargo, Unit, Pool } from '../types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Separator } from './ui/separator';
import { 
  History, 
  Search, 
  Download, 
  Plus, 
  Trash2, 
  Save, 
  ChevronDown, 
  ChevronUp,
  X, 
  Filter, 
  UserX, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Calendar,
  Lock,
  ArrowRightLeft,
  Briefcase,
  ChevronRight,
  TrendingUp,
  Star,
  Users,
  Calculator,
  CalendarDays,
  ShieldCheck,
  Settings as SettingsIcon,
  UserCheck,
  Coffee,
  Check,
  CheckCircle,
  AlertTriangle,
  Coins,
  LayoutGrid,
  FileUp,
  Plane,
  Stethoscope,
  Building2,
  Table as TableIcon
} from 'lucide-react';
import { toast } from 'sonner';
import { calcularCompetencia, logAudit } from '../services/calculationService';
import { Badge } from './ui/badge';
import { ConfirmModal } from './ConfirmModal';
import { format, eachDayOfInterval, startOfMonth, endOfMonth, isSameDay, parse } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { parseExcelFile, downloadTemplate, getRowValue, parseExcelDate } from '../services/excelService';

const STATUS_ICONS: Record<StatusPresenca, any> = {
  'PRESENTE': UserCheck,
  'FALTA': UserX,
  'FOLGA': Coffee,
  'FERIAS': Plane,
  'AFASTADO': Stethoscope,
  'ADMISSAO': UserCheck,
  'DESLIGAMENTO': UserX
};

const STATUS_COLORS: Record<StatusPresenca, string> = {
  'PRESENTE': 'text-primary bg-primary/10 border-primary/20',
  'FALTA': 'text-destructive bg-destructive/10 border-destructive/20',
  'FOLGA': 'text-muted-foreground bg-muted border-border',
  'FERIAS': 'text-blue-600 bg-blue-50 border-blue-100',
  'AFASTADO': 'text-amber-700 bg-amber-50 border-amber-100',
  'ADMISSAO': 'text-teal-700 bg-teal-50 border-teal-100',
  'DESLIGAMENTO': 'text-rose-700 bg-rose-50 border-rose-100'
};

const VirtualList = List as any;

export default function Lancamentos() {
  const { profile } = useAuth();
  const [competencias, setCompetencias] = useState<Competencia[]>([]);
  const [selectedCompId, setSelectedCompId] = useState<string>('');
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [arrecadacoes, setArrecadacoes] = useState<ArrecadacaoDiaria[]>([]);
  const [presencas, setPresencas] = useState<PresencaDiaria[]>([]);
  const [calculos, setCalculos] = useState<CalculoMensal[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [config, setConfig] = useState<Configuracao | null>(null);
  const [loading, setLoading] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  
  // Sorting
  const [sortArrec, setSortArrec] = useState<{ key: 'data' | 'valor', direction: 'asc' | 'desc' }>({ key: 'data', direction: 'asc' });
  const [sortPresenca, setSortPresenca] = useState<{ key: 'colaborador', direction: 'asc' | 'desc' }>({ key: 'colaborador', direction: 'asc' });
  const [sortDist, setSortDist] = useState<{ key: 'colaborador' | 'valor', direction: 'asc' | 'desc' }>({ key: 'valor', direction: 'desc' });
  
  // Filters
  const [selectedUnitIdFilter, setSelectedUnitIdFilter] = useState<string>('all');
  const [filterColaboradores, setFilterColaboradores] = useState<string[]>([]);
  const [filterSetores, setFilterSetores] = useState<string[]>([]);
  const [filterPools, setFilterPools] = useState<Pool[]>([]);
  const [filterData, setFilterData] = useState<string>('all');

  useEffect(() => {
    let q = query(collection(db, 'competencias'));
    if (profile?.unitId && profile.unitId !== 'ALL') {
      q = query(collection(db, 'competencias'), where('unitId', '==', profile.unitId));
    }

    const unsubComps = onSnapshot(q, (snapshot) => {
      const comps = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Competencia))
        .sort((a, b) => b.label.localeCompare(a.label));
      setCompetencias(comps);
      if (comps.length > 0 && !selectedCompId) setSelectedCompId(comps[0].id);
    });

    const unsubUnits = onSnapshot(collection(db, 'units'), (snapshot) => {
      setUnits(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Unit)));
    });

    return () => {
      unsubComps();
      unsubUnits();
    };
  }, [profile?.unitId]);

  useEffect(() => {
    if (!selectedCompId) return;
    
    const comp = competencias.find(c => c.id === selectedCompId);
    if (!comp) return;

    const unsubArrec = onSnapshot(query(collection(db, 'arrecadacoes'), where('competenciaId', '==', selectedCompId)), (snap) => {
      setArrecadacoes(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ArrecadacaoDiaria)));
    });

    const unsubPres = onSnapshot(query(collection(db, 'presencas'), where('competenciaId', '==', selectedCompId)), (snap) => {
      setPresencas(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as PresencaDiaria)));
    });

    const unsubColab = onSnapshot(query(collection(db, 'colaboradores'), where('unitId', '==', comp.unitId)), (snap) => {
      setColaboradores(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Colaborador)));
    });

    const unsubCargos = onSnapshot(collection(db, 'cargos'), (snap) => {
      setCargos(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Cargo)));
    });

    const unsubConfig = onSnapshot(query(collection(db, 'configuracoes'), where('competenciaId', '==', selectedCompId)), (snap) => {
      if (!snap.empty) setConfig(snap.docs[0].data() as Configuracao);
    });

    const unsubCalc = onSnapshot(query(collection(db, 'calculos'), where('competenciaId', '==', selectedCompId)), (snap) => {
      setCalculos(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as CalculoMensal)));
    });

    return () => {
      unsubArrec();
      unsubPres();
      unsubColab();
      unsubCargos();
      unsubConfig();
      unsubCalc();
    };
  }, [selectedCompId, competencias]);

  const comp = competencias.find(c => c.id === selectedCompId);
  const currentUnit = units.find(u => u.id === comp?.unitId);
  const allDays = comp ? eachDayOfInterval({
    start: startOfMonth(new Date(comp.ano, comp.mes - 1, 1)),
    end: endOfMonth(new Date(comp.ano, comp.mes - 1, 1))
  }) : [];

  const days = filterData !== 'all' 
    ? allDays.filter(d => format(d, 'yyyy-MM-dd') === filterData)
    : allDays;

  const filteredColaboradores = colaboradores.filter(colab => {
    const cargo = cargos.find(c => c.id === colab.cargoId);
    const matchColab = filterColaboradores.length === 0 || filterColaboradores.includes(colab.id);
    const matchSetor = filterSetores.length === 0 || filterSetores.includes(colab.setor);
    const matchPool = filterPools.length === 0 || (cargo && filterPools.includes(cargo.pool));
    return matchColab && matchSetor && matchPool;
  });

  const uniqueSetores = (Array.from(new Set(colaboradores.map(c => c.setor))) as string[]).sort((a, b) => a.localeCompare(b));

  const sortedDays = [...days].sort((a, b) => {
    const dateA = format(a, 'yyyy-MM-dd');
    const dateB = format(b, 'yyyy-MM-dd');
    const arrecA = arrecadacoes.find(arr => arr.data === dateA);
    const arrecB = arrecadacoes.find(arr => arr.data === dateB);

    if (sortArrec.key === 'data') {
      return sortArrec.direction === 'asc' ? a.getTime() - b.getTime() : b.getTime() - a.getTime();
    }
    if (sortArrec.key === 'valor') {
      const valA = arrecA?.valorBruto || 0;
      const valB = arrecB?.valorBruto || 0;
      return sortArrec.direction === 'asc' ? valA - valB : valB - valA;
    }
    return 0;
  });

  const sortedColaboradoresPresenca = [...filteredColaboradores].sort((a, b) => {
    if (sortPresenca.key === 'colaborador') {
      return sortPresenca.direction === 'asc' ? a.nome.localeCompare(b.nome) : b.nome.localeCompare(a.nome);
    }
    return 0;
  });

  const [expandedColabId, setExpandedColabId] = useState<string | null>(null);

  const PresencaRow = ({ index, style }: any) => {
    const colab = sortedColaboradoresPresenca[index];
    if (!colab) return null;
    
    const cargo = cargos.find(c => c.id === colab.cargoId);
    const baseScore = cargo?.pontosBase ?? colab.pontosBase ?? 0;
    const isExpanded = expandedColabId === colab.id;
    
    return (
      <div 
        style={style} 
        className={cn(
          "flex h-20 group transition-all border-b border-border/10",
          isExpanded ? "bg-primary/[0.02]" : "hover:bg-muted/20"
        )}
      >
        <div 
          onClick={() => setExpandedColabId(isExpanded ? null : colab.id)}
          className={cn(
            "sticky left-0 bg-white group-hover:bg-muted/5 z-30 px-6 py-4 border-r border-border/40 transition-all flex items-center shrink-0 cursor-pointer w-[280px] shadow-[10px_0_15px_-10px_rgba(0,0,0,0.05)] h-full",
            isExpanded && "bg-primary/[0.04]"
          )}
        >
          <div className="flex items-center gap-4 w-full">
            <div className={cn(
              "h-11 w-11 rounded-[16px] flex items-center justify-center font-black text-sm shrink-0 transition-all ring-1",
              isExpanded 
                ? "bg-primary text-white ring-primary shadow-lg shadow-primary/20 scale-105" 
                : "bg-primary/5 text-primary ring-primary/10 group-hover:scale-105"
            )}>
              {colab.nome.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className={cn(
                "text-sm font-black truncate tracking-tight transition-colors mb-0.5",
                isExpanded ? "text-primary" : "text-foreground"
              )}>
                {colab.nome}
              </p>
              <div className="flex items-center gap-2">
                <Badge className={cn(
                  "px-2 py-0.5 text-[8px] font-black uppercase border-none rounded-md",
                  cargo?.pool === 'COZINHA' ? "bg-zinc-200 text-zinc-700" : "bg-primary/20 text-primary"
                )}>
                  {cargo?.pool === 'COZINHA' ? 'COZ' : 'SAL'}
                </Badge>
                <div className="flex items-center gap-1.5 transition-transform">
                   <p className="text-[10px] font-black text-zinc-500 truncate uppercase tracking-widest leading-none">{colab.setor}</p>
                   {isExpanded ? <ChevronUp className="h-3 w-3 text-primary animate-pulse" /> : <ChevronDown className="h-3 w-3 text-zinc-400 transition-opacity" />}
                </div>
              </div>
            </div>
          </div>
        </div>
        {days.map(day => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const p = presencas.find(pres => pres.colaboradorId === colab.id && pres.data === dateStr);
          const Icon = p ? STATUS_ICONS[p.status] : (day.getDay() === 0 || day.getDay() === 6 ? Coffee : UserX);
          const isWeekend = day.getDay() === 0 || day.getDay() === 6;
          
          return (
            <div key={dateStr} className={cn(
              "text-center border-r border-border/10 last:border-0 w-14 shrink-0 h-full transition-colors",
              isWeekend ? 'bg-muted/[0.15]' : '',
              isExpanded && !isWeekend && "bg-primary/[0.01]"
            )}>
              <button
                onClick={() => handleTogglePresenca(colab.id, dateStr)}
                className={cn(
                  "w-full h-full flex items-center justify-center transition-all hover:scale-110 active:scale-95 relative z-10 p-0 overflow-hidden",
                  p ? STATUS_COLORS[p.status].split(' border-')[0] : 'text-muted-foreground/10 hover:text-muted-foreground/30 hover:bg-muted/10'
                )}
                title={`${format(day, 'dd/MM')} - ${p?.status || 'NÃO LANÇADO'}`}
              >
                <Icon className="h-4 w-4" />
                {p?.status === 'PRESENTE' && baseScore > 0 && (
                  <span className="absolute bottom-1 right-1 text-[7px] font-black opacity-20 select-none tracking-tighter">
                    {baseScore.toFixed(1)}
                  </span>
                )}
              </button>
            </div>
          );
        })}
        <div className={cn(
          "text-center font-black text-sm font-mono sticky right-0 z-30 border-l border-border/40 w-24 shrink-0 flex items-center justify-center shadow-[-10px_0_15px_-10px_rgba(0,0,0,0.05)] transition-all h-full bg-white backdrop-blur-md",
          isExpanded ? "text-primary bg-primary/[0.02]" : "text-zinc-600 bg-zinc-50/80"
        )}>
          {baseScore % 1 === 0 ? baseScore.toFixed(0) : baseScore.toFixed(1)}
        </div>
      </div>
    );
  };
;

  const handleSaveArrecadacao = async (data: string, valorBruto: number) => {
    if (!config) {
      toast.error('Configure a competência primeiro');
      return;
    }
    const valorLiquido = valorBruto * (1 - config.retencaoEncargos);
    const existing = arrecadacoes.find(a => a.data === data);
    
    try {
      if (existing) {
        await updateDoc(doc(db, 'arrecadacoes', existing.id), { valorBruto, valorLiquido });
      } else {
        await addDoc(collection(db, 'arrecadacoes'), {
          unitId: comp?.unitId,
          competenciaId: selectedCompId,
          data,
          valorBruto,
          valorLiquido
        });
      }
      toast.success('Valor salvo');
    } catch (error) {
      toast.error('Erro ao salvar');
    }
  };

  const handleTogglePresenca = async (colabId: string, data: string) => {
    const existing = presencas.find(p => p.colaboradorId === colabId && p.data === data);
    const colab = colaboradores.find(c => c.id === colabId);
    if (!colab) return;

    const cargo = cargos.find(c => c.id === colab.cargoId);
    const pontosBase = cargo?.pontosBase || 0;

    const nextStatus: Record<StatusPresenca, StatusPresenca> = {
      'PRESENTE': 'FALTA',
      'FALTA': 'FOLGA',
      'FOLGA': 'FERIAS',
      'FERIAS': 'AFASTADO',
      'AFASTADO': 'PRESENTE',
      'ADMISSAO': 'PRESENTE',
      'DESLIGAMENTO': 'PRESENTE'
    };

    const currentStatus: StatusPresenca = existing?.status || 'FALTA';
    const newStatus = nextStatus[currentStatus] || 'PRESENTE';
    const pontosDoDia = newStatus === 'PRESENTE' ? pontosBase : 0;

    try {
      if (existing) {
        await updateDoc(doc(db, 'presencas', existing.id), { status: newStatus, pontosDoDia });
      } else {
        await addDoc(collection(db, 'presencas'), {
          unitId: comp?.unitId,
          competenciaId: selectedCompId,
          colaboradorId: colabId,
          data,
          status: newStatus,
          pontosDoDia
        });
      }
    } catch (error) {
      toast.error('Erro ao salvar presença');
    }
  };

  const handleRecalcular = async () => {
    setLoading(true);
    try {
      await calcularCompetencia(selectedCompId);
      toast.success('Cálculo realizado com sucesso');
    } catch (error) {
      toast.error('Erro no cálculo');
    } finally {
      setLoading(false);
    }
  };

  const handleLimparLancamentos = async () => {
    if (!selectedCompId) return;
    setIsClearing(true);
    try {
      // Collections to clear
      const collectionsToClear = ['arrecadacoes', 'presencas', 'calculos'];
      
      for (const coll of collectionsToClear) {
        const q = query(collection(db, coll), where('competenciaId', '==', selectedCompId));
        const snapshot = await getDocs(q);
        
        if (!snapshot.empty) {
          // Deletando em blocos de 500 para respeitar limites do Firestore
          const docs = snapshot.docs;
          for (let i = 0; i < docs.length; i += 500) {
            const batch = writeBatch(db);
            const chunk = docs.slice(i, i + 500);
            chunk.forEach(d => batch.delete(d.ref));
            await batch.commit();
          }
        }
      }

      await logAudit('DATA', 'CLEAR', 'CompetenciaRecords', selectedCompId, null, { collections: collectionsToClear });
      toast.success('Todos os lançamentos do mês foram removidos');
      setShowClearModal(false);
    } catch (error) {
      console.error(error);
      toast.error('Erro ao limpar lançamentos');
    } finally {
      setIsClearing(false);
    }
  };

  const handleAutoPreencherPresencas = async () => {
    if (!selectedCompId || colaboradores.length === 0) return;
    
    setLoading(true);
    try {
      const batch = writeBatch(db);
      const activeColabs = colaboradores.filter(c => c.status === 'ATIVO');
      
      for (const day of days) {
        const dateStr = format(day, 'yyyy-MM-dd');
        for (const colab of activeColabs) {
          const cargo = cargos.find(c => c.id === colab.cargoId);
          const pontosBase = cargo?.pontosBase || 0;
          
          const existing = presencas.find(p => p.colaboradorId === colab.id && p.data === dateStr);
          if (!existing) {
            const presRef = doc(collection(db, 'presencas'));
            batch.set(presRef, {
              unitId: comp?.unitId,
              competenciaId: selectedCompId,
              colaboradorId: colab.id,
              data: dateStr,
              status: 'PRESENTE',
              pontosDoDia: pontosBase
            });
          }
        }
      }
      
      await batch.commit();
      toast.success('Presenças preenchidas para todo o mês');
    } catch (error) {
      console.error(error);
      toast.error('Erro ao preencher presenças');
    } finally {
      setLoading(false);
    }
  };

  const handleImportArrecadacao = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedCompId || !config) {
      toast.error('Selecione uma competência configurada primeiro');
      return;
    }

    try {
      const result = await parseExcelFile<Partial<ArrecadacaoDiaria>>(file, (row) => {
        const rawData = getRowValue(row, ['Data', 'Dia', 'Período']);
        const rawValor = getRowValue(row, ['Valor', 'Arrecadação', 'Total', 'Faturamento']);

        if (!rawData) throw new Error('Coluna "Data" não encontrada.');
        if (rawValor === undefined || rawValor === "") throw new Error('Coluna "Valor" não encontrada.');
        
        const date = parseExcelDate(rawData);
        if (!date) throw new Error(`Data inválida: ${rawData}`);

        let valorBruto = 0;
        if (typeof rawValor === 'string') {
          // Remove R$, pontos de milhar e troca vírgula por ponto
          valorBruto = Number(rawValor.replace(/[R$\s.]/g, '').replace(',', '.'));
        } else {
          valorBruto = Number(rawValor);
        }

        if (isNaN(valorBruto)) throw new Error(`Valor inválido: ${rawValor}`);

        return {
          unitId: comp?.unitId,
          data: format(date, 'yyyy-MM-dd'),
          valorBruto,
          valorLiquido: valorBruto * (1 - config.retencaoEncargos),
          competenciaId: selectedCompId
        };
      });

      if (result.errors.length > 0) {
        toast.error(`${result.errors.length} erros encontrados. Verifique o console.`);
        console.error('Erros na importação:', result.errors);
      }

      if (result.data.length === 0) return;

      let importedCount = 0;
      for (const data of result.data) {
        const existing = arrecadacoes.find(a => a.data === data.data);
        if (existing) {
          await updateDoc(doc(db, 'arrecadacoes', existing.id), { 
            valorBruto: data.valorBruto, 
            valorLiquido: data.valorLiquido 
          });
        } else {
          await addDoc(collection(db, 'arrecadacoes'), data);
        }
        importedCount++;
      }

      toast.success(`${importedCount} lançamentos importados.`);
    } catch (error) {
      toast.error('Erro ao importar Excel');
    } finally {
      e.target.value = '';
    }
  };

  const handleDownloadTemplateArrecadacao = () => {
    downloadTemplate(['Data', 'Valor'], 'Template_Arrecadacao');
  };

  const filteredCompetencias = selectedUnitIdFilter === 'all' 
    ? competencias 
    : competencias.filter(c => c.unitId === selectedUnitIdFilter);

  const distribuicaoData = useMemo(() => {
    return filteredColaboradores
      .map(colab => {
        const calc = calculos.find(c => c.colaboradorId === colab.id);
        const cargo = cargos.find(c => c.id === colab.cargoId);
        return { colab, calc, cargo };
      })
      .filter(item => item.calc && item.calc.valorFinal > 0)
      .sort((a, b) => {
        if (sortDist.key === 'colaborador') {
          return sortDist.direction === 'asc' 
            ? a.colab.nome.localeCompare(b.colab.nome)
            : b.colab.nome.localeCompare(a.colab.nome);
        }
        if (sortDist.key === 'valor') {
          const valA = a.calc?.valorFinal || 0;
          const valB = b.calc?.valorFinal || 0;
          return sortDist.direction === 'asc' ? valA - valB : valB - valA;
        }
        return 0;
      });
  }, [filteredColaboradores, calculos, cargos, sortDist]);

  const DistributionRow = ({ index, style }: any) => {
    const item = distribuicaoData[index];
    if (!item) return null;
    const { colab, calc, cargo } = item;
    
    return (
      <div 
        style={style} 
        className="flex items-center hover:bg-muted/20 transition-all border-b border-border/40 group h-24"
      >
        <div className="px-10 w-[280px] shrink-0 sticky left-0 bg-white group-hover:bg-muted/20 transition-colors z-10 flex items-center shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] h-full">
          <div className="flex items-center gap-5">
            <div className="h-12 w-12 bg-muted/40 rounded-[18px] flex items-center justify-center font-black text-[10px] text-zinc-500 shadow-inner ring-1 ring-border/20">
               #{(index + 1).toString().padStart(2, '0')}
            </div>
            <div className="font-black text-foreground text-sm tracking-tight truncate max-w-[150px]">{colab.nome}</div>
          </div>
        </div>
        <div className="px-6 flex-1 min-w-[200px] flex flex-col justify-center">
          <span className="text-xs font-bold text-foreground">{cargo?.nome || '—'}</span>
          <span className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-widest leading-none mt-1">{colab.setor}</span>
        </div>
        <div className="px-6 w-[150px] shrink-0 text-center flex flex-col justify-center items-center">
          <span className="font-mono text-zinc-600 text-xs font-black">{calc?.totalPontos.toFixed(1)}</span>
          <span className="text-[8px] font-black uppercase text-zinc-400 leading-none mt-1 tracking-[0.2em]">Acumulado</span>
        </div>
        <div className="px-10 w-[220px] shrink-0 text-right flex flex-col justify-center items-end">
          <span className="text-base font-mono font-semibold text-primary tracking-tight">
            R$ {calc?.valorFinal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
          {calc && calc.totalPontos > 0 && (
             <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mt-1">
                v/pt: R$ {(calc.valorFinal / calc.totalPontos).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
             </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-12 pb-24">
      {/* Context Action Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-10 border-b border-border/60 pb-10 px-4 md:px-1">
        <div className="flex items-center gap-6 flex-1 min-w-0">
          {currentUnit?.logoUrl ? (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="h-16 w-32 bg-white rounded-[20px] border border-border/40 shadow-xl shadow-muted/50 p-3 flex items-center justify-center shrink-0 ring-1 ring-border/5"
            >
              <img 
                src={currentUnit.logoUrl} 
                alt={currentUnit.name} 
                className="h-full w-full object-contain"
                referrerPolicy="no-referrer"
              />
            </motion.div>
          ) : (
             <div className="h-16 w-16 bg-primary/5 rounded-[20px] border border-primary/10 flex items-center justify-center text-primary shrink-0 shadow-lg shadow-primary/5">
                <FileUp className="h-8 w-8" />
             </div>
          )}
          <div className="space-y-1 flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-4">
              <motion.h2 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-3xl font-black text-foreground tracking-tighter"
              >
                Painel Operacional
              </motion.h2>
              {currentUnit && (
                <Badge className="bg-accent text-accent-foreground border-none rounded-xl px-3 py-0.5 text-[9px] font-bold uppercase tracking-widest shadow-sm">
                  {currentUnit.name}
                </Badge>
              )}
            </div>
            <motion.p 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest"
            >
              {comp ? `Ciclo Fiscal: ${format(new Date(comp.ano, comp.mes - 1), 'MMMM yyyy', { locale: ptBR })}` : 'Controle Operacional Diário'}
            </motion.p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {profile?.role === 'ADMIN' && (
            <div className="flex items-center gap-4 bg-muted/40 px-4 py-1.5 rounded-[22px] border border-border/60 h-14 ring-1 ring-border/5">
              <div className="flex flex-col min-w-[120px]">
                <label className="text-[8px] font-black text-zinc-500 uppercase tracking-widest px-1">PDV</label>
                <Select value={selectedUnitIdFilter} onValueChange={setSelectedUnitIdFilter}>
                  <SelectTrigger className="w-full border-none focus:ring-0 shadow-none font-bold text-xs text-foreground bg-transparent h-5 p-0 hover:bg-transparent tracking-tight">
                    <SelectValue>
                      {selectedUnitIdFilter === 'all' ? 'Todas Unidades' : units.find(u => u.id === selectedUnitIdFilter)?.name}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl border-border/40 shadow-2xl p-2 bg-white/95 backdrop-blur-xl">
                    <SelectItem value="all" className="font-bold text-xs py-3 rounded-xl focus:bg-primary/5 focus:text-primary mb-1">Todas Unidades</SelectItem>
                    {units.map(u => (
                      <SelectItem key={u.id} value={u.id} className="py-3 px-5 rounded-xl focus:bg-primary/5 focus:text-primary font-bold text-xs mb-1 last:mb-0">
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="flex items-center gap-4 bg-white px-4 py-1.5 rounded-[22px] shadow-xl shadow-zinc-200 border border-border/60 h-14 ring-1 ring-border/5">
            <div className="flex flex-col min-w-[140px]">
              <label className="text-[8px] font-black text-zinc-500 uppercase tracking-widest px-1">Referencial</label>
              <Select value={selectedCompId} onValueChange={setSelectedCompId}>
                <SelectTrigger className="w-full border-none focus:ring-0 shadow-none font-bold text-sm text-foreground bg-transparent h-5 p-0 capitalize hover:bg-transparent tracking-tight">
                  <SelectValue>
                     {comp ? format(new Date(comp.ano, comp.mes - 1), 'MMMM yyyy', { locale: ptBR }) : 'Selecionar'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-border/40 shadow-2xl p-2 bg-white/95 backdrop-blur-xl">
                  {filteredCompetencias.map(c => (
                    <SelectItem key={c.id} value={c.id} className="capitalize py-3 px-5 rounded-xl focus:bg-primary/5 focus:text-primary font-bold text-xs mb-1 last:mb-0">
                      {format(new Date(c.ano, c.mes - 1), 'MMMM yyyy', { locale: ptBR })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button 
            variant="ghost"
            size="icon"
            onClick={() => setShowClearModal(true)}
            className="h-14 w-14 rounded-[22px] text-zinc-400 hover:text-destructive hover:bg-destructive/10 transition-all shadow-xl shadow-zinc-200 border border-border/60 ring-1 ring-border/5 bg-white shrink-0"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button 
            onClick={handleRecalcular} 
            disabled={loading} 
            className="h-14 px-8 gap-3 bg-primary hover:bg-primary/90 text-white rounded-[22px] shadow-xl shadow-primary/20 font-black uppercase text-[9px] tracking-widest transition-all active:scale-95 border-none"
          >
            <Calculator className={cn("h-4 w-4", loading && "animate-spin")} /> 
            {loading ? 'Processando...' : 'Recalcular'}
          </Button>
        </div>
      </div>

      <ConfirmModal
        isOpen={showClearModal}
        title="Limpar Lançamentos"
        message="Deseja realmente apagar TODOS os lançamentos de faturamento, presenças e cálculos deste mês? Esta ação não pode ser desfeita."
        onConfirm={handleLimparLancamentos}
        onCancel={() => setShowClearModal(false)}
        confirmText={isClearing ? 'Limpando...' : 'Sim, Limpar tudo'}
      />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-muted/30 border border-border/40 p-8 rounded-[40px] shadow-inner ring-1 ring-border/5"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          <div className="space-y-3">
            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 ml-1">Filtro Nominal</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button 
                  variant="outline" 
                  role="combobox" 
                  className="w-full h-14 bg-white border-border/60 rounded-xl font-bold justify-between px-6 shadow-sm hover:bg-white transition-all ring-1 ring-border/5"
                >
                  <span className="truncate text-foreground">
                    {filterColaboradores.length === 0 
                      ? "Todos os Colaboradores" 
                      : filterColaboradores.length === 1 
                        ? colaboradores.find(c => c.id === filterColaboradores[0])?.nome 
                        : `${filterColaboradores.length} selecionados`}
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--base-ui-popover-trigger-width)] p-3 rounded-[28px] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.18)] border-border/40 bg-white/95 backdrop-blur-xl ring-1 ring-border/5">
                <div className="max-h-72 overflow-auto space-y-1 custom-scrollbar pr-1">
                  {[...colaboradores].sort((a, b) => a.nome.localeCompare(b.nome)).map((colab) => (
                    <div
                      key={colab.id}
                      onClick={() => {
                        setFilterColaboradores(prev => 
                          prev.includes(colab.id) 
                            ? prev.filter(id => id !== colab.id) 
                            : [...prev, colab.id]
                        );
                      }}
                      className={cn(
                        "flex items-center gap-4 px-4 py-3.5 rounded-2xl cursor-pointer hover:bg-muted transition-all group",
                        filterColaboradores.includes(colab.id) && "bg-muted"
                      )}
                    >
                      <div className={cn(
                        "h-6 w-6 rounded-lg border-2 flex items-center justify-center transition-all shadow-sm",
                        filterColaboradores.includes(colab.id) 
                          ? "bg-primary border-primary scale-110" 
                          : "bg-white border-border group-hover:border-primary/40"
                      )}>
                        {filterColaboradores.includes(colab.id) && <Check className="h-3.5 w-3.5 text-white" />}
                      </div>
                      <span className={cn(
                        "text-sm font-bold transition-colors",
                        filterColaboradores.includes(colab.id) ? "text-foreground" : "text-muted-foreground/70"
                      )}>
                        {colab.nome}
                      </span>
                    </div>
                  ))}
                </div>
                {filterColaboradores.length > 0 && (
                  <div className="pt-3 mt-3 border-t border-border/40">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="w-full text-[10px] font-black uppercase text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-xl h-11 transition-all"
                      onClick={() => setFilterColaboradores([])}
                    >
                      Limpar seleção nominal
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 ml-1">Filtro por Setor</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button 
                  variant="outline" 
                  role="combobox" 
                  className="w-full h-14 bg-white border-border/60 rounded-xl font-bold justify-between px-6 shadow-sm hover:bg-white transition-all ring-1 ring-border/5"
                >
                  <span className="truncate text-foreground">
                    {filterSetores.length === 0 
                      ? "Todos os Setores" 
                      : filterSetores.length === 1 
                        ? filterSetores[0] 
                        : `${filterSetores.length} setores`}
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--base-ui-popover-trigger-width)] p-3 rounded-[28px] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.18)] border-border/40 bg-white/95 backdrop-blur-xl ring-1 ring-border/5">
                <div className="max-h-72 overflow-auto space-y-1 custom-scrollbar pr-1">
                  {uniqueSetores.map((setor) => (
                    <div
                      key={setor}
                      onClick={() => {
                        setFilterSetores(prev => 
                          prev.includes(setor) 
                            ? prev.filter(s => s !== setor) 
                            : [...prev, setor]
                        );
                      }}
                      className={cn(
                        "flex items-center gap-4 px-4 py-3.5 rounded-2xl cursor-pointer hover:bg-muted transition-all group",
                        filterSetores.includes(setor) && "bg-muted"
                      )}
                    >
                      <div className={cn(
                        "h-6 w-6 rounded-lg border-2 flex items-center justify-center transition-all shadow-sm",
                        filterSetores.includes(setor) 
                          ? "bg-primary border-primary scale-110" 
                          : "bg-white border-border group-hover:border-primary/40"
                      )}>
                        {filterSetores.includes(setor) && <Check className="h-3.5 w-3.5 text-white" />}
                      </div>
                      <span className={cn(
                        "text-sm font-bold transition-colors",
                        filterSetores.includes(setor) ? "text-foreground" : "text-muted-foreground/70"
                      )}>
                        {setor}
                      </span>
                    </div>
                  ))}
                </div>
                {filterSetores.length > 0 && (
                  <div className="pt-3 mt-3 border-t border-border/40">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="w-full text-[10px] font-black uppercase text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-xl h-11 transition-all"
                      onClick={() => setFilterSetores([])}
                    >
                      Limpar seleção de setor
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 ml-1">Filtro Temporal</label>
            <div className="relative">
              <Select value={filterData} onValueChange={setFilterData}>
                <SelectTrigger className="h-14 bg-white border-border/60 rounded-xl font-bold px-6 shadow-sm hover:bg-white transition-all ring-1 ring-border/5 text-foreground focus:ring-0">
                  <SelectValue placeholder="Todas as Datas" />
                </SelectTrigger>
                <SelectContent className="rounded-2xl shadow-[0_32px_64px_-12px_rgba(0,0,0,0.18)] border-border/40 bg-white/95 backdrop-blur-xl p-2 ring-1 ring-border/5 max-h-[400px]">
                  <SelectItem value="all" className="font-bold py-4 px-6 rounded-xl focus:bg-muted text-foreground transition-all mb-1">Todas as Datas</SelectItem>
                  {allDays.map(d => (
                    <SelectItem key={d.toISOString()} value={format(d, 'yyyy-MM-dd')} className="py-4 px-6 rounded-xl focus:bg-muted font-bold transition-all mb-1 last:mb-0">
                      {format(d, 'dd/MM/yyyy')} <span className="text-[10px] font-bold opacity-30 ml-2 uppercase">({format(d, 'EEE', { locale: ptBR })})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 ml-1">Atuação Corporativa</label>
            <div className="flex gap-4 h-14">
              <Button
                variant={filterPools.includes('SALAO') ? 'default' : 'outline'}
                onClick={() => setFilterPools(prev => prev.includes('SALAO') ? prev.filter(p => p !== 'SALAO') : [...prev, 'SALAO'])}
                className={cn(
                  "flex-1 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ring-1 ring-border/5", 
                  filterPools.includes('SALAO') 
                    ? "bg-primary text-white border-none shadow-lg shadow-primary/20 scale-[1.02]" 
                    : "bg-white border-border/60 text-zinc-500 hover:text-primary hover:border-primary/40 shadow-sm"
                )}
              >
                Salão
              </Button>
              <Button
                variant={filterPools.includes('COZINHA') ? 'default' : 'outline'}
                onClick={() => setFilterPools(prev => prev.includes('COZINHA') ? prev.filter(p => p !== 'COZINHA') : [...prev, 'COZINHA'])}
                className={cn(
                  "flex-1 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ring-1 ring-border/5",
                  filterPools.includes('COZINHA') 
                    ? "bg-zinc-900 text-white border-none shadow-lg shadow-black/20 scale-[1.02]" 
                    : "bg-white border-border/60 text-zinc-500 hover:text-zinc-900 hover:border-zinc-300 shadow-sm"
                )}
              >
                Cozinha
              </Button>
            </div>
          </div>
        </div>
        
        {(filterColaboradores.length > 0 || filterSetores.length > 0 || filterPools.length > 0 || filterData !== 'all') && (
           <motion.div 
             initial={{ opacity: 0, x: 20 }}
             animate={{ opacity: 1, x: 0 }}
             className="flex justify-end mt-6"
           >
             <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => {
                  setFilterColaboradores([]);
                  setFilterSetores([]);
                  setFilterPools([]);
                  setFilterData('all');
                }}
                className="h-10 px-6 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 hover:text-destructive hover:bg-destructive/5 gap-3 transition-all underline underline-offset-4"
              >
                <X className="h-4 w-4" />
                Limpar Filtros Avançados
              </Button>
           </motion.div>
        )}
      </motion.div>

      <Tabs defaultValue="arrecadacao" className="space-y-10">
        <div className="flex justify-center md:justify-start">
          <TabsList className="bg-muted/60 p-2 rounded-[24px] h-auto flex gap-2 border border-border/40 shadow-inner overflow-x-auto custom-scrollbar no-scrollbar-buttons">
            <TabsTrigger value="arrecadacao" className="rounded-[18px] px-8 py-3.5 font-semibold data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-2xl shadow-muted/50 transition-all text-[11px] uppercase tracking-[0.2em] ring-1 ring-border/5">Arrecadação</TabsTrigger>
            <TabsTrigger value="presenca" className="rounded-[18px] px-8 py-3.5 font-semibold data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-2xl shadow-muted/50 transition-all text-[11px] uppercase tracking-[0.2em] ring-1 ring-border/5">Frequência</TabsTrigger>
            <TabsTrigger value="distribuicao" className="rounded-[18px] px-8 py-3.5 font-semibold data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-2xl shadow-muted/50 transition-all text-[11px] uppercase tracking-[0.2em] ring-1 ring-border/5">Distribuição</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="arrecadacao" className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex flex-col md:flex-row justify-between items-end gap-8 px-2">
            <div className="space-y-3">
              <div className="h-12 w-12 bg-primary/10 rounded-[18px] flex items-center justify-center text-primary shadow-lg shadow-primary/5 mb-2">
                <Coins className="h-6 w-6" />
              </div>
              <h3 className="text-3xl font-bold tracking-tight text-foreground">Fluxo de Caixa</h3>
              <p className="text-muted-foreground/60 text-xs font-bold uppercase tracking-widest">Lançamentos de faturamento para base de cálculo</p>
            </div>
            <div className="flex gap-4">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleDownloadTemplateArrecadacao} 
                className="gap-3 rounded-[18px] h-12 border-border/40 bg-white text-[10px] font-black uppercase tracking-widest px-6 shadow-2xl shadow-muted/20 hover:bg-muted transition-all ring-1 ring-border/5"
              >
                <Download className="h-4 w-4 text-primary" /> Template
              </Button>
              <div className="relative">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="gap-3 rounded-[18px] h-12 border-border/40 bg-white text-[10px] font-black uppercase tracking-widest px-6 shadow-2xl shadow-muted/20 hover:bg-muted transition-all ring-1 ring-border/5"
                >
                  <FileUp className="h-4 w-4 text-primary" /> Importar XL
                </Button>
                <input 
                  type="file" 
                  accept=".xlsx, .xls" 
                  className="absolute inset-0 opacity-0 cursor-pointer" 
                  onChange={handleImportArrecadacao}
                />
              </div>
            </div>
          </div>
          <Card className="border-border/40 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.12)] rounded-[40px] overflow-hidden bg-white ring-1 ring-border/5">
            <div className="overflow-x-auto custom-scrollbar">
              <Table className="min-w-[1000px]">
                <TableHeader className="bg-zinc-50 border-b border-border/60">
                  <TableRow className="hover:bg-transparent h-20">
                    <TableHead 
                      className="w-[200px] cursor-pointer hover:text-primary transition-all px-10 sticky left-0 bg-zinc-50 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]"
                      onClick={() => setSortArrec({ 
                        key: 'data', 
                        direction: sortArrec.key === 'data' && sortArrec.direction === 'asc' ? 'desc' : 'asc' 
                      })}
                    >
                      <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 whitespace-nowrap">
                        Calendário
                        {sortArrec.key === 'data' && (sortArrec.direction === 'asc' ? <ChevronUp className="h-4 w-4 text-primary" /> : <ChevronDown className="h-4 w-4 text-primary" />)}
                      </div>
                    </TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 whitespace-nowrap px-6">Semana</TableHead>
                    <TableHead 
                      className="cursor-pointer hover:text-primary transition-all px-6"
                      onClick={() => setSortArrec({ 
                        key: 'valor', 
                        direction: sortArrec.key === 'valor' && sortArrec.direction === 'asc' ? 'desc' : 'asc' 
                      })}
                    >
                      <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-900 whitespace-nowrap">
                        Arrecadação Bruta
                        {sortArrec.key === 'valor' && (sortArrec.direction === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)}
                      </div>
                    </TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 whitespace-nowrap px-6">Líquido Equipe</TableHead>
                    <TableHead className="text-center text-[10px] font-black uppercase tracking-[0.2em] text-primary whitespace-nowrap px-6">Pto. Salão</TableHead>
                    <TableHead className="text-center text-[10px] font-black uppercase tracking-[0.2em] text-accent-foreground whitespace-nowrap px-6">Pto. Cozinha</TableHead>
                    <TableHead className="text-right text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 px-10 whitespace-nowrap whitespace-nowrap">Check</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedDays.map(day => {
                    const dateStr = format(day, 'yyyy-MM-dd');
                    const arrec = arrecadacoes.find(a => a.data === dateStr);
                    
                    const retencao = config?.retencaoEncargos ?? 0.33;
                    const percentSalao = config?.percentualPoolSalao ?? 0.8;
                    const percentCozinha = config?.percentualPoolCozinha ?? 0.2;
                    const totalP = percentSalao + percentCozinha;
                    const propSalao = totalP > 0 ? percentSalao / totalP : 0;
                    const propCozinha = totalP > 0 ? percentCozinha / totalP : 0;
                    
                    const liquidoDia = (arrec?.valorBruto || 0) * (1 - retencao);
                    const presencasDia = presencas.filter(p => p.data === dateStr && p.status === 'PRESENTE');
                    
                    const pontosSalao = presencasDia.reduce((sum, p) => {
                      const col = colaboradores.find(c => c.id === p.colaboradorId);
                      if (!col) return sum;
                      const cargo = cargos.find(cg => cg.id === col.cargoId);
                      return cargo?.pool === 'SALAO' ? sum + p.pontosDoDia : sum;
                    }, 0);
                    
                    const pontosCozinha = presencasDia.reduce((sum, p) => {
                      const col = colaboradores.find(c => c.id === p.colaboradorId);
                      if (!col) return sum;
                      const cargo = cargos.find(cg => cg.id === col.cargoId);
                      return cargo?.pool === 'COZINHA' ? sum + p.pontosDoDia : sum;
                    }, 0);

                    const valorPontoSalao = pontosSalao > 0 ? (liquidoDia * propSalao) / pontosSalao : 0;
                    const valorPontoCozinha = pontosCozinha > 0 ? (liquidoDia * propCozinha) / pontosCozinha : 0;

                    const isRegistered = arrec && arrec.valorBruto > 0;

                    return (
                      <TableRow key={dateStr} className="group hover:bg-muted/20 transition-all border-b border-border/40 last:border-0 h-24">
                        <TableCell className="font-bold text-foreground px-10 sticky left-0 bg-white group-hover:bg-muted/20 z-10 transition-colors shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                          <div className="flex flex-col">
                            <span className="text-lg font-semibold tracking-tight leading-none">{format(day, 'dd/MM')}</span>
                            <span className="text-[10px] font-semibold uppercase text-muted-foreground/40 mt-1">{format(day, 'yyyy')}</span>
                          </div>
                        </TableCell>
                        <TableCell className="px-6">
                           <Badge variant="secondary" className="capitalize text-[10px] font-black uppercase tracking-widest bg-muted/60 text-muted-foreground/60 border-none rounded-lg px-3 py-1">
                             {format(day, 'EEE', { locale: ptBR })}
                           </Badge>
                        </TableCell>
                        <TableCell className="px-6">
                          <div className="relative group/input max-w-[200px]">
                            <Input 
                              type="number" 
                              step="0.01"
                              className={cn(
                                "h-14 w-full font-mono font-semibold text-lg bg-muted/30 border-border/40 group-hover/input:border-primary group-hover/input:bg-white transition-all rounded-[18px] focus:bg-white pr-12 focus:ring-0 shadow-inner",
                                isRegistered ? "text-primary border-primary/20 bg-primary/[0.02]" : "text-muted-foreground"
                              )}
                              value={arrec?.valorBruto ?? ''}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                if (!isNaN(val)) {
                                  handleSaveArrecadacao(dateStr, val);
                                } else if (e.target.value === '') {
                                  handleSaveArrecadacao(dateStr, 0);
                                }
                              }}
                            />
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-muted-foreground/40 pointer-events-none group-focus-within/input:text-primary transition-colors">BRL</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-muted-foreground/60 text-sm font-bold px-6">
                          {isRegistered ? `R$ ${liquidoDia.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
                        </TableCell>
                        <TableCell className="text-center px-6">
                          {valorPontoSalao > 0 ? (
                            <div className="inline-flex flex-col items-center">
                              <span className="font-mono text-primary font-semibold text-sm">R$ {valorPontoSalao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                              <span className="text-[9px] font-black uppercase text-primary/40 leading-none mt-1">{pontosSalao.toFixed(1)} pts</span>
                            </div>
                          ) : <span className="text-muted-foreground/20">—</span>}
                        </TableCell>
                        <TableCell className="text-center px-6">
                          {valorPontoCozinha > 0 ? (
                            <div className="inline-flex flex-col items-center">
                              <span className="font-mono text-accent-foreground font-semibold text-sm">R$ {valorPontoCozinha.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                              <span className="text-[9px] font-black uppercase text-accent-foreground/40 leading-none mt-1">{pontosCozinha.toFixed(1)} pts</span>
                            </div>
                          ) : <span className="text-muted-foreground/20">—</span>}
                        </TableCell>
                        <TableCell className="text-right px-10">
                           {isRegistered ? (
                             <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary ml-auto shadow-sm ring-1 ring-primary/20">
                                <Check className="h-4 w-4" />
                             </div>
                           ) : (
                             <div className="h-8 w-8 rounded-full bg-muted/40 flex items-center justify-center text-muted-foreground/30 ml-auto border border-border/40 border-dashed">
                                <Coins className="h-3.5 w-3.5" />
                             </div>
                           )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>

            {/* Mobile Card List View */}
            <div className="md:hidden divide-y divide-zinc-100">
              {sortedDays.map(day => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const arrec = arrecadacoes.find(a => a.data === dateStr);
                const retencao = config?.retencaoEncargos ?? 0.33;
                const percentSalao = config?.percentualPoolSalao ?? 0.8;
                const percentCozinha = config?.percentualPoolCozinha ?? 0.2;
                const totalP = percentSalao + percentCozinha;
                const propSalao = totalP > 0 ? percentSalao / totalP : 0;
                const propCozinha = totalP > 0 ? percentCozinha / totalP : 0;
                const liquidoDia = (arrec?.valorBruto || 0) * (1 - retencao);
                const presencasDia = presencas.filter(p => p.data === dateStr && p.status === 'PRESENTE');
                const pontosSalao = presencasDia.reduce((sum, p) => {
                  const col = colaboradores.find(c => c.id === p.colaboradorId);
                  if (!col) return sum;
                  const cargo = cargos.find(cg => cg.id === col.cargoId);
                  return cargo?.pool === 'SALAO' ? sum + p.pontosDoDia : sum;
                }, 0);
                const pontosCozinha = presencasDia.reduce((sum, p) => {
                  const col = colaboradores.find(c => c.id === p.colaboradorId);
                  if (!col) return sum;
                  const cargo = cargos.find(cg => cg.id === col.cargoId);
                  return cargo?.pool === 'COZINHA' ? sum + p.pontosDoDia : sum;
                }, 0);
                const valorPontoSalao = pontosSalao > 0 ? (liquidoDia * propSalao) / pontosSalao : 0;
                const valorPontoCozinha = pontosCozinha > 0 ? (liquidoDia * propCozinha) / pontosCozinha : 0;

                return (
                  <div key={dateStr} className="p-4 space-y-4 bg-white">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-black text-zinc-900">{format(day, 'dd/MM/yyyy')}</p>
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-none mt-0.5">{format(day, 'EEEE', { locale: ptBR })}</p>
                      </div>
                      {arrec ? (
                        <Badge className="bg-emerald-50 text-emerald-600 border-none rounded-full h-6 px-2 text-[10px] font-black uppercase">Lançado</Badge>
                      ) : (
                        <Badge className="bg-zinc-100 text-zinc-400 border-none rounded-full h-6 px-2 text-[10px] font-black uppercase">Vazio</Badge>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest block ml-1">Valor Bruto (R$)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 font-bold text-xs">R$</span>
                        <Input 
                          type="number" 
                          step="0.01"
                          placeholder="0,00"
                          className="h-10 pl-9 font-mono font-bold text-sm bg-zinc-50 border-zinc-200 focus:bg-white rounded-xl"
                          value={arrec?.valorBruto ?? ''}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val)) {
                              handleSaveArrecadacao(dateStr, val);
                            }
                          }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div className="p-2.5 bg-blue-50/50 rounded-xl border border-blue-100/50">
                        <p className="text-[8px] font-black text-blue-400 uppercase tracking-widest mb-0.5">Pt. Salão</p>
                        <p className="text-[11px] font-black text-blue-600 font-mono">
                          {valorPontoSalao > 0 ? `R$ ${valorPontoSalao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'}
                        </p>
                      </div>
                      <div className="p-2.5 bg-orange-50/50 rounded-xl border border-orange-100/50">
                        <p className="text-[8px] font-black text-orange-400 uppercase tracking-widest mb-0.5">Pt. Cozinha</p>
                        <p className="text-[11px] font-black text-orange-600 font-mono">
                          {valorPontoCozinha > 0 ? `R$ ${valorPontoCozinha.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
        </TabsContent>

        <TabsContent value="presenca" className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-8 px-2">
            <div className="space-y-3">
              <div className="h-12 w-12 bg-primary/10 rounded-[18px] flex items-center justify-center text-primary shadow-lg shadow-primary/5 mb-2">
                <UserCheck className="h-6 w-6" />
              </div>
              <h3 className="text-3xl font-bold tracking-tight text-foreground">Grade de Frequência</h3>
              <p className="text-muted-foreground/60 text-xs font-bold uppercase tracking-widest">Controle de assiduidade e pontuação base</p>
            </div>
            <div className="flex items-center gap-4 w-full md:w-auto">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleAutoPreencherPresencas} 
                disabled={loading}
                className="flex-1 md:flex-none gap-3 rounded-[18px] h-12 border-primary/20 bg-primary/5 text-primary text-[10px] font-semibold uppercase tracking-widest px-8 shadow-2xl shadow-primary/5 hover:bg-primary/10 transition-all ring-1 ring-primary/10"
              >
                <CheckCircle2 className="h-4 w-4" /> Autopreencher Ciclo
              </Button>
            </div>
          </div>

          <div className="bg-white rounded-[40px] border border-border/40 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.12)] overflow-hidden mb-12 ring-1 ring-border/5">
              <div className="overflow-x-auto custom-scrollbar">
                <div style={{ minWidth: 280 + (days.length * 56) + 96 }}>
                  {/* Header */}
                  <div className="sticky top-0 z-40 bg-white shadow-sm flex h-20 border-b border-border/40">
                    <div 
                      className="sticky left-0 top-0 bg-white/95 backdrop-blur-md z-50 w-[280px] px-10 flex items-center cursor-pointer hover:text-primary transition-all border-r border-border/40 font-black text-[10px] uppercase tracking-[0.2em] shadow-[10px_0_15px_-10px_rgba(0,0,0,0.05)]"
                      onClick={() => setSortPresenca({ 
                        key: 'colaborador', 
                        direction: sortPresenca.key === 'colaborador' && sortPresenca.direction === 'asc' ? 'desc' : 'asc' 
                      })}
                    >
                      <div className="flex items-center gap-3">
                        Colaborador
                        {sortPresenca.key === 'colaborador' && (sortPresenca.direction === 'asc' ? <ChevronUp className="h-4 w-4 text-primary" /> : <ChevronDown className="h-4 w-4 text-primary" />)}
                      </div>
                    </div>
                    {days.map(day => {
                      const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                      const isToday = isSameDay(day, new Date());
                      return (
                        <div key={day.toISOString()} className={cn(
                          "text-center w-14 shrink-0 flex flex-col justify-center transition-all border-r border-border/5",
                          isWeekend ? 'bg-muted/30' : 'hover:bg-primary/[0.02]',
                          isToday && 'bg-primary/[0.03]'
                        )}>
                          <div className={cn(
                            "text-[13px] font-black leading-none tracking-tight",
                            isWeekend ? 'text-rose-500/40' : isToday ? 'text-primary' : 'text-foreground'
                          )}>{format(day, 'dd')}</div>
                          <div className={cn(
                            "text-[8px] uppercase font-black mt-1 tracking-widest",
                            isToday ? "text-primary" : "text-muted-foreground/30"
                          )}>{format(day, 'EEE', { locale: ptBR }).charAt(0)}</div>
                        </div>
                      );
                    })}
                    <div className="text-center font-black text-[10px] uppercase tracking-[0.2em] bg-white sticky right-0 z-50 border-l border-border/40 w-24 shrink-0 flex items-center justify-center shadow-[-10px_0_15px_-10px_rgba(0,0,0,0.05)] whitespace-nowrap backdrop-blur-md">Total Pts</div>
                  </div>

                  {/* Body */}
                  <div className="relative">
                    {sortedColaboradoresPresenca.length > 0 ? (
                      <div className="border-b border-border/40">
                        <VirtualList
                          height={Math.min(sortedColaboradoresPresenca.length * 80, 560)}
                          rowCount={sortedColaboradoresPresenca.length}
                          rowHeight={80}
                          width="100%"
                          className="custom-scrollbar"
                          rowComponent={PresencaRow}
                          rowProps={{}}
                        />
                      </div>
                    ) : (
                      <div className="text-center py-32 text-muted-foreground italic bg-zinc-50/50 rounded-b-[40px]">
                        Nenhum colaborador encontrado com os filtros atuais.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Detail Panel - Modern Bento Style */}
              <AnimatePresence mode="wait">
                {expandedColabId && (
                  <motion.div
                    key={expandedColabId}
                    initial={{ height: 0, opacity: 0, y: -20 }}
                    animate={{ height: 'auto', opacity: 1, y: 0 }}
                    exit={{ height: 0, opacity: 0, y: -20 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    className="border-t border-border/40 bg-zinc-50/80 backdrop-blur-sm overflow-hidden"
                  >
                    <div className="p-8 lg:p-12 space-y-10">
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                        <div className="flex items-center gap-5">
                          <div className="h-14 w-14 rounded-2xl bg-primary flex items-center justify-center text-white shadow-xl shadow-primary/20 ring-4 ring-white">
                            <UserCheck className="h-7 w-7" />
                          </div>
                          <div>
                             <h4 className="text-xl font-black text-foreground uppercase tracking-tight leading-none">
                               Análise de Desempenho: <span className="text-primary italic">{colaboradores.find(c => c.id === expandedColabId)?.nome}</span>
                             </h4>
                             <p className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-[0.2em] mt-2 flex items-center gap-2">
                               <span className="h-1 w-1 bg-primary rounded-full" />
                               Competência: {comp?.mes}/{comp?.ano}
                             </p>
                          </div>
                        </div>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => setExpandedColabId(null)}
                          className="h-12 px-6 rounded-2xl border-zinc-200 bg-white font-black text-[10px] uppercase tracking-widest gap-3 hover:bg-zinc-900 hover:text-white hover:border-zinc-900 transition-all shadow-xl shadow-zinc-200/50"
                        >
                          Recolher Painel
                          <X className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {[
                          { 
                            label: 'Frequência Efetiva', 
                            value: presencas.filter(p => p.colaboradorId === expandedColabId && p.status === 'PRESENTE').length, 
                            unit: 'DIAS', 
                            color: 'text-emerald-600',
                            icon: CheckCircle2,
                            bg: 'bg-emerald-50'
                          },
                          { 
                            label: 'Pontos Acumulados', 
                            value: presencas.filter(p => p.colaboradorId === expandedColabId && p.status === 'PRESENTE').reduce((acc, p) => acc + (p.pontosDoDia || 0), 0).toFixed(1), 
                            unit: 'PTS', 
                            color: 'text-primary',
                            icon: Star,
                            bg: 'bg-primary/5'
                          },
                          { 
                            label: 'Absenteísmo', 
                            value: presencas.filter(p => p.colaboradorId === expandedColabId && p.status === 'FALTA').length, 
                            unit: 'FALTAS', 
                            color: 'text-rose-500',
                            icon: AlertCircle,
                            bg: 'bg-rose-50'
                          },
                          { 
                            label: 'Previsão de Caixinha', 
                            value: calculos.find(c => c.colaboradorId === expandedColabId)?.valorFinal.toLocaleString('pt-BR', { maximumFractionDigits: 0 }), 
                            unit: 'BRL', 
                            color: 'text-zinc-900',
                            icon: TrendingUp,
                            bg: 'bg-zinc-100'
                          }
                        ].map((stat, idx) => (
                          <motion.div 
                            key={idx}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: idx * 0.1 }}
                            className="bg-white p-8 rounded-[32px] border border-border/40 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all group ring-1 ring-border/5"
                          >
                            <div className="flex items-center justify-between mb-6">
                              <p className="text-[9px] font-black text-muted-foreground/40 uppercase tracking-[0.2em]">{stat.label}</p>
                              <div className={cn("h-8 w-8 rounded-xl flex items-center justify-center transition-transform group-hover:rotate-12", stat.bg)}>
                                <stat.icon className={cn("h-4 w-4", stat.color)} />
                              </div>
                            </div>
                            <div className="flex items-baseline gap-2">
                              <span className={cn("text-4xl font-black tracking-tighter", stat.color)}>
                                {stat.value}
                              </span>
                              <span className="text-[10px] font-black text-muted-foreground/20 tracking-widest">{stat.unit}</span>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="mt-10 flex flex-wrap gap-4 p-8 bg-muted/30 rounded-[40px] border border-border/40 shadow-inner">
              {Object.entries(STATUS_ICONS).filter(([status]) => status !== 'ADMISSAO' && status !== 'DESLIGAMENTO').map(([status, Icon]) => (
                <div key={status} className="flex items-center gap-4 py-3.5 px-6 bg-white rounded-2xl shadow-2xl shadow-muted/20 border border-border/40 ring-1 ring-border/5">
                  <div className={cn(
                    "h-10 w-10 rounded-xl flex items-center justify-center shadow-lg border border-border/20",
                    STATUS_COLORS[status as StatusPresenca].split(' border-')[0]
                  )}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-foreground uppercase tracking-[0.2em]">{status === 'PRESENTE' ? 'Trabalhou' : status === 'FALTA' ? 'Faltou' : status}</span>
                    <span className="text-[8px] font-bold text-muted-foreground/60 uppercase tracking-widest">Status de Ciclo</span>
                  </div>
                </div>
              ))}
            </div>

          {/* Mobile/Tablet Card View */}
          <div className="lg:hidden space-y-6">
            {sortedColaboradoresPresenca.map(colab => {
              const cargo = cargos.find(c => c.id === colab.cargoId);
              const baseScore = cargo?.pontosBase ?? colab.pontosBase ?? 0;
              const isExpanded = expandedColabId === colab.id;
              
              const colabPresencasCount = presencas.filter(p => p.colaboradorId === colab.id && p.status === 'PRESENTE').length;
              const totalPoints = presencas.filter(p => p.colaboradorId === colab.id && p.status === 'PRESENTE').reduce((acc, p) => acc + (p.pontosDoDia || 0), 0);
              
              return (
                <div key={colab.id} className={cn(
                  "bg-white rounded-[32px] overflow-hidden transition-all duration-500 border border-border/40 shadow-xl",
                  isExpanded ? "ring-2 ring-primary shadow-primary/10" : "shadow-muted/20"
                )}>
                  <div 
                    className="p-6 flex items-center justify-between cursor-pointer hover:bg-muted/5 transition-colors"
                    onClick={() => setExpandedColabId(isExpanded ? null : colab.id)}
                  >
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "h-14 w-14 rounded-[22px] flex items-center justify-center font-black text-white shadow-xl transition-all",
                        isExpanded ? "bg-primary scale-110 rotate-3 shadow-primary/30" : "bg-zinc-900"
                      )}>
                        {colab.nome.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h4 className={cn(
                          "font-black text-base leading-tight tracking-tight transition-colors",
                          isExpanded ? "text-primary" : "text-foreground"
                        )}>{colab.nome}</h4>
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <Badge className="bg-primary/5 text-primary border-none px-2.5 py-1 text-[8px] font-black uppercase tracking-widest leading-none rounded-lg">
                            {cargo?.pool || 'SALAO'}
                          </Badge>
                          <span className="text-[10px] font-black text-muted-foreground/30 uppercase tracking-[0.2em] leading-none">{colab.setor}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right hidden sm:block">
                        <p className="text-[8px] font-black text-muted-foreground/40 uppercase tracking-widest leading-none mb-1.5">Acumulado</p>
                        <p className="font-black text-foreground text-sm leading-none flex items-center gap-1">
                          {totalPoints.toFixed(1)}
                          <span className="text-[9px] text-muted-foreground/40 font-bold uppercase">pts</span>
                        </p>
                      </div>
                      <div className={cn(
                        "h-12 w-12 rounded-2xl flex items-center justify-center transition-all bg-white shadow-lg border border-border/10",
                        isExpanded ? "bg-zinc-900 text-white rotate-180" : "text-muted-foreground/20"
                      )}>
                        <ChevronDown className="h-5 w-5" />
                      </div>
                    </div>
                  </div>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="border-t border-border/40 bg-zinc-50/50"
                      >
                        <div className="p-6">
                          <div className="grid grid-cols-6 gap-2 mb-8">
                            {days.map(day => {
                              const dateStr = format(day, 'yyyy-MM-dd');
                              const p = presencas.find(pres => pres.colaboradorId === colab.id && pres.data === dateStr);
                              const Icon = p ? STATUS_ICONS[p.status] : (day.getDay() === 0 || day.getDay() === 6 ? Coffee : UserX);
                              const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                              
                              return (
                                <button
                                  key={dateStr}
                                  onClick={() => handleTogglePresenca(colab.id, dateStr)}
                                  className={cn(
                                    "flex flex-col items-center justify-center gap-2 p-3 rounded-2xl transition-all active:scale-90 border",
                                    p ? `${STATUS_COLORS[p.status]} border-current/10 bg-white shadow-xl shadow-muted/20 ring-1 ring-white` 
                                      : 'bg-zinc-100/50 border-transparent text-zinc-300'
                                  )}
                                >
                                  <span className="text-[10px] font-black leading-none">{format(day, 'dd')}</span>
                                  <Icon className="h-4 w-4" />
                                </button>
                              );
                            })}
                          </div>
                          
                          <div className="flex flex-col sm:flex-row gap-4">
                            <div className="flex-1 bg-white p-5 rounded-[24px] border border-border/40 shadow-sm flex items-center justify-between">
                              <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest leading-none">Presenças</span>
                              <span className="text-xl font-black text-emerald-600 leading-none">{colabPresencasCount} DIAS</span>
                            </div>
                            <div className="flex-1 bg-white p-5 rounded-[24px] border border-border/40 shadow-sm flex items-center justify-between">
                              <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest leading-none">Acumulado</span>
                              <span className="text-xl font-black text-primary leading-none">{totalPoints.toFixed(1)} PTS</span>
                            </div>
                          </div>
                          
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="w-full mt-6 h-12 rounded-2xl text-[10px] font-black uppercase text-muted-foreground/40 hover:text-foreground hover:bg-white transition-all border border-transparent hover:border-border/40"
                            onClick={() => setExpandedColabId(null)}
                          >
                            Recolher Informações
                          </Button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>

          <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
            <div className="flex items-center gap-2 p-2 bg-white rounded-xl shadow-sm border border-zinc-100">
              <div className="h-6 w-6 bg-green-50 rounded-lg flex items-center justify-center"><UserCheck className="h-3 w-3 text-green-600" /></div>
              <span className="text-[10px] font-black text-zinc-600 uppercase">Presente</span>
            </div>
            <div className="flex items-center gap-2 p-2 bg-white rounded-xl shadow-sm border border-zinc-100">
              <div className="h-6 w-6 bg-red-50 rounded-lg flex items-center justify-center"><UserX className="h-3 w-3 text-red-600" /></div>
              <span className="text-[10px] font-black text-zinc-600 uppercase">Falta</span>
            </div>
            <div className="flex items-center gap-2 p-2 bg-white rounded-xl shadow-sm border border-zinc-100">
              <div className="h-6 w-6 bg-zinc-50 rounded-lg flex items-center justify-center"><Coffee className="h-3 w-3 text-zinc-500" /></div>
              <span className="text-[10px] font-black text-zinc-600 uppercase">Folga</span>
            </div>
            <div className="flex items-center gap-2 p-2 bg-white rounded-xl shadow-sm border border-zinc-100">
              <div className="h-6 w-6 bg-blue-50 rounded-lg flex items-center justify-center"><Plane className="h-3 w-3 text-blue-600" /></div>
              <span className="text-[10px] font-black text-zinc-600 uppercase">Férias</span>
            </div>
            <div className="flex items-center gap-2 p-2 bg-white rounded-xl shadow-sm border border-zinc-100">
              <div className="h-6 w-6 bg-orange-50 rounded-lg flex items-center justify-center"><Stethoscope className="h-3 w-3 text-orange-600" /></div>
              <span className="text-[10px] font-black text-zinc-600 uppercase">Afastado</span>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="distribuicao" className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex flex-col md:flex-row justify-between items-end gap-8 px-2">
            <div className="space-y-3">
              <div className="h-12 w-12 bg-primary/10 rounded-[18px] flex items-center justify-center text-primary shadow-lg shadow-primary/5 mb-2">
                <LayoutGrid className="h-6 w-6" />
              </div>
              <h3 className="text-3xl font-bold tracking-tight text-foreground">Relatório de Distribuição</h3>
              <p className="text-muted-foreground/60 text-xs font-bold uppercase tracking-widest">Resumo financeiro das transferências do ciclo</p>
            </div>
            <div className="flex gap-4">
              <Button 
                variant="outline" 
                size="sm" 
                className="gap-3 rounded-[18px] h-12 border-border/40 bg-white text-[10px] font-black uppercase tracking-widest px-8 shadow-2xl shadow-muted/20 hover:bg-muted transition-all ring-1 ring-border/5"
              >
                 <Download className="h-4 w-4 text-primary" /> Relatório Completo
              </Button>
            </div>
          </div>

          <Card className="border-border/40 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.12)] rounded-[40px] overflow-hidden bg-white ring-1 ring-border/5">
            <div className="overflow-x-auto custom-scrollbar">
              <div className="min-w-[850px]">
                {/* Custom Header to match the grid structure */}
                <div className="bg-muted/30 border-b border-border/40 flex items-center h-20">
                  <div 
                    className="w-[280px] shrink-0 cursor-pointer hover:text-primary transition-all px-10 border-r border-border/10 sticky left-0 bg-muted/30 z-20"
                    onClick={() => setSortDist({ 
                      key: 'colaborador', 
                      direction: sortDist.key === 'colaborador' && sortDist.direction === 'asc' ? 'desc' : 'asc' 
                    })}
                  >
                    <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.2em] whitespace-nowrap">
                      Beneficiário
                      {sortDist.key === 'colaborador' && (sortDist.direction === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)}
                    </div>
                  </div>
                  <div className="flex-1 min-w-[200px] text-[10px] font-black uppercase tracking-[0.2em] whitespace-nowrap px-6">Cargo & Departamento</div>
                  <div className="w-[150px] shrink-0 text-center text-[10px] font-black uppercase tracking-[0.2em] whitespace-nowrap px-6">Produção Bruta</div>
                  <div 
                    className="w-[220px] shrink-0 text-right cursor-pointer hover:text-primary transition-all px-10"
                    onClick={() => setSortDist({ 
                      key: 'valor', 
                      direction: sortDist.key === 'valor' && sortDist.direction === 'asc' ? 'desc' : 'asc' 
                    })}
                  >
                    <div className="flex items-center justify-end gap-3 text-[10px] font-black uppercase tracking-[0.2em] text-primary whitespace-nowrap">
                      Provento Final
                      {sortDist.key === 'valor' && (sortDist.direction === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)}
                    </div>
                  </div>
                </div>

                {distribuicaoData.length > 0 ? (
                  <VirtualList
                    height={Math.min(distribuicaoData.length * 96, 600)}
                    rowCount={distribuicaoData.length}
                    rowHeight={96}
                    width="100%"
                    className="custom-scrollbar"
                    rowComponent={DistributionRow}
                    rowProps={{}}
                  />
                ) : (
                  <div className="text-center py-32 h-64 border-b border-border/40">
                    <div className="flex flex-col items-center gap-6">
                      <div className="h-20 w-20 bg-muted/30 rounded-full flex items-center justify-center text-muted-foreground/20">
                        <Calculator className="h-10 w-10" />
                      </div>
                      <div className="space-y-1">
                        <p className="font-black text-sm uppercase tracking-widest text-muted-foreground">Ciclo não processado</p>
                        <p className="text-xs text-muted-foreground/40 font-medium">Os dados de distribuição aparecerão após o recálculo.</p>
                      </div>
                      <Button onClick={handleRecalcular} variant="outline" className="rounded-[18px] font-black text-[10px] uppercase tracking-widest h-12 border-primary/20 text-primary hover:bg-primary/5 px-8 shadow-lg shadow-primary/5">Recalcular Ciclo</Button>
                    </div>
                  </div>
                )}

                {calculos.length > 0 && (
                  <div className="bg-muted/40 border-t-2 border-border/40 backdrop-blur-sm flex items-center h-24">
                    <div className="flex-1 text-right font-black text-[11px] uppercase tracking-[0.2em] text-muted-foreground pr-10">Total Projetado para Distribuição</div>
                    <div className="w-[220px] shrink-0 text-right px-10">
                      <div className="flex flex-col items-end">
                        <span className="text-2xl font-mono font-semibold text-primary tracking-tighter">
                          R$ {calculos.reduce((acc, c) => acc + c.valorFinal, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                        <span className="text-[10px] font-black text-primary/40 uppercase tracking-[0.3em] mt-1 italic">Consolidado Mensal</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
