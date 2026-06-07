import React, { useEffect, useState } from 'react';
import { cn } from '../lib/utils';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Cargo, Pool } from '../types';
import { normalizeDataForFirestore, normalizeToUppercase } from '../lib/normalization';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Plus, Save, Trash2, Edit2, Briefcase, FileUp, Download, X, Search } from 'lucide-react';
import { toast } from 'sonner';
import { logAudit } from '../services/calculationService';
import { Badge } from './ui/badge';
import { parseExcelFile, downloadTemplate } from '../services/excelService';
import { ConfirmModal } from './ConfirmModal';
import { motion, AnimatePresence } from 'motion/react';

export default function Cargos() {
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [formData, setFormData] = useState<Partial<Cargo>>({
    nome: '',
    pontosBase: 1,
    pool: 'SALAO',
    ativo: true
  });

  useEffect(() => {
    return onSnapshot(collection(db, 'cargos'), (snapshot) => {
      setCargos(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Cargo)));
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nome) {
      toast.error('O nome do cargo é obrigatório');
      return;
    }

    setLoading(true);
    try {
      // Verificar se já existe um cargo com o mesmo nome (ignorando case)
      const duplicate = cargos.find(c => 
        c.nome.toLowerCase() === formData.nome?.trim().toLowerCase() && c.id !== editingId
      );

      if (duplicate) {
        toast.error('Já existe um cargo cadastrado com este nome');
        setLoading(false);
        return;
      }

      const normalizedFormData = normalizeDataForFirestore(formData, ['nome']);
      
      if (editingId) {
        const old = cargos.find(c => c.id === editingId);
        await updateDoc(doc(db, 'cargos', editingId), normalizedFormData);
        await logAudit('CARGOS', 'UPDATE', 'Cargo', editingId, old, normalizedFormData);
        toast.success('Cargo atualizado com sucesso');
      } else {
        const docRef = await addDoc(collection(db, 'cargos'), normalizedFormData);
        await logAudit('CARGOS', 'CREATE', 'Cargo', docRef.id, null, normalizedFormData);
        toast.success('Novo cargo criado com sucesso');
      }
      setIsAdding(false);
      setEditingId(null);
      setFormData({ nome: '', pontosBase: 1, pool: 'SALAO', ativo: true });
    } catch (error) {
      toast.error('Erro ao salvar cargo');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (cargo: Cargo) => {
    setFormData(cargo);
    setEditingId(cargo.id);
    setIsAdding(true);
  };

  const handleDelete = async (id: string) => {
    setIsDeleting(true);
    try {
      const q = query(collection(db, 'colaboradores'), where('cargoId', '==', id));
      const snap = await getDocs(q);
      
      if (!snap.empty) {
        toast.error('Este cargo não pode ser removido pois existem colaboradores vinculados a ele.');
        setDeleteConfirmId(null);
        return;
      }

      const old = cargos.find(c => c.id === id);
      await deleteDoc(doc(db, 'cargos', id));
      await logAudit('CARGOS', 'DELETE', 'Cargo', id, old, null);
      toast.success('Cargo removido com sucesso');
      setDeleteConfirmId(null);
    } catch (error) {
      toast.error('Erro ao remover cargo');
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredCargos = cargos.filter(c => 
    c.nome.toLowerCase().includes(searchTerm.toLowerCase())
  ).sort((a,b) => a.nome.localeCompare(b.nome));

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const result = await parseExcelFile<Partial<Cargo>>(file, (row) => {
        if (!row.Nome) return null;
        return {
          nome: normalizeToUppercase(String(row.Nome)),
          pontosBase: Number(row.Pontos) || 1,
          pool: (String(row.Pool).toUpperCase() === 'COZINHA' ? 'COZINHA' : 'SALAO') as Pool,
          ativo: true
        };
      });

      if (result.errors.length > 0) {
        toast.error(`Erros encontrados na planilha.`);
        console.error('Erros de importação:', result.errors);
      }

      let importedCount = 0;
      for (const cargoData of result.data) {
        const exists = cargos.find(c => c.nome.toLowerCase() === cargoData.nome?.toLowerCase());
        if (!exists) {
          const docRef = await addDoc(collection(db, 'cargos'), cargoData);
          await logAudit('CARGOS', 'IMPORT', 'Cargo', docRef.id, null, cargoData);
          importedCount++;
        }
      }

      toast.success(`${importedCount} cargos importados com sucesso.`);
    } catch (error) {
      toast.error('Erro ao processar arquivo');
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-12 pb-14">
      {/* Header */}
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-8 px-2">
        <div className="flex items-center gap-6">
           <motion.div 
             initial={{ scale: 0.8, opacity: 0 }}
             animate={{ scale: 1, opacity: 1 }}
             className="h-20 w-20 bg-primary rounded-[32px] flex items-center justify-center shadow-[0_20px_40px_-8px_rgba(var(--primary),0.3)] ring-4 ring-primary/10 relative"
           >
             <Briefcase className="h-8 w-8 text-white" />
             <div className="absolute -bottom-1 -right-1 h-8 w-8 bg-white rounded-full flex items-center justify-center shadow-lg ring-2 ring-primary/5">
                <Plus className="h-4 w-4 text-primary" />
             </div>
           </motion.div>
           <div className="space-y-2">
            <motion.h1 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-5xl font-bold tracking-tighter text-foreground"
            >
              Estrutura de Cargos
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="text-zinc-500 text-sm font-bold uppercase tracking-widest"
            >
              Dimensionamento de mérito e hierarquia estratégica
            </motion.p>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-4">
          <Button 
            variant="outline" 
            onClick={() => downloadTemplate(['Nome', 'Pontos', 'Pool'], 'Template_Cargos')} 
            className="rounded-xl h-14 px-8 gap-3 border-border/40 bg-white text-[10px] font-bold uppercase tracking-widest shadow-lg shadow-muted/10 hover:bg-muted/50 hover:border-border transition-all ring-1 ring-border/5 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <Download className="h-4 w-4 text-primary" />
            <span className="hidden sm:inline">Modelo XL</span>
          </Button>
          <div className="relative">
            <Button 
              variant="outline" 
              className="rounded-xl h-14 px-8 gap-3 border-border/40 bg-white text-[10px] font-bold uppercase tracking-widest shadow-lg shadow-muted/10 hover:bg-muted/50 hover:border-border transition-all ring-1 ring-border/5 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              disabled={loading}
            >
              <FileUp className="h-4 w-4 text-primary" />
              <span className="hidden sm:inline">Importar</span>
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
            onClick={() => { setIsAdding(true); setEditingId(null); setFormData({ nome: '', pontosBase: 1, pool: 'SALAO', ativo: true }); }} 
            className="rounded-xl h-14 px-10 gap-3 bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20 hover:shadow-2xl hover:shadow-primary/30 font-bold text-[11px] uppercase tracking-widest transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none border-none"
          >
            <Plus className="h-5 w-5" />
            Adicionar Papel
          </Button>
        </div>
      </section>

      {/* Search Bar */}
      <Card className="border-border/40 shadow-inner bg-muted/30 rounded-[40px] overflow-hidden p-3 ring-1 ring-border/5">
        <div className="relative group">
          <Search className="absolute left-8 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground/40 group-focus-within:text-primary transition-all" />
          <Input 
            placeholder="Encontrar função pelo nome..." 
            className="pl-16 h-20 bg-white border-none rounded-[28px] focus:ring-0 transition-all font-bold text-lg placeholder:text-muted-foreground/20 shadow-xl shadow-muted/40"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
          <div className="absolute right-6 top-1/2 -translate-y-1/2">
             <Badge className="bg-muted text-zinc-400 border-none px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest">
               {filteredCargos.length} Registros
             </Badge>
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
            <Card className="border-border/40 shadow-[0_48px_96px_-24px_rgba(0,0,0,0.15)] rounded-[40px] overflow-hidden ring-1 ring-border/5 bg-white">
              <div className="bg-primary px-14 py-12 relative overflow-hidden">
                <motion.div 
                  initial={{ rotate: -15, scale: 0.5, opacity: 0 }}
                  animate={{ rotate: 0, scale: 1, opacity: 0.1 }}
                  className="absolute top-0 right-0 h-[400px] w-[400px] bg-white rounded-full -mr-48 -mt-48"
                />
                <div className="relative flex items-center justify-between">
                  <div className="space-y-3">
                    <CardTitle className="text-4xl font-bold tracking-tight text-white flex items-center gap-5">
                      <div className="h-14 w-14 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-md">
                        {editingId ? <Edit2 className="h-7 w-7" /> : <Plus className="h-7 w-7" />}
                      </div>
                      {editingId ? 'Editar Cargo' : 'Novo Registro Profissional'}
                    </CardTitle>
                    <p className="text-white/60 text-sm font-bold uppercase tracking-widest ml-20">Configuração de peso estratégico e pool de rateio</p>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => { setIsAdding(false); setEditingId(null); }} 
                    className="text-white hover:bg-white/20 rounded-xl h-16 w-16 transition-all focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 ring-offset-primary"
                  >
                    <X className="h-8 w-8" />
                  </Button>
                </div>
              </div>
              <CardContent className="p-14">
                <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-12">
                  <div className="space-y-4 md:col-span-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 ml-2">Nomenclatura da Função</label>
                    <Input 
                      placeholder="Ex: Maitre, Especialista de Bar..." 
                      value={formData.nome}
                      onChange={e => setFormData({ ...formData, nome: e.target.value })}
                      className="h-20 border-border/40 rounded-xl font-bold text-xl px-8 focus:ring-0 shadow-inner bg-muted/10 transition-all focus:bg-white focus:border-primary/20"
                    />
                  </div>
                  <div className="space-y-4">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 ml-2">Intensidade (Pontos)</label>
                    <div className="relative group/score">
                       <Input 
                        type="number"
                        step="0.1"
                        value={isNaN(formData.pontosBase ?? 0) ? '' : formData.pontosBase}
                        onChange={e => {
                          const val = parseFloat(e.target.value);
                          setFormData({ ...formData, pontosBase: isNaN(val) ? 0 : val });
                        }}
                        className="h-20 border-border/40 rounded-xl font-mono font-bold text-3xl text-primary bg-primary/[0.03] shadow-inner text-center pr-12 focus:ring-0 focus:bg-white transition-all"
                      />
                      <div className="absolute right-6 top-1/2 -translate-y-1/2 text-primary/30 font-bold text-[10px] uppercase">pts</div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 ml-2">Ambiente de Rateio</label>
                    <Select 
                      value={formData.pool} 
                      onValueChange={(v: Pool) => setFormData({ ...formData, pool: v })}
                    >
                      <SelectTrigger className="h-20 border-border/40 rounded-xl font-bold text-[10px] uppercase tracking-widest text-foreground bg-muted/10 shadow-inner px-8 transition-all focus:ring-0 focus:bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl p-2 shadow-2xl border-border/40 bg-white/95 backdrop-blur-xl">
                        <SelectItem value="SALAO" className="py-4 rounded-lg cursor-pointer focus:bg-primary/5 focus:text-primary transition-all mb-1">
                           <div className="flex items-center gap-4">
                             <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                               <div className="h-3 w-3 rounded-full bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.5)]" />
                             </div>
                             <div className="flex flex-col">
                               <span className="font-bold uppercase tracking-widest text-[10px]">Fluxo Salão</span>
                               <span className="text-[8px] font-bold text-zinc-400">Operação Front-End</span>
                             </div>
                           </div>
                        </SelectItem>
                        <SelectItem value="COZINHA" className="py-4 rounded-lg cursor-pointer focus:bg-accent/5 focus:text-accent-foreground transition-all">
                           <div className="flex items-center gap-4">
                             <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center">
                               <div className="h-3 w-3 rounded-full bg-accent shadow-[0_0_12px_rgba(249,115,22,0.5)]" />
                             </div>
                             <div className="flex flex-col">
                               <span className="font-bold uppercase tracking-widest text-[10px]">Fluxo Cozinha</span>
                               <span className="text-[8px] font-bold text-zinc-400">Operação Back-End</span>
                             </div>
                           </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-4 flex justify-end gap-6 pt-12 border-t border-border/40 mt-4">
                    <Button 
                      type="button" 
                      variant="ghost" 
                      onClick={() => { setIsAdding(false); setEditingId(null); }} 
                      className="rounded-xl h-16 px-12 font-bold text-[11px] uppercase tracking-widest text-zinc-400 hover:bg-muted/50 hover:text-muted-foreground transition-all focus-visible:ring-2 focus-visible:ring-primary/20"
                    >
                      Descartar Alterações
                    </Button>
                    <Button 
                      type="submit" 
                      disabled={loading} 
                      className="rounded-xl h-16 px-16 bg-primary hover:bg-primary/90 text-white font-bold text-[11px] uppercase tracking-widest shadow-lg shadow-primary/20 hover:shadow-2xl hover:shadow-primary/30 transition-all active:scale-[0.98] min-w-[280px] focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none border-none"
                    >
                      <Save className="h-5 w-5 mr-3" />
                      {loading ? 'Sincronizando...' : 'Efetivar Configuração'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Table/Grid Section */}
      <div className="space-y-8">
        {/* Desktop View - Premium Grid */}
        <div className="hidden md:grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8">
          {filteredCargos.map((cargo, idx) => (
            <motion.div 
              key={cargo.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="group relative"
            >
              <Card className="h-full border-border/40 shadow-xl shadow-muted/5 rounded-[40px] overflow-hidden bg-gradient-to-br from-white via-white to-muted/20 transition-all duration-500 hover:shadow-2xl hover:shadow-muted/30 hover:-translate-y-2 ring-1 ring-border/5">
                <div className="absolute top-0 right-0 w-40 h-40 bg-primary/5 rounded-full -mr-20 -mt-20 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
                
                <CardHeader className="p-10 pb-6 relative">
                  <div className="flex items-center justify-between mb-8">
                    <div className="h-16 w-16 rounded-2xl bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/20 ring-4 ring-primary/5 transition-transform group-hover:scale-110">
                      <Briefcase className="h-7 w-7" />
                    </div>
                    <div className="flex flex-col items-end gap-3">
                       <div className={cn(
                          "h-3 w-3 rounded-full animate-pulse",
                          cargo.pool === 'SALAO' ? 'bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.6)]' : 'bg-accent shadow-[0_0_12px_rgba(249,115,22,0.6)]'
                       )} />
                       <Badge variant="secondary" className={cn(
                         "rounded-xl px-4 py-1 text-[10px] font-bold uppercase tracking-widest border-none shadow-sm",
                         cargo.pool === 'SALAO' ? 'bg-blue-50 text-blue-600' : 'bg-accent/10 text-accent-foreground'
                       )}>
                         Pool {cargo.pool}
                       </Badge>
                    </div>
                  </div>
                  <CardTitle className="text-3xl font-bold tracking-tight text-foreground leading-none">{cargo.nome}</CardTitle>
                  <CardDescription className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-3">Matriz Operacional de Mérito</CardDescription>
                </CardHeader>
                
                <CardContent className="p-10 pt-0 relative">
                  <div className="pt-8 border-t border-border/40 flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest">Score Adicional</p>
                      <div className="flex items-baseline gap-2">
                        <span className="text-4xl font-mono font-bold text-primary tracking-tighter">{cargo.pontosBase.toFixed(1)}</span>
                        <span className="text-xs font-bold text-zinc-300 italic">pts/dia</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
                      <Button 
                        variant="outline" 
                        size="icon" 
                        className="h-14 w-14 bg-white hover:bg-primary hover:text-white border-border/40 hover:border-primary rounded-xl transition-all shadow-lg shadow-muted/5 ring-1 ring-border/5" 
                        onClick={() => handleEdit(cargo)}
                      >
                        <Edit2 className="h-5 w-5" />
                      </Button>
                      <Button 
                        variant="outline" 
                        size="icon" 
                        className="h-14 w-14 bg-white hover:bg-destructive hover:text-white border-border/40 hover:border-destructive rounded-xl transition-all shadow-lg shadow-muted/5 ring-1 ring-border/5" 
                        onClick={() => setDeleteConfirmId(cargo.id)}
                      >
                        <Trash2 className="h-5 w-5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Mobile View List */}
        <div className="md:hidden space-y-4">
          {filteredCargos.map((cargo, idx) => (
            <motion.div 
              key={cargo.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="p-8 space-y-6 bg-gradient-to-br from-white via-white to-muted/30 rounded-[32px] border border-border/40 shadow-xl shadow-muted/5 transition-all hover:shadow-2xl hover:shadow-muted/10 m-4 relative overflow-hidden group"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 blur-2xl group-hover:bg-primary/10 transition-colors" />
              <div className="flex items-center justify-between relative">
                <div className="flex items-center gap-5">
                  <div className="h-14 w-14 rounded-2xl bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/20 ring-4 ring-primary/5">
                    <Briefcase className="h-6 w-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-xl text-foreground tracking-tight leading-none mb-1">{cargo.nome}</h4>
                    <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest leading-none">Matriz de Competência</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className={cn(
                      "h-3 w-3 rounded-full",
                      cargo.pool === 'SALAO' ? 'bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.5)]' : 'bg-accent shadow-[0_0_12px_rgba(249,115,22,0.5)]'
                  )} />
                  <Badge variant="outline" className={cn(
                    "text-[8px] font-bold uppercase tracking-widest border-none px-0",
                    cargo.pool === 'SALAO' ? 'text-blue-500/60' : 'text-accent-foreground/60'
                  )}>
                    {cargo.pool}
                  </Badge>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 relative">
                <div className="bg-white/50 backdrop-blur-sm rounded-[24px] p-5 border border-border/40 shadow-inner flex flex-col items-center justify-center group-hover:bg-white transition-all">
                  <span className="text-3xl font-bold text-primary font-mono leading-none tracking-tighter">{cargo.pontosBase.toFixed(1)}</span>
                  <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest mt-2">Peso de Mérito</span>
                </div>
                <div className="flex flex-col gap-2">
                  <Button 
                    variant="outline" 
                    onClick={() => handleEdit(cargo)} 
                    className="h-12 rounded-xl border-border/40 bg-white/50 font-bold text-[10px] uppercase tracking-widest text-foreground shadow-sm hover:bg-primary hover:text-white hover:border-primary transition-all group/btn"
                  >
                    <Edit2 className="h-4 w-4 mr-2 text-primary group-hover/btn:text-white transition-colors" /> 
                    Ajustar
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => setDeleteConfirmId(cargo.id)} 
                    className="h-12 rounded-xl border-border/40 bg-white/50 font-bold text-[10px] uppercase tracking-widest text-destructive shadow-sm hover:bg-destructive hover:text-white hover:border-destructive transition-all group/btn"
                  >
                    <Trash2 className="h-4 w-4 mr-2 text-destructive group-hover/btn:text-white transition-colors" />
                    Remover
                  </Button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

        {filteredCargos.length === 0 && (
          <div className="py-32 text-center text-zinc-300 font-bold uppercase tracking-widest px-8">
            {searchTerm ? 'Nenhuma correspondência estratégica' : 'Aguardando definições de hierarquia'}
          </div>
        )}

      <ConfirmModal
        isOpen={!!deleteConfirmId}
        title="Excluir Cargo"
        variant="destructive"
        message="Deseja realmente excluir este cargo? Esta ação não poderá ser desfeita e o cargo será removido permanentemente do sistema. O sistema impedirá a exclusão se houver colaboradores vinculados."
        onConfirm={() => deleteConfirmId && handleDelete(deleteConfirmId)}
        onCancel={() => setDeleteConfirmId(null)}
        confirmText={isDeleting ? "Excluindo..." : "Excluir Permanentemente"}
      />
    </div>
  );
}
