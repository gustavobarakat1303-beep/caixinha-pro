import React, { useEffect, useState } from 'react';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { collection, onSnapshot, query, where, orderBy, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ArrecadacaoDiaria, CalculoMensal, Competencia, Colaborador, PresencaDiaria, Configuracao, Unit, Cargo } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  BarChart, Bar, Cell, PieChart, Pie, AreaChart, Area
} from 'recharts';
import { TrendingUp, Users, Coins, Percent, ArrowUpRight, ArrowDownRight, Wallet, Calendar, PieChart as PieChartIcon } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion } from 'motion/react';
import { Badge } from './ui/badge';

export default function Dashboard() {
  const { profile, isAdmin } = useAuth();
  const [competencias, setCompetencias] = useState<Competencia[]>([]);
  const [selectedCompId, setSelectedCompId] = useState<string>('');
  const [arrecadacoes, setArrecadacoes] = useState<ArrecadacaoDiaria[]>([]);
  const [calculos, setCalculos] = useState<CalculoMensal[]>([]);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [presencas, setPresencas] = useState<PresencaDiaria[]>([]);
  const [config, setConfig] = useState<Configuracao | null>(null);
  const [unit, setUnit] = useState<Unit | null>(null);

  useEffect(() => {
    let q = query(collection(db, 'competencias'));
    
    // Filtro por unidade se o usuario nao tiver acesso total
    if (profile?.unitId && profile.unitId !== 'ALL') {
      q = query(collection(db, 'competencias'), where('unitId', '==', profile.unitId));
    }

    const unsubCargos = onSnapshot(collection(db, 'cargos'), (snap) => {
      const cargosList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Cargo));
      setCargos(cargosList);
    });

    const unsubComp = onSnapshot(q, (snapshot) => {
      const comps = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Competencia))
        .sort((a, b) => b.label.localeCompare(a.label));
      setCompetencias(comps);
      setSelectedCompId(currentSelectedCompId => {
        if (currentSelectedCompId && comps.some(comp => comp.id === currentSelectedCompId)) {
          return currentSelectedCompId;
        }
        return comps[0]?.id ?? '';
      });
    });

    return () => {
      unsubCargos();
      unsubComp();
    };
  }, [profile?.unitId]);

  useEffect(() => {
    if (!selectedCompId) return;

    const unsubArrec = onSnapshot(query(collection(db, 'arrecadacoes'), where('competenciaId', '==', selectedCompId), orderBy('data')), (snap) => {
      setArrecadacoes(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }) as ArrecadacaoDiaria));
    });

    const unsubCalc = onSnapshot(query(collection(db, 'calculos'), where('competenciaId', '==', selectedCompId)), (snap) => {
      setCalculos(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }) as CalculoMensal));
    });

    // Filtro por unidade para colaboradores se aplicavel
    let qColab = query(collection(db, 'colaboradores'));
    if (profile?.unitId && profile.unitId !== 'ALL') {
      qColab = query(collection(db, 'colaboradores'), where('unitId', '==', profile.unitId));
    }
    const unsubColab = onSnapshot(qColab, (snap) => {
      setColaboradores(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Colaborador)));
    });

    const unsubPres = onSnapshot(query(collection(db, 'presencas'), where('competenciaId', '==', selectedCompId)), (snap) => {
      setPresencas(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }) as PresencaDiaria));
    });

    const unsubConfig = onSnapshot(query(collection(db, 'configuracoes'), where('competenciaId', '==', selectedCompId)), (snap) => {
      if (!snap.empty) {
        setConfig(snap.docs[0].data() as Configuracao);
      } else {
        setConfig(null);
      }
    });

    // Fetch unit info
    const currentComp = competencias.find(c => c.id === selectedCompId);
    let unsubUnit = () => {};
    if (currentComp?.unitId) {
      unsubUnit = onSnapshot(doc(db, 'units', currentComp.unitId), (snap) => {
        if (snap.exists()) {
          setUnit({ id: snap.id, ...snap.data() } as Unit);
        } else {
          setUnit(null);
        }
      });
    }

    return () => {
      unsubArrec();
      unsubCalc();
      unsubColab();
      unsubPres();
      unsubConfig();
      unsubUnit();
    };
  }, [selectedCompId]);

  const totalBruto = arrecadacoes.reduce((sum, a) => sum + a.valorBruto, 0);
  
  // Use retention from config or fallback to 0.33
  const retencao = config?.retencaoEncargos ?? 0.33;
  const totalLiquido = arrecadacoes.reduce((sum, a) => sum + (a.valorBruto * (1 - retencao)), 0);
  
  const totalDistribuido = calculos.reduce((sum, c) => sum + c.valorFinal, 0);
  
  // Split logic
  const percentSalao = config?.percentualPoolSalao ?? 0.8;
  const percentCozinha = config?.percentualPoolCozinha ?? 0.2;
  const totalP = percentSalao + percentCozinha;
  const propSalao = totalP > 0 ? percentSalao / totalP : 0;
  const propCozinha = totalP > 0 ? percentCozinha / totalP : 0;

  const chartData = arrecadacoes.map(a => {
    const liquidoDia = a.valorBruto * (1 - retencao);
    const presencasDia = presencas.filter(p => p.data === a.data && p.status === 'PRESENTE');
    
    // Points by sector
    const pontosSalao = presencasDia.reduce((sum, p) => {
      const col = colaboradores.find(c => c.id === p.colaboradorId);
      if (!col) return sum;
      const cargo = cargos.find(cg => cg.id === col.cargoId);
      return cargo?.pool === 'COZINHA' ? sum : sum + p.pontosDoDia;
    }, 0);
    const pontosCozinha = presencasDia.reduce((sum, p) => {
      const col = colaboradores.find(c => c.id === p.colaboradorId);
      if (!col) return sum;
      const cargo = cargos.find(cg => cg.id === col.cargoId);
      return cargo?.pool === 'COZINHA' ? sum + p.pontosDoDia : sum;
    }, 0);

    const valorPontoSalao = pontosSalao > 0 ? (liquidoDia * propSalao) / pontosSalao : 0;
    const valorPontoCozinha = pontosCozinha > 0 ? (liquidoDia * propCozinha) / pontosCozinha : 0;
    
    return {
      data: a.data.split('-')[2],
      valor: liquidoDia,
      valorPontoSalao,
      valorPontoCozinha
    };
  });

  const mediaPorColab = calculos.length > 0 ? totalLiquido / calculos.length : 0;

  // Calculate current point values (average for the period)
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

  const valorPontoSalaoMedio = totalPontosSalao > 0 ? (totalLiquido * propSalao) / totalPontosSalao : 0;
  const valorPontoCozinhaMedio = totalPontosCozinha > 0 ? (totalLiquido * propCozinha) / totalPontosCozinha : 0;

  // Aggregate Data per sector
  const getSectorData = (pool: 'SALAO' | 'COZINHA') => {
    const sectorCalculos = calculos.filter(c => {
      const colab = colaboradores.find(col => col.id === c.colaboradorId);
      if (!colab) return false;
      const cargo = cargos.find(cg => cg.id === colab.cargoId);
      return cargo?.pool === pool;
    });

    const totalDistributed = sectorCalculos.reduce((sum, c) => sum + c.valorFinal, 0);
    const totalPoints = sectorCalculos.reduce((sum, c) => sum + c.totalPontos, 0);
    const collaboratorCount = sectorCalculos.length;
    const avgPerPerson = collaboratorCount > 0 ? totalDistributed / collaboratorCount : 0;
    const pointValue = pool === 'COZINHA' ? valorPontoCozinhaMedio : valorPontoSalaoMedio;

    return {
      totalDistributed,
      totalPoints,
      collaboratorCount,
      avgPerPerson,
      pointValue
    };
  };

  const salaoStats = getSectorData('SALAO');
  const cozinhaStats = getSectorData('COZINHA');

  const comp = competencias.find(c => c.id === selectedCompId);
  const monthName = comp ? format(new Date(comp.ano, comp.mes - 1), 'MMMM', { locale: ptBR }) : '';
  const yearName = comp ? comp.ano : '';

  const kpis = [
    {
      title: 'Total Arrecadado',
      value: `R$ ${totalBruto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      description: 'Acumulado bruto do mês',
      icon: TrendingUp,
      className: 'lg:col-span-3 bg-white border border-border/20 shadow-[0_24px_48px_-12px_rgba(0,0,0,0.03)] hover:shadow-2xl transition-all duration-700',
      iconClassName: 'text-primary',
      valueClassName: 'text-4xl text-primary font-black tracking-tight',
      descClassName: 'text-zinc-600 font-medium'
    },
    {
      title: 'Líquido p/ Equipe',
      value: `R$ ${totalLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      description: `Retenção de ${(retencao * 100).toFixed(0)}% aplicada`,
      icon: Wallet,
      className: 'lg:col-span-3 bg-zinc-900 text-white border-none shadow-2xl shadow-black/20 hover:scale-[1.01] transition-all duration-700',
      iconClassName: 'text-white/20',
      valueClassName: 'text-4xl text-white font-black tracking-tight',
      descClassName: 'text-white/60 font-medium'
    },
    {
      title: 'Média p/ Pessoa',
      value: `R$ ${mediaPorColab.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
      description: `${calculos.length} colaboradores ativos`,
      icon: Users,
      className: 'lg:col-span-2 bg-white border border-border/20 shadow-sm',
      iconClassName: 'text-zinc-400',
      valueClassName: 'text-2xl text-foreground font-black tracking-tight',
      descClassName: 'text-zinc-600 font-medium'
    },
    {
      title: 'Vlr Ponto Salão',
      value: `R$ ${valorPontoSalaoMedio.toLocaleString('pt-BR', { minimumFractionDigits: 4 })}`,
      description: `Pool: ${(propSalao * 100).toFixed(0)}% fixo`,
      icon: Percent,
      className: 'lg:col-span-2 bg-white border border-border/20 shadow-sm',
      iconClassName: 'text-zinc-400',
      valueClassName: 'text-2xl font-mono text-zinc-900 font-black tracking-tighter',
      descClassName: 'text-zinc-600 font-medium'
    },
    {
      title: 'Vlr Ponto Cozinha',
      value: `R$ ${valorPontoCozinhaMedio.toLocaleString('pt-BR', { minimumFractionDigits: 4 })}`,
      description: `Pool: ${(propCozinha * 100).toFixed(0)}% fixo`,
      icon: Percent,
      className: 'lg:col-span-2 bg-white border border-border/20 shadow-sm',
      iconClassName: 'text-zinc-400',
      valueClassName: 'text-2xl font-mono text-zinc-900 font-black tracking-tighter',
      descClassName: 'text-zinc-600 font-medium'
    }
  ];

  const pointsKpis = [
    {
      title: 'Pontos Salão (Total)',
      value: totalPontosSalao.toFixed(1),
      description: 'Somatória dos pesos ativos',
      icon: Coins,
      className: 'bg-white border border-border/20',
      iconClassName: 'text-zinc-400'
    },
    {
      title: 'Pontos Cozinha (Total)',
      value: totalPontosCozinha.toFixed(1),
      description: 'Somatória dos pesos ativos',
      icon: Coins,
      className: 'bg-white border border-border/20',
      iconClassName: 'text-zinc-400'
    }
  ];

  return (
    <div className="space-y-12 pb-20 pt-4">
      {/* Context Action Bar */}
      <section className="flex flex-col md:flex-row md:items-center justify-between gap-8 pb-10 border-b border-border/40">
        <div className="flex items-center gap-10 flex-1 min-w-0">
          {unit?.logoUrl ? (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="h-20 w-40 bg-white rounded-[24px] border border-border flex items-center justify-center shrink-0 shadow-sm ring-1 ring-black/[0.02] p-5"
            >
              <img 
                src={unit.logoUrl} 
                alt={unit.name} 
                className="h-full w-full object-contain"
                referrerPolicy="no-referrer"
              />
            </motion.div>
          ) : (
             <div className="h-20 w-20 bg-primary/5 rounded-[24px] border border-primary/10 flex items-center justify-center text-primary shrink-0 transition-transform hover:scale-105">
                <PieChartIcon className="h-10 w-10" />
             </div>
          )}
          <div className="space-y-2 flex-1 min-w-0">
            <div className="flex flex-wrap items-end gap-5">
              <motion.h2 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-5xl font-black text-foreground capitalize tracking-tighter"
              >
                {monthName} <span className="text-primary/60 font-light font-heading">{yearName}</span>
              </motion.h2>
              {unit && (
                <Badge className="bg-zinc-900 text-white border-none rounded-full px-4 py-1 text-[10px] font-bold uppercase tracking-wider mb-2 shadow-lg">
                  {unit.name}
                </Badge>
              )}
            </div>
            <motion.p 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="text-zinc-500 font-bold text-[11px] uppercase tracking-[0.3em] ml-1"
            >
               Performance & Distribuição Analítica
            </motion.p>
          </div>
        </div>
        
        <motion.div 
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-6 bg-white p-2.5 rounded-[32px] shadow-2xl shadow-muted/10 border border-border/10 ring-1 ring-black/[0.01]"
        >
          <div className="h-14 w-14 bg-muted/30 rounded-[24px] flex items-center justify-center shrink-0">
            <Calendar className="h-6 w-6 text-zinc-400" />
          </div>
          <div className="space-y-0.5 pr-6">
            <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest px-1">Período Operacional</label>
            <Select value={selectedCompId} onValueChange={setSelectedCompId}>
              <SelectTrigger className="w-full md:w-[240px] border-none focus:ring-0 shadow-none font-bold text-lg text-foreground bg-transparent h-8 capitalize p-1 tracking-tight">
                <SelectValue placeholder="Selecionar Ciclo">
                   {comp ? format(new Date(comp.ano, comp.mes - 1), 'MMMM yyyy', { locale: ptBR }) : undefined}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="rounded-[32px] border-border/40 shadow-2xl p-3 bg-white/95 backdrop-blur-xl ring-1 ring-black/5">
                {competencias.map(c => (
                  <SelectItem key={c.id} value={c.id} className="capitalize py-3.5 px-6 rounded-2xl focus:bg-muted font-bold text-sm tracking-tight transition-all mb-1 last:mb-0">
                    {format(new Date(c.ano, c.mes - 1), 'MMMM yyyy', { locale: ptBR })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </motion.div>
      </section>

      {/* KPI Grid */}
      <section className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-6">
          {kpis.map((kpi, idx) => (
            <motion.div
              key={kpi.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              whileHover={{ y: -4 }}
              className={cn(
                "rounded-[36px] overflow-hidden shadow-sm ring-1 ring-border/5",
                kpi.className
              )}
            >
              <div className="p-8 flex flex-col h-full group">
                <div className="flex items-center justify-between mb-8">
                  <div className={cn(
                    "p-3.5 rounded-2xl transition-all group-hover:scale-110 shadow-sm",
                    kpi.className.includes('bg-primary') ? 'bg-white/10 border border-white/10' : 'bg-muted/50 border border-border/10'
                  )}>
                    <kpi.icon className={cn("h-6 w-6", kpi.iconClassName)} />
                  </div>
                  <span className={cn(
                    "text-[9px] uppercase font-bold tracking-widest px-3 py-1.5 rounded-full ring-1", 
                    kpi.className.includes('bg-primary') ? 'text-white/80 ring-white/10' : 'text-zinc-600 ring-border/20'
                  )}>
                    {kpi.title}
                  </span>
                </div>
                
                <div className="mt-auto">
                  <div className={cn(
                    "leading-none mb-3",
                    kpi.valueClassName
                  )}>
                    {kpi.value}
                  </div>
                  <p className={cn("text-[10px] font-bold uppercase tracking-wider", kpi.descClassName)}>
                    {kpi.description}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {pointsKpis.map((kpi, idx) => (
            <motion.div
              key={kpi.title}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: (idx + kpis.length) * 0.05 }}
              className={cn(
                "bg-white border border-border/10 shadow-sm rounded-[36px] overflow-hidden p-8 flex items-center justify-between group transition-all hover:shadow-xl hover:shadow-muted/20",
                kpi.className
              )}
            >
              <div className="space-y-4">
                <div className="space-y-1">
                   <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3 leading-none">{kpi.title}</p>
                   <p className="font-mono text-4xl font-black tracking-tighter text-foreground leading-none">{kpi.value}</p>
                </div>
                <div className="flex items-center gap-2">
                   <div className="h-2 w-2 rounded-full bg-emerald-500/60 ring-2 ring-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.3)]" />
                   <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 leading-none">{kpi.description}</p>
                </div>
              </div>
              <div className="bg-muted/25 group-hover:bg-primary/5 transition-all p-8 rounded-[24px] border border-border/10 shadow-inner">
                 <kpi.icon className={cn("h-8 w-8 transition-transform group-hover:scale-110", kpi.iconClassName)} />
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Main Charts */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="lg:col-span-8 h-full"
        >
          <Card className="border border-border/20 shadow-2xl shadow-black/[0.02] rounded-[32px] overflow-hidden bg-white ring-1 ring-black/[0.01] flex flex-col h-full hover:shadow-black/5 transition-all duration-500">
            <CardHeader className="p-10 pb-6 border-b border-border/10 bg-zinc-50/30">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-zinc-900 rounded-xl flex items-center justify-center text-white shadow-lg">
                      <TrendingUp className="h-5 w-5" />
                    </div>
                    <CardTitle className="text-3xl font-black tracking-tighter text-zinc-900">Matriz de Performance</CardTitle>
                  </div>
                  <CardDescription className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.4em] ml-1">Oscilação histórica do valor do ponto</CardDescription>
                </div>
                <div className="flex items-center gap-2 bg-muted/40 p-1.5 rounded-[18px] border border-border/40">
                  <div className="flex items-center gap-2.5 px-4 py-2 bg-white rounded-[14px] shadow-sm border border-border/20">
                    <div className="h-2 w-2 rounded-full bg-primary" />
                    <span className="text-[9px] font-black uppercase text-zinc-900 tracking-[0.2em]">Salão</span>
                  </div>
                  <div className="flex items-center gap-2.5 px-4 py-2 bg-white rounded-[14px] shadow-sm border border-border/20">
                    <div className="h-2 w-2 rounded-full bg-accent" />
                    <span className="text-[9px] font-black uppercase text-zinc-900 tracking-[0.2em]">Cozinha</span>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-10 pt-8 flex-1 flex flex-col min-h-[350px] md:min-h-[480px]">
              {arrecadacoes.length > 0 ? (
                <div className="flex-1 w-full relative">
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border/10 to-transparent" />
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorSalao" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.12}/>
                          <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorCozinha" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="var(--accent)" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="10 10" vertical={false} stroke="var(--border)" strokeOpacity={0.4} />
                      <XAxis 
                        dataKey="data" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 10, fill: 'var(--foreground)', fontWeight: 800, opacity: 0.6 }}
                        dy={20}
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fontSize: 10, fill: 'var(--foreground)', fontWeight: 800, opacity: 0.6 }}
                        tickFormatter={(val) => `R$ ${val}`}
                        dx={-15}
                      />
                      <Tooltip 
                        cursor={{ stroke: 'var(--primary)', strokeWidth: 1, strokeDasharray: '8 8', opacity: 0.2 }}
                        content={({ active, payload, label }) => {
                          if (active && payload && payload.length) {
                            return (
                              <div className="bg-white/95 backdrop-blur-2xl border border-border/10 p-7 rounded-[32px] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] space-y-6 min-w-[280px] ring-1 ring-black/[0.04] animate-in fade-in zoom-in duration-300">
                                <div className="flex items-center gap-4 border-b border-zinc-100 pb-5">
                                  <div className="h-12 w-12 rounded-[20px] bg-zinc-50 flex items-center justify-center text-zinc-300 shadow-inner">
                                    <Calendar className="h-6 w-6" />
                                  </div>
                                  <div>
                                    <p className="text-[10px] font-black uppercase text-zinc-300 tracking-[0.2em] leading-none mb-1.5">Métrica Diária</p>
                                    <p className="text-sm font-black text-zinc-900 uppercase tracking-wider leading-none">Dia {label} • {monthName}</p>
                                  </div>
                                </div>
                                <div className="space-y-5">
                                  <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2.5">
                                        <div className="h-2 w-2 rounded-full bg-primary" />
                                        <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-[0.2em] leading-none">Valor Ponto Salão</span>
                                      </div>
                                    </div>
                                    <div className="text-3xl font-black text-primary tracking-tighter leading-none tabular-nums">R$ {payload[0].value?.toLocaleString('pt-BR', { minimumFractionDigits: 4 })}</div>
                                  </div>
                                  <div className="space-y-2 pt-2 border-t border-zinc-50">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2.5">
                                        <div className="h-2 w-2 rounded-full bg-accent" />
                                        <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-[0.2em] leading-none">Valor Ponto Cozinha</span>
                                      </div>
                                    </div>
                                    <div className="text-3xl font-black text-foreground tracking-tighter leading-none tabular-nums">R$ {payload[1].value?.toLocaleString('pt-BR', { minimumFractionDigits: 4 })}</div>
                                  </div>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="valorPontoSalao" 
                        stroke="var(--primary)" 
                        strokeWidth={4} 
                        fillOpacity={1} 
                        fill="url(#colorSalao)" 
                        activeDot={{ r: 6, strokeWidth: 0, fill: 'var(--primary)' }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="valorPontoCozinha" 
                        stroke="var(--accent)" 
                        strokeWidth={4} 
                        fillOpacity={1} 
                        fill="url(#colorCozinha)" 
                        activeDot={{ r: 6, strokeWidth: 0, fill: 'var(--accent)' }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground/10 space-y-6">
                  <div className="h-24 w-24 bg-muted/20 rounded-[40px] flex items-center justify-center shadow-inner">
                    <Calendar className="h-10 w-10" />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-[0.4em] opacity-40">Aguardando dados consolidados</p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
           initial={{ opacity: 0, x: 30 }}
           animate={{ opacity: 1, x: 0 }}
           transition={{ delay: 0.4 }}
           className="lg:col-span-4 h-full"
        >
          <Card className="border border-border/10 shadow-2xl shadow-muted/20 rounded-[40px] overflow-hidden bg-primary text-primary-foreground border-none h-full relative group/card transition-all duration-700 hover:shadow-primary/30">
            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-white/[0.04] rounded-full blur-[120px] -mr-[300px] -mt-[300px] group-hover/card:bg-white/[0.06] transition-colors duration-1000" />
            <CardHeader className="p-10 pb-4 relative z-10">
               <CardTitle className="text-3xl font-black text-white tracking-tight leading-none">Consolidação de Pools</CardTitle>
               <CardDescription className="text-white/60 font-bold text-[10px] uppercase tracking-[0.4em] mt-4 leading-none mb-4">Sumário operacional por setor</CardDescription>
            </CardHeader>
            <CardContent className="p-10 space-y-12 relative z-10 flex flex-col h-[calc(100%-110px)]">
               <div className="space-y-8 bg-black/20 p-8 rounded-[32px] border border-white/10 shadow-inner backdrop-blur-sm">
                  <div className="flex items-center justify-between">
                     <div className="flex items-center gap-3">
                        <div className="h-2 w-2 rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,1)]" />
                        <span className="text-[11px] font-black uppercase tracking-[0.3em] text-white/80 leading-none mb-0.5">Métrica Salão</span>
                     </div>
                     <Badge className="bg-white/20 text-white border-white/20 rounded-lg px-3 py-1 font-mono font-bold text-[10px] tracking-tight">{(propSalao * 100).toFixed(0)}% SHARE</Badge>
                  </div>
                  <div className="h-3.5 bg-black/30 rounded-full overflow-hidden shadow-inner flex p-0.5 border border-white/10">
                     <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${propSalao * 100}%` }}
                        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                        className="h-full bg-white rounded-full shadow-[0_0_15px_rgba(255,255,255,0.4)]" 
                     />
                  </div>
                  <div className="grid grid-cols-2 gap-8">
                     <div className="space-y-2">
                        <p className="text-[10px] uppercase text-white/30 font-bold tracking-[0.3em] leading-none mb-1">Líquido Acumulado</p>
                        <p className="text-2xl font-black tracking-tight tabular-nums overflow-hidden text-ellipsis whitespace-nowrap">R$ {salaoStats.totalDistributed.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</p>
                     </div>
                     <div className="space-y-2">
                        <p className="text-[10px] uppercase text-white/30 font-bold tracking-[0.3em] leading-none mb-1">Efetivo Ativo</p>
                        <p className="text-2xl font-black tracking-tight tabular-nums">{salaoStats.collaboratorCount} <span className="text-sm font-light text-white/40">pax</span></p>
                     </div>
                  </div>
               </div>

               <div className="space-y-8 bg-white/5 p-8 rounded-[32px] border border-white/5 shadow-inner backdrop-blur-sm">
                  <div className="flex items-center justify-between">
                     <div className="flex items-center gap-3">
                        <div className="h-2 w-2 rounded-full bg-accent shadow-[0_0_12px_rgba(var(--accent),1)]" />
                        <span className="text-[11px] font-black uppercase tracking-[0.3em] text-white/50 leading-none mb-0.5">Métrica Cozinha</span>
                     </div>
                     <Badge className="bg-white/10 text-white border-white/10 rounded-lg px-3 py-1 font-mono font-bold text-[10px] tracking-tight">{(propCozinha * 100).toFixed(0)}% SHARE</Badge>
                  </div>
                  <div className="h-3.5 bg-black/20 rounded-full overflow-hidden shadow-inner flex p-0.5 border border-white/5">
                     <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${propCozinha * 100}%` }}
                        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
                        className="h-full bg-accent rounded-full shadow-[0_0_15px_rgba(var(--accent),0.4)]" 
                     />
                  </div>
                  <div className="grid grid-cols-2 gap-8">
                     <div className="space-y-2">
                        <p className="text-[10px] uppercase text-white/30 font-bold tracking-[0.3em] leading-none mb-1">Líquido Acumulado</p>
                        <p className="text-2xl font-black tracking-tight tabular-nums overflow-hidden text-ellipsis whitespace-nowrap">R$ {cozinhaStats.totalDistributed.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</p>
                     </div>
                     <div className="space-y-2">
                        <p className="text-[10px] uppercase text-white/30 font-bold tracking-[0.3em] leading-none mb-1">Efetivo Ativo</p>
                        <p className="text-2xl font-black tracking-tight tabular-nums">{cozinhaStats.collaboratorCount} <span className="text-sm font-light text-white/40">pax</span></p>
                     </div>
                  </div>
               </div>

               <div className="pt-10 border-t border-white/10 mt-auto">
                  <div className="bg-gradient-to-br from-white/[0.05] to-transparent rounded-[32px] p-8 space-y-4 border border-white/5 shadow-xl backdrop-blur-md relative group/footer">
                     <div className="absolute inset-0 bg-white/[0.02] rounded-[32px] opacity-0 group-hover/footer:opacity-100 transition-opacity" />
                     <div className="flex items-center gap-3 mb-2 relative">
                       <div className="h-1.5 w-1.5 rounded-full bg-white/30" />
                       <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.4em] leading-none mb-0.5">Residual de Arredondamento</p>
                     </div>
                     <p className="text-4xl font-black text-white tracking-tighter tabular-nums relative">R$ {Math.abs(totalLiquido - totalDistribuido).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                     <p className="text-[9px] font-bold text-white/10 uppercase tracking-[0.2em] relative">Equilíbrio Fiscal Operacional</p>
                  </div>
               </div>
            </CardContent>
          </Card>
        </motion.div>
      </section>
    </div>
  );
}
