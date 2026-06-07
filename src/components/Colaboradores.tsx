import React, { useEffect, useState } from 'react';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, where, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Colaborador, Cargo, StatusColaborador, Unit } from '../types';
import { normalizeDataForFirestore, normalizeToUppercase } from '../lib/normalization';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Plus, Search, UserPlus, Filter, Edit2, UserCheck, UserMinus, FileUp, Download, Trash2, X, Users as UsersIcon, Building2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { logAudit } from '../services/calculationService';
import { ConfirmModal } from './ConfirmModal';
import { Badge } from './ui/badge';
import { parseExcelFile, downloadTemplate, normalizeString, getRowValue, parseExcelDate } from '../services/excelService';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function Colaboradores() {
  const { profile } = useAuth();
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUnit, setSelectedUnit] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('nome');
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState<Partial<Colaborador>>({
    nome: '',
    nomeMae: '',
    cargoId: '',
    setor: '',
    endereco: '',
    bairro: '',
    cidade: '',
    status: 'ATIVO',
    pontosBase: 0,
    dataAdmissao: new Date().toISOString().split('T')[0],
    unitId: '',
    observacoes: ''
  });

  useEffect(() => {
    if (profile?.unitId && profile.unitId !== 'ALL') {
      setSelectedUnit(profile.unitId);
    }
  }, [profile?.unitId]);

  useEffect(() => {
    let qColabs = query(collection(db, 'colaboradores'));
    let qUnits = query(collection(db, 'units'));

    if (profile?.unitId && profile.unitId !== 'ALL') {
      qColabs = query(collection(db, 'colaboradores'), where('unitId', '==', profile.unitId));
      qUnits = query(collection(db, 'units'), where('__name__', '==', profile.unitId));
    }

    const unsubColabs = onSnapshot(qColabs, (snapshot) => {
      setColaboradores(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Colaborador)));
    });
    const unsubCargos = onSnapshot(collection(db, 'cargos'), (snapshot) => {
      setCargos(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Cargo)));
    });
    const unsubUnits = onSnapshot(qUnits, (snapshot) => {
      setUnits(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Unit)));
    });
    return () => {
      unsubColabs();
      unsubCargos();
      unsubUnits();
    };
  }, [profile?.unitId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nome || !formData.cargoId || !formData.unitId) {
      toast.error('Preencha os campos obrigatórios');
      return;
    }

    setLoading(true);
    try {
      const normalizedFormData = normalizeDataForFirestore(formData, ['nome', 'nomeMae', 'setor', 'endereco', 'bairro', 'cidade', 'observacoes']);
      
      if (editingId) {
        const old = colaboradores.find(c => c.id === editingId);
        await updateDoc(doc(db, 'colaboradores', editingId), {
          ...normalizedFormData,
          updatedAt: new Date().toISOString()
        });
        await logAudit('COLABORADORES', 'UPDATE', 'Colaborador', editingId, old, normalizedFormData);
        toast.success('Colaborador atualizado com sucesso');
      } else {
        const docRef = await addDoc(collection(db, 'colaboradores'), {
          ...normalizedFormData,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        await logAudit('COLABORADORES', 'CREATE', 'Colaborador', docRef.id, null, normalizedFormData);
        toast.success('Colaborador cadastrado com sucesso');
      }
      setIsAdding(false);
      setEditingId(null);
      setFormData({
        nome: '',
        nomeMae: '',
        cargoId: '',
        setor: '',
        endereco: '',
        bairro: '',
        cidade: '',
        status: 'ATIVO',
        pontosBase: 0,
        dataAdmissao: new Date().toISOString().split('T')[0],
        unitId: '',
        observacoes: ''
      });
    } catch (error) {
      toast.error('Erro ao salvar colaborador');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (colab: Colaborador) => {
    setFormData({
      ...colab,
      nomeMae: colab.nomeMae || '',
      endereco: colab.endereco || '',
      bairro: colab.bairro || '',
      cidade: colab.cidade || '',
      observacoes: colab.observacoes || ''
    });
    setEditingId(colab.id);
    setIsAdding(true);
  };

  const handleToggleStatus = async (colab: Colaborador) => {
    const newStatus: StatusColaborador = colab.status === 'ATIVO' ? 'INATIVO' : 'ATIVO';
    try {
      await updateDoc(doc(db, 'colaboradores', colab.id), { status: newStatus });
      await logAudit('COLABORADORES', 'UPDATE_STATUS', 'Colaborador', colab.id, { status: colab.status }, { status: newStatus });
      toast.success(`Colaborador ${newStatus === 'ATIVO' ? 'ativado' : 'inativado'}`);
    } catch (error) {
      toast.error('Erro ao alterar status');
    }
  };

  const handleDelete = async (id: string) => {
    setIsDeleting(true);
    try {
      const old = colaboradores.find(c => c.id === id);
      await deleteDoc(doc(db, 'colaboradores', id));
      await logAudit('COLABORADORES', 'DELETE', 'Colaborador', id, old, null);
      toast.success('Colaborador removido');
      setDeleteConfirmId(null);
    } catch (error) {
      toast.error('Erro ao remover');
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredColabs = colaboradores.filter(c => {
    const matchesSearch = c.nome.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (c.setor && c.setor.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesUnit = selectedUnit === 'all' || c.unitId === selectedUnit;
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchesSearch && matchesUnit && matchesStatus;
  }).sort((a,b) => {
    if (sortBy === 'nome') return a.nome.localeCompare(b.nome);
    if (sortBy === 'pontos') return b.pontosBase - a.pontosBase;
    
    if (sortBy === 'unit') {
      const unitA = units.find(u => u.id === a.unitId)?.name || '';
      const unitB = units.find(u => u.id === b.unitId)?.name || '';
      return unitA.localeCompare(unitB);
    }
    
    if (sortBy === 'cargo') {
      const cargoA = cargos.find(c => c.id === a.cargoId)?.nome || '';
      const cargoB = cargos.find(c => c.id === b.cargoId)?.nome || '';
      return cargoA.localeCompare(cargoB);
    }
    
    return a.nome.localeCompare(b.nome);
  });

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const result = await parseExcelFile<Partial<Colaborador>>(file, (row) => {
        const nome = getRowValue(row, ['Nome', 'Nome Completo', 'Colaborador']);
        const cargoNome = getRowValue(row, ['Cargo', 'Função', 'Ocupação']);
        const unidadeNome = getRowValue(row, ['Unidade', 'Loja', 'Filial']);
        const setor = getRowValue(row, ['Setor', 'Área', 'Departamento']) || '';
        const admissao = getRowValue(row, ['Admissão', 'Data Admissão', 'Entrada']);

        if (!nome) throw new Error('Coluna "Nome" não encontrada.');
        if (!cargoNome) throw new Error('Coluna "Cargo" não encontrada.');
        
        let unitId = '';
        if (unidadeNome) {
          const unit = units.find(u => normalizeString(u.name) === normalizeString(String(unidadeNome)));
          if (unit) unitId = unit.id;
          else throw new Error(`Unidade "${unidadeNome}" não cadastrada.`);
        } else if (selectedUnit !== 'all') {
          unitId = selectedUnit;
        } else {
          throw new Error('Selecione uma unidade no filtro ou adicione a coluna "Unidade".');
        }

        const cargo = cargos.find(c => normalizeString(c.nome) === normalizeString(String(cargoNome)));
        if (!cargo) throw new Error(`Cargo "${cargoNome}" não cadastrado.`);

        let dataAdmissao = new Date().toISOString().split('T')[0];
        const parsedDate = parseExcelDate(admissao);
        if (parsedDate) dataAdmissao = parsedDate.toISOString().split('T')[0];

        return {
          nome: normalizeToUppercase(String(nome)),
          cargoId: cargo.id,
          unitId: unitId,
          setor: normalizeToUppercase(String(setor)),
          pontosBase: cargo.pontosBase,
          status: 'ATIVO',
          dataAdmissao
        };
      });

      if (result.errors.length > 0) {
        toast.error(`${result.errors.length} erros na planilha. Verifique o console.`);
        console.error('Erros na importação:', result.errors);
      }

      let importedCount = 0;
      for (const colabData of result.data) {
        const exists = colaboradores.find(c => 
          c.nome.toLowerCase() === colabData.nome?.toLowerCase() && 
          c.unitId === colabData.unitId
        );
        
        if (!exists) {
          const docRef = await addDoc(collection(db, 'colaboradores'), {
            ...colabData,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
          await logAudit('COLABORADORES', 'IMPORT', 'Colaborador', docRef.id, null, colabData);
          importedCount++;
        }
      }

      if (importedCount > 0) toast.success(`${importedCount} colaboradores importados.`);
      else toast.info('Nenhum novo colaborador para importar.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao processar arquivo');
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-12 pb-14">
      {/* Action Area */}
      <section className="flex flex-col md:flex-row md:items-center justify-between gap-8 px-2 border-b border-border/40 pb-10">
        <div className="flex items-center gap-6">
           <motion.div 
             initial={{ scale: 0.8, opacity: 0 }}
             animate={{ scale: 1, opacity: 1 }}
             className="h-16 w-16 bg-primary rounded-[22px] flex items-center justify-center shadow-2xl shadow-primary/20 ring-4 ring-primary/5 relative"
           >
             <UsersIcon className="h-6 w-6 text-white" />
             <div className="absolute -bottom-1 -right-1 h-6 w-6 bg-white rounded-full flex items-center justify-center shadow-lg ring-2 ring-primary/5">
                <UserPlus className="h-3 w-3 text-primary" />
             </div>
           </motion.div>
           <div className="space-y-1">
            <motion.h2 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-3xl font-bold tracking-tight text-foreground"
            >
              Base Estratégica
            </motion.h2>
            <motion.p 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="text-muted-foreground/50 text-[9px] font-bold uppercase tracking-widest"
            >
              Gestão de capital humano e mérito referencial
            </motion.p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <Button 
            variant="outline" 
            onClick={() => downloadTemplate(['Nome', 'Cargo', 'Unidade', 'Setor', 'Admissão'], 'Template_Colaboradores')} 
            className="rounded-xl h-12 px-6 gap-2 border-border/40 bg-white text-[9px] font-bold uppercase tracking-widest shadow-sm hover:bg-muted transition-all"
          >
            <Download className="h-4 w-4 text-primary" />
            <span className="hidden sm:inline">Template</span>
          </Button>
          <div className="relative">
            <Button 
              variant="outline" 
              className="rounded-xl h-12 px-6 gap-2 border-border/40 bg-white text-[9px] font-bold uppercase tracking-widest shadow-sm hover:bg-muted transition-all"
            >
              <FileUp className="h-4 w-4 text-primary" />
              <span className="hidden sm:inline">Importar Base</span>
            </Button>
            <input 
              type="file" 
              accept=".xlsx, .xls" 
              className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed" 
              onChange={handleImportExcel}
              disabled={loading}
            />
          </div>
          <Button 
            onClick={() => { 
              setEditingId(null); 
              setFormData({ 
                nome: '', 
                nomeMae: '',
                cargoId: '', 
                setor: '', 
                endereco: '',
                bairro: '',
                cidade: '',
                status: 'ATIVO', 
                pontosBase: 0, 
                dataAdmissao: new Date().toISOString().split('T')[0], 
                unitId: '',
                observacoes: ''
              }); 
              setIsAdding(true); 
            }} 
            className="rounded-xl h-12 px-8 gap-2 bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20 font-bold text-[10px] uppercase tracking-widest transition-all active:scale-95"
          >
            <Plus className="h-4 w-4" />
            Novo Registro
          </Button>
        </div>
      </section>

      {/* Filters Section */}
      <Card className="border-border/40 shadow-inner bg-muted/30 rounded-[48px] overflow-hidden p-3 ring-1 ring-border/5">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="relative flex-1 group">
            <Search className="absolute left-8 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground/40 group-focus-within:text-primary transition-all" />
            <Input 
              placeholder="Pesquisar por nome ou setor operacional..." 
              className="pl-16 h-20 bg-white border-none rounded-[36px] focus:ring-0 transition-all font-semibold text-lg placeholder:text-muted-foreground/20 shadow-2xl shadow-muted/40"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex flex-col md:flex-row gap-3">
            <Select 
              value={selectedUnit} 
              onValueChange={setSelectedUnit}
              disabled={profile?.unitId && profile.unitId !== 'ALL'}
            >
              <SelectTrigger className="w-full lg:w-[280px] h-20 bg-white border-none rounded-[36px] focus:ring-0 transition-all font-semibold text-[11px] uppercase tracking-[0.2em] text-foreground shadow-2xl shadow-muted/40 px-8">
                <div className="flex items-center gap-4">
                  <Building2 className="h-5 w-5 text-primary" />
                  <SelectValue placeholder="Unidade" />
                </div>
              </SelectTrigger>
              <SelectContent className="rounded-[28px] p-2 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.12)] border-border/40 bg-white/95 backdrop-blur-xl">
                <SelectItem value="all" className="py-4 rounded-[18px] cursor-pointer font-black uppercase tracking-widest text-[10px] mb-1 focus:bg-primary/5 focus:text-primary">
                  Todas as Sedes
                </SelectItem>
                {units.map(u => (
                  <SelectItem key={u.id} value={u.id} className="py-4 rounded-[18px] cursor-pointer focus:bg-primary/5 focus:text-primary mb-1">
                    <span className="font-black uppercase tracking-widest text-[10px]">{u.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select 
              value={statusFilter} 
              onValueChange={setStatusFilter}
            >
              <SelectTrigger className="w-full lg:w-[200px] h-20 bg-white border-none rounded-[36px] focus:ring-0 transition-all font-semibold text-[11px] uppercase tracking-[0.2em] text-foreground shadow-2xl shadow-muted/40 px-8">
                <div className="flex items-center gap-4">
                  <Filter className="h-5 w-5 text-primary" />
                  <SelectValue placeholder="Status" />
                </div>
              </SelectTrigger>
              <SelectContent className="rounded-[28px] p-2 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.12)] border-border/40 bg-white/95 backdrop-blur-xl">
                <SelectItem value="all" className="py-4 rounded-[18px] cursor-pointer font-black uppercase tracking-widest text-[10px] mb-1 focus:bg-primary/5 focus:text-primary">Todos Status</SelectItem>
                <SelectItem value="ATIVO" className="py-4 rounded-[18px] cursor-pointer font-black uppercase tracking-widest text-[10px] mb-1 focus:bg-primary/5 focus:text-primary">Efetivados</SelectItem>
                <SelectItem value="INATIVO" className="py-4 rounded-[18px] cursor-pointer font-black uppercase tracking-widest text-[10px] mb-1 focus:bg-primary/5 focus:text-primary">Dispensados</SelectItem>
              </SelectContent>
            </Select>

            <Select 
              value={sortBy} 
              onValueChange={setSortBy}
            >
              <SelectTrigger className="w-full lg:w-[200px] h-20 bg-white border-none rounded-[36px] focus:ring-0 transition-all font-semibold text-[11px] uppercase tracking-[0.2em] text-foreground shadow-2xl shadow-muted/40 px-8">
                <div className="flex items-center gap-4">
                  <motion.div animate={{ rotate: sortBy === 'nome' ? 0 : 180 }}>
                    <UsersIcon className="h-5 w-5 text-primary" />
                  </motion.div>
                  <SelectValue placeholder="Ordenar" />
                </div>
              </SelectTrigger>
              <SelectContent className="rounded-[28px] p-2 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.12)] border-border/40 bg-white/95 backdrop-blur-xl">
                <SelectItem value="nome" className="py-4 rounded-[18px] cursor-pointer font-black uppercase tracking-widest text-[10px] mb-1 focus:bg-primary/5 focus:text-primary">Nome (A-Z)</SelectItem>
                <SelectItem value="unit" className="py-4 rounded-[18px] cursor-pointer font-black uppercase tracking-widest text-[10px] mb-1 focus:bg-primary/5 focus:text-primary">Unidade</SelectItem>
                <SelectItem value="cargo" className="py-4 rounded-[18px] cursor-pointer font-black uppercase tracking-widest text-[10px] mb-1 focus:bg-primary/5 focus:text-primary">Cargo</SelectItem>
                <SelectItem value="pontos" className="py-4 rounded-[18px] cursor-pointer font-black uppercase tracking-widest text-[10px] mb-1 focus:bg-primary/5 focus:text-primary">Maior Pontuação</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            className="relative z-50 px-2"
          >
            <Card className="border-border/40 shadow-[0_48px_96px_-24px_rgba(0,0,0,0.15)] rounded-[56px] overflow-hidden ring-1 ring-border/5 bg-white">
              <div className="bg-primary px-14 py-12 relative overflow-hidden">
                <motion.div 
                  initial={{ rotate: -15, scale: 0.5, opacity: 0 }}
                  animate={{ rotate: 0, scale: 1, opacity: 0.1 }}
                  className="absolute top-0 right-0 h-[400px] w-[400px] bg-white rounded-full -mr-48 -mt-48"
                />
                <div className="relative flex items-center justify-between">
                  <div className="space-y-3">
                    <CardTitle className="text-4xl font-bold tracking-tight text-white flex items-center gap-5">
                      <div className="h-14 w-14 bg-white/20 rounded-[22px] flex items-center justify-center backdrop-blur-md">
                        {editingId ? <Edit2 className="h-7 w-7" /> : <UserPlus className="h-7 w-7" />}
                      </div>
                      {editingId ? 'Editar Colaborador' : 'Novo Cadastro Corporativo'}
                    </CardTitle>
                    <p className="text-white/60 text-sm font-bold uppercase tracking-[0.2em] ml-20">Dados funcionais para processamento de proventos</p>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => { setIsAdding(false); setEditingId(null); }} 
                    className="text-white hover:bg-white/20 rounded-[28px] h-16 w-16 transition-all"
                  >
                    <X className="h-8 w-8" />
                  </Button>
                </div>
              </div>
              <CardContent className="p-14">
                <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-x-12 gap-y-10">
                  <div className="space-y-4">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 ml-2">Nome Civil Completo</label>
                    <Input 
                      value={formData.nome}
                      onChange={e => setFormData({ ...formData, nome: e.target.value })}
                      placeholder="Identificação nominal"
                      className="h-20 border-border/40 rounded-2xl font-semibold text-xl px-8 focus:ring-0 shadow-inner bg-muted/10 transition-all focus:bg-white focus:border-primary/20"
                    />
                  </div>
                  <div className="space-y-4">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 ml-2">Nome da Mãe</label>
                    <Input 
                      value={formData.nomeMae}
                      onChange={e => setFormData({ ...formData, nomeMae: e.target.value })}
                      placeholder="Nome completo da mãe"
                      className="h-20 border-border/40 rounded-2xl font-semibold text-xl px-8 focus:ring-0 shadow-inner bg-muted/10 transition-all focus:bg-white focus:border-primary/20"
                    />
                  </div>
                  <div className="space-y-4">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 ml-2">Unidade de Lotação</label>
                    <Select 
                      value={formData.unitId} 
                      onValueChange={v => setFormData({ ...formData, unitId: v })}
                    >
                      <SelectTrigger className="h-20 border-border/40 rounded-2xl font-semibold text-xs uppercase tracking-widest text-foreground bg-muted/10 shadow-inner px-8 transition-all focus:ring-0 focus:bg-white">
                        <SelectValue placeholder="Selecione o PDV">
                           {formData.unitId ? units.find(u => u.id === formData.unitId)?.name : undefined}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className="rounded-2xl p-2 shadow-2xl border-border/40 bg-white/95 backdrop-blur-xl">
                        {units.map(u => (
                          <SelectItem key={u.id} value={u.id} className="py-4 rounded-xl cursor-pointer focus:bg-primary/5 focus:text-primary transition-all mb-1 font-bold uppercase tracking-widest text-[10px]">{u.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-4">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 ml-2">Cargo Estratégico</label>
                    <Select 
                      value={formData.cargoId} 
                      onValueChange={v => {
                        const cargo = cargos.find(c => c.id === v);
                        setFormData({ ...formData, cargoId: v, pontosBase: cargo?.pontosBase || 0 });
                      }}
                    >
                      <SelectTrigger className="h-20 border-border/40 rounded-2xl font-bold text-xs uppercase tracking-widest text-foreground bg-muted/10 shadow-inner px-8 transition-all focus:ring-0 focus:bg-white">
                        <SelectValue placeholder="Defina a função" />
                      </SelectTrigger>
                      <SelectContent className="rounded-2xl p-2 shadow-2xl border-border/40 bg-white/95 backdrop-blur-xl max-h-[400px]">
                        {cargos.map(c => (
                          <SelectItem key={c.id} value={c.id} className="py-4 rounded-xl cursor-pointer focus:bg-primary/5 focus:text-primary transition-all mb-1">
                            <div className="flex items-center justify-between w-[280px]">
                              <div className="flex items-center gap-4">
                                <div className={cn(
                                   "h-8 w-8 rounded-lg flex items-center justify-center font-bold text-[9px] uppercase",
                                   c.pool === 'COZINHA' ? "bg-accent/20 text-accent-foreground" : "bg-blue-500/10 text-blue-600"
                                )}>
                                  {c.pool === 'COZINHA' ? 'COZ' : 'SAL'}
                                </div>
                                <span className="font-bold uppercase tracking-widest text-[10px]">{c.nome}</span>
                              </div>
                              <Badge className="bg-muted text-muted-foreground/60 border-none font-mono text-[9px] px-2">{c.pontosBase.toFixed(1)} Pts</Badge>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-4">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 ml-2">Setor de Atuação</label>
                    <Input 
                      value={formData.setor}
                      onChange={e => setFormData({ ...formData, setor: e.target.value })}
                      placeholder="Ex: Barista, Cozinha Quente..."
                      className="h-20 border-border/40 rounded-2xl font-semibold text-xl px-8 focus:ring-0 shadow-inner bg-muted/10 transition-all focus:bg-white focus:border-primary/20"
                    />
                  </div>
                  <div className="space-y-4">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 ml-2">Endereço</label>
                    <Input 
                      value={formData.endereco}
                      onChange={e => setFormData({ ...formData, endereco: e.target.value })}
                      placeholder="Rua, Número..."
                      className="h-20 border-border/40 rounded-2xl font-semibold text-xl px-8 focus:ring-0 shadow-inner bg-muted/10 transition-all focus:bg-white focus:border-primary/20"
                    />
                  </div>
                  <div className="space-y-4">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 ml-2">Bairro</label>
                    <Input 
                      value={formData.bairro}
                      onChange={e => setFormData({ ...formData, bairro: e.target.value })}
                      placeholder="Ex: Itaim Bibi"
                      className="h-20 border-border/40 rounded-2xl font-semibold text-xl px-8 focus:ring-0 shadow-inner bg-muted/10 transition-all focus:bg-white focus:border-primary/20"
                    />
                  </div>
                  <div className="space-y-4">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 ml-2">Cidade</label>
                    <Input 
                      value={formData.cidade}
                      onChange={e => setFormData({ ...formData, cidade: e.target.value })}
                      placeholder="Ex: São Paulo"
                      className="h-20 border-border/40 rounded-2xl font-semibold text-xl px-8 focus:ring-0 shadow-inner bg-muted/10 transition-all focus:bg-white focus:border-primary/20"
                    />
                  </div>
                  <div className="space-y-4">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 ml-2">Observações</label>
                    <Input 
                      value={formData.observacoes}
                      onChange={e => setFormData({ ...formData, observacoes: e.target.value })}
                      placeholder="Informações adicionais..."
                      className="h-20 border-border/40 rounded-2xl font-semibold text-xl px-8 focus:ring-0 shadow-inner bg-muted/10 transition-all focus:bg-white focus:border-primary/20"
                    />
                  </div>
                  <div className="space-y-4">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 ml-2">Data de Admissão</label>
                    <Input 
                      type="date"
                      value={formData.dataAdmissao}
                      onChange={e => setFormData({ ...formData, dataAdmissao: e.target.value })}
                      className="h-20 border-border/40 rounded-2xl font-semibold text-xl px-8 focus:ring-0 shadow-inner bg-muted/10 transition-all focus:bg-white focus:border-primary/20 text-foreground"
                    />
                  </div>
                  <div className="space-y-4">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40 ml-2">Crédito Base de Mérito</label>
                    <div className="h-20 flex items-center justify-between px-10 bg-primary/[0.03] border border-primary/20 rounded-[28px] shadow-inner">
                      <span className="text-3xl font-mono font-semibold text-primary tracking-tighter">
                        {formData.pontosBase?.toFixed(1) || '0.0'}
                      </span>
                      <span className="text-[9px] font-black text-primary/40 uppercase tracking-[0.3em] font-sans">Pts p/ Dia</span>
                    </div>
                  </div>
                  <div className="md:col-span-3 flex justify-end gap-6 pt-12 mt-4 border-t border-border/40">
                    <Button 
                      type="button" 
                      variant="ghost" 
                      onClick={() => { setIsAdding(false); setEditingId(null); }} 
                      className="rounded-[22px] h-16 px-12 font-semibold text-[11px] uppercase tracking-[0.2em] text-muted-foreground/40 hover:bg-muted transition-all"
                    >
                      Descartar Alterações
                    </Button>
                    <Button 
                      type="submit" 
                      disabled={loading} 
                      className="rounded-[22px] h-16 px-16 bg-primary hover:bg-primary/90 text-white font-semibold text-[11px] uppercase tracking-[0.2em] shadow-[0_20px_40px_-8px_rgba(var(--primary),0.3)] transition-all active:scale-95 min-w-[280px]"
                    >
                      <Save className="h-5 w-5 mr-3" />
                      {loading ? 'Processando...' : (editingId ? 'Efetivar Atualização' : 'Efetivar Cadastro')}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <Card className="border-border/40 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.12)] rounded-[56px] overflow-hidden bg-white ring-1 ring-border/5">
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto custom-scrollbar">
          <Table>
            <TableHeader className="bg-muted/30 border-b border-border/40">
              <TableRow className="hover:bg-transparent h-24">
                <TableHead className="px-12 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Identidade & Unidade</TableHead>
                <TableHead className="px-12 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Perfil Profissional</TableHead>
                <TableHead className="px-12 text-[10px] font-bold uppercase tracking-widest text-zinc-500 text-center">Score Base</TableHead>
                <TableHead className="px-12 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Status</TableHead>
                <TableHead className="px-12 text-[10px] font-bold uppercase tracking-widest text-zinc-500 text-right">Controles</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredColabs.map((colab, idx) => {
                const cargo = cargos.find(c => c.id === colab.cargoId);
                const unit = units.find(u => u.id === colab.unitId);
                return (
                  <motion.tr 
                    key={colab.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.02 }}
                    className="group border-b border-border/40 last:border-0 hover:bg-muted/10 transition-all h-28"
                  >
                    <TableCell className="px-12">
                      <div className="flex items-center gap-6">
                        <div className="h-16 w-16 rounded-2xl bg-muted/60 text-muted-foreground/40 flex items-center justify-center font-bold text-lg group-hover:scale-105 group-hover:bg-primary group-hover:text-white transition-all shadow-inner relative overflow-hidden group/avatar">
                          {colab.nome.charAt(0)}
                          <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover/avatar:opacity-100 transition-opacity" />
                        </div>
                        <div className="space-y-1">
                          <div className="font-bold text-foreground text-lg tracking-tight leading-none">{colab.nome}</div>
                          <div className="flex items-center gap-3">
                             <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest whitespace-nowrap">Adm: {colab.dataAdmissao ? format(new Date(colab.dataAdmissao + 'T12:00:00'), 'dd/MM/yy') : '—'}</span>
                             <span className="h-1 w-1 rounded-full bg-border" />
                             <span className="text-[10px] font-bold text-primary/60 whitespace-nowrap">{unit?.name}</span>
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-12">
                      <div className="space-y-2">
                        <div className="font-bold text-foreground text-xs uppercase tracking-widest flex items-center gap-3">
                          {cargo?.nome || '—'}
                          <Badge className={cn(
                            "px-2 py-0 text-[8px] font-bold uppercase border-none h-4 shadow-sm",
                            cargo?.pool === 'COZINHA' ? "bg-accent/20 text-accent-foreground" : "bg-blue-500/10 text-blue-600"
                          )}>
                            {cargo?.pool === 'COZINHA' ? 'PRODUÇÃO' : 'ATENDIMENTO'}
                          </Badge>
                        </div>
                        <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-none">{colab.setor}</div>
                      </div>
                    </TableCell>
                    <TableCell className="px-12 text-center">
                      <div className="inline-flex flex-col items-center bg-muted/20 px-6 py-3 rounded-2xl shadow-inner border border-border/20">
                        <span className="font-mono font-bold text-foreground text-xl tracking-tighter leading-none">{colab.pontosBase.toFixed(1)}</span>
                        <span className="text-[8px] font-bold uppercase text-zinc-400 mt-1 tracking-widest">Score</span>
                      </div>
                    </TableCell>
                    <TableCell className="px-12">
                      <Badge className={cn(
                        "rounded-full px-4 py-1.5 text-[9px] font-bold uppercase border-none shadow-md transition-all",
                        colab.status === 'ATIVO' ? 'bg-primary shadow-primary/20 text-white' : 'bg-muted text-muted-foreground/40'
                      )}>
                        {colab.status === 'ATIVO' ? 'Efetivado' : 'Dispensado'}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-12 text-right">
                      <div className="flex justify-end gap-3 opacity-40 group-hover:opacity-100 transition-all translate-x-1 group-hover:translate-x-0">
                        <Button 
                          variant="outline" 
                          size="icon" 
                          className="h-10 w-10 bg-white hover:bg-primary hover:text-white border-border/40 hover:border-primary rounded-xl transition-all shadow-sm ring-1 ring-border/5" 
                          onClick={() => handleEdit(colab)}
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button 
                          variant="outline" 
                          size="icon" 
                          className={cn(
                            "h-10 w-10 rounded-xl border-border/40 transition-all shadow-sm ring-1 ring-border/5 bg-white",
                            colab.status === 'ATIVO' 
                              ? 'hover:text-amber-600 hover:bg-amber-50 hover:border-amber-200' 
                              : 'hover:text-primary hover:bg-primary/5 hover:border-primary/20'
                          )}
                          onClick={() => handleToggleStatus(colab)}
                        >
                          {colab.status === 'ATIVO' ? <UserMinus className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                        </Button>
                        <Button 
                          variant="outline" 
                          size="icon" 
                          className="h-10 w-10 bg-white hover:bg-destructive hover:text-white border-border/40 hover:border-destructive rounded-xl transition-all shadow-sm ring-1 ring-border/5"
                          onClick={() => setDeleteConfirmId(colab.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </motion.tr>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Mobile List View */}
        <div className="md:hidden divide-y divide-border/40">
          {filteredColabs.map((colab, idx) => {
             const cargo = cargos.find(c => c.id === colab.cargoId);
             const unit = units.find(u => u.id === colab.unitId);
             return (
               <motion.div 
                 key={colab.id}
                 initial={{ opacity: 0, y: 10 }}
                 animate={{ opacity: 1, y: 0 }}
                 transition={{ delay: idx * 0.05 }}
                 className="p-8 space-y-6 bg-white active:bg-muted/20 transition-all"
               >
                 <div className="flex items-start justify-between">
                   <div className="flex items-center gap-5">
                     <div className="h-14 w-14 rounded-[22px] bg-primary text-white flex items-center justify-center font-black text-xl shadow-2xl shadow-primary/30 ring-4 ring-primary/5">
                       {colab.nome.charAt(0)}
                     </div>
                     <div className="space-y-1">
                       <h4 className="font-black text-lg text-foreground tracking-tight leading-none">{colab.nome}</h4>
                       <div className="flex items-center gap-3">
                         <p className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-widest">{cargo?.nome || 'Sem Cargo'}</p>
                         <Badge className={cn(
                            "px-2 py-0 text-[7px] font-black uppercase border-none shadow-sm",
                            cargo?.pool === 'COZINHA' ? "bg-accent/20 text-accent-foreground" : "bg-blue-500/10 text-blue-600"
                          )}>
                            {cargo?.pool || 'SALAO'}
                          </Badge>
                       </div>
                     </div>
                   </div>
                   <Badge className={cn(
                     "rounded-full px-4 py-1.5 text-[8px] font-black uppercase border-none shadow-lg",
                     colab.status === 'ATIVO' ? 'bg-primary text-white shadow-primary/20' : 'bg-muted text-muted-foreground/40'
                   )}>
                     {colab.status === 'ATIVO' ? 'ATIVO' : 'DISPENSADO'}
                   </Badge>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                   <div className="bg-muted/30 rounded-3xl p-5 border border-border/40 shadow-inner">
                     <p className="text-[8px] font-black text-muted-foreground/30 uppercase tracking-[0.2em] mb-2 leading-none">Unidade Org.</p>
                     <p className="text-xs font-black text-foreground truncate tracking-tight">{unit?.name || 'N/A'}</p>
                   </div>
                   <div className="bg-primary/[0.03] rounded-3xl p-5 border border-primary/20 shadow-inner flex flex-col items-center justify-center">
                     <p className="text-sm font-black text-primary font-mono leading-none tracking-tighter">{colab.pontosBase.toFixed(1)} pts</p>
                     <p className="text-[8px] font-black text-primary/30 uppercase tracking-[0.2em] mt-2 leading-none">Mérito Ref.</p>
                   </div>
                 </div>

                 <div className="flex items-center justify-between pt-2">
                    <div className="space-y-1">
                       <p className="text-[8px] font-black text-muted-foreground/20 uppercase tracking-[0.2em] leading-none">Departamento</p>
                       <p className="text-[11px] font-black text-muted-foreground uppercase tracking-tight">{colab.setor || 'Operacional'}</p>
                    </div>
                    <div className="flex gap-2">
                       <Button variant="outline" size="sm" onClick={() => handleEdit(colab)} className="h-12 px-6 rounded-2xl border-border/40 bg-white font-black text-[10px] uppercase tracking-widest text-foreground shadow-lg shadow-muted/20 active:scale-95 transition-all">
                         <Edit2 className="h-4 w-4 mr-2 text-primary" /> Editar
                       </Button>
                       <Button variant="outline" size="sm" onClick={() => setDeleteConfirmId(colab.id)} className="h-12 w-12 p-0 rounded-2xl border-border/40 bg-white text-destructive hover:bg-destructive hover:text-white active:scale-95 transition-all shadow-lg shadow-muted/20">
                         <Trash2 className="h-4 w-4" />
                       </Button>
                    </div>
                 </div>
               </motion.div>
             );
          })}
        </div>

        {filteredColabs.length === 0 && (
          <div className="py-32 text-center">
            <div className="flex flex-col items-center gap-8">
              <div className="h-24 w-24 bg-muted/30 rounded-full flex items-center justify-center text-muted-foreground/20">
                <UsersIcon className="h-10 w-10" />
              </div>
              <div className="space-y-2">
                <p className="text-muted-foreground font-black uppercase tracking-widest text-sm">Nenhum registro estratificado</p>
                <p className="text-muted-foreground/40 text-xs font-medium">Ajuste os filtros de busca para encontrar o perfil desejado.</p>
              </div>
            </div>
          </div>
        )}

        <div className="p-8 bg-muted/20 border-t border-border/40">
           <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest text-center italic">
             Indexação: {filteredColabs.length} de {colaboradores.length} registros no ecossistema
           </p>
        </div>
      </Card>

      <ConfirmModal
        isOpen={!!deleteConfirmId}
        title="Encerrar Contrato Digital"
        message="A exclusão deste colaborador é irreversível e afetará os registros históricos de distribuição. Deseja prosseguir com a baixa?"
        onConfirm={() => deleteConfirmId && handleDelete(deleteConfirmId)}
        onCancel={() => setDeleteConfirmId(null)}
        confirmText={isDeleting ? "Processando..." : "Confirmar Baixa"}
      />
    </div>
  );
}
