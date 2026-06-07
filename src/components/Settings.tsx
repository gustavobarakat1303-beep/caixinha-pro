import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { collection, onSnapshot, addDoc, updateDoc, doc, query, orderBy, getDocs, where, deleteDoc, writeBatch } from 'firebase/firestore';
import type { QueryConstraint } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Unit, Competencia, Configuracao } from '../types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Plus, Save, Building2, Cog, Copy, Trash2, Calendar as CalendarIcon, ChevronRight, LayoutGrid, Layers, Percent, ShieldCheck, Zap, X, ImagePlus, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { logAudit } from '../services/calculationService';
import { normalizeDataForFirestore, normalizeToUppercase } from '../lib/normalization';
import { ConfirmModal } from './ConfirmModal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { motion, AnimatePresence } from 'motion/react';
import { checkAndInitializeNewMonth, duplicateMonthConfig } from '../services/competenciaService';
import { Badge } from './ui/badge';
import { cn } from '../lib/utils';

const DELETE_BATCH_LIMIT = 400;

async function deleteDocsInChunks(collectionName: string, ...constraints: QueryConstraint[]) {
  while (true) {
    const snapshot = await getDocs(query(collection(db, collectionName), ...constraints));
    if (snapshot.empty) break;

    const docsToDelete = snapshot.docs.slice(0, DELETE_BATCH_LIMIT);
    const batch = writeBatch(db);
    docsToDelete.forEach(docSnap => batch.delete(docSnap.ref));
    await batch.commit();

    if (snapshot.size <= DELETE_BATCH_LIMIT) break;
  }
}

export default function Settings() {
  const { profile } = useAuth();
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [competencias, setCompetencias] = useState<Competencia[]>([]);
  const [selectedCompId, setSelectedCompId] = useState<string | null>(null);
  const [config, setConfig] = useState<Partial<Configuracao> | null>(null);
  const [newUnitName, setNewUnitName] = useState('');
  const [newUnitLogoUrl, setNewUnitLogoUrl] = useState('');
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [newCompMonth, setNewCompMonth] = useState(new Date().getMonth() + 1);
  const [newCompYear, setNewCompYear] = useState(new Date().getFullYear());
  const [deleteUnitId, setDeleteUnitId] = useState<string | null>(null);
  const [deleteCompId, setDeleteCompId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  useEffect(() => {
    let q = query(collection(db, 'units'));
    if (profile?.unitId && profile.unitId !== 'ALL') {
      q = query(collection(db, 'units'), where('__name__', '==', profile.unitId));
    }

    return onSnapshot(q, (snapshot) => {
      const nextUnits = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Unit));
      setUnits(nextUnits);

      setSelectedUnit(currentSelectedUnit => {
        if (currentSelectedUnit && nextUnits.some(unit => unit.id === currentSelectedUnit)) {
          return currentSelectedUnit;
        }
        return nextUnits[0]?.id ?? null;
      });
    });
  }, [profile?.unitId]);

  useEffect(() => {
    if (!selectedUnit) {
      setCompetencias([]);
      setSelectedCompId(null);
      return;
    }

    const competenciasQuery = query(collection(db, 'competencias'), where('unitId', '==', selectedUnit), orderBy('label', 'desc'));
    return onSnapshot(competenciasQuery, (snapshot) => {
      const nextCompetencias = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Competencia));
      setCompetencias(nextCompetencias);

      setSelectedCompId(currentSelectedCompId => {
        if (currentSelectedCompId && nextCompetencias.some(comp => comp.id === currentSelectedCompId)) {
          return currentSelectedCompId;
        }
        return nextCompetencias[0]?.id ?? null;
      });
    });
  }, [selectedUnit]);

  const competenciaSelecionada = useMemo(
    () => competencias.find(comp => comp.id === selectedCompId) ?? null,
    [competencias, selectedCompId]
  );

  useEffect(() => {
    if (!selectedCompId || !selectedUnit) {
      setConfig(null);
      return;
    }

    const configQuery = query(collection(db, 'configuracoes'), where('competenciaId', '==', selectedCompId));
    return onSnapshot(configQuery, (snapshot) => {
      if (!snapshot.empty) {
        setConfig({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() });
        return;
      }

      setConfig({
        competenciaId: selectedCompId,
        unitId: selectedUnit,
        percentualGorjeta: 0.10,
        retencaoEncargos: 0.20,
        percentualPoolCozinha: 0.30,
        percentualPoolSalao: 0.70,
        ativo: true
      });
    });
  }, [selectedCompId, selectedUnit]);

  const handleAddUnit = async () => {
    if (!newUnitName) return;
    try {
      const payload = { 
        name: normalizeToUppercase(newUnitName),
        logoUrl: newUnitLogoUrl || null 
      };
      const docRef = await addDoc(collection(db, 'units'), payload);
      await logAudit('CONFIG', 'CREATE', 'Unit', docRef.id, null, payload);
      setNewUnitName('');
      setNewUnitLogoUrl('');
      toast.success('Unidade de negócio criada');
    } catch (error) {
      toast.error('Erro ao registrar unidade');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, isEditing: boolean) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 800000) {
      toast.error('O arquivo é muito grande. Escolha uma imagem com menos de 800KB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (isEditing) {
        setEditingUnit(prev => prev ? { ...prev, logoUrl: base64 } : null);
      } else {
        setNewUnitLogoUrl(base64);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUpdateUnit = async () => {
    if (!editingUnit || !editingUnit.name) return;
    try {
      const normalizedUnit = normalizeDataForFirestore(editingUnit, ['name']);
      const { id, ...data } = normalizedUnit;
      await updateDoc(doc(db, 'units', id), data);
      await logAudit('CONFIG', 'UPDATE', 'Unit', id, null, data);
      setEditingUnit(null);
      toast.success('Unidade atualizada');
    } catch (error) {
      toast.error('Erro ao atualizar unidade');
    }
  };

  const handleDeleteUnit = async (id: string) => {
    setIsDeleting(true);
    try {
      const old = units.find(u => u.id === id);
      const competenciasSnap = await getDocs(query(collection(db, 'competencias'), where('unitId', '==', id)));
      const competenciaIds = competenciasSnap.docs.map(docSnap => docSnap.id);

      for (const competenciaId of competenciaIds) {
        await deleteDocsInChunks('configuracoes', where('competenciaId', '==', competenciaId));
        await deleteDocsInChunks('arrecadacoes', where('competenciaId', '==', competenciaId));
        await deleteDocsInChunks('presencas', where('competenciaId', '==', competenciaId));
        await deleteDocsInChunks('calculos', where('competenciaId', '==', competenciaId));
        await deleteDoc(doc(db, 'competencias', competenciaId));
      }

      await deleteDocsInChunks('colaboradores', where('unitId', '==', id));
      await deleteDoc(doc(db, 'units', id));

      await logAudit('CONFIG', 'DELETE_CASCADE', 'Unit', id, old, {
        competenciasRemovidas: competenciaIds.length
      });

      toast.success('Unidade e registros vinculados removidos');
      if (selectedUnit === id) {
        setSelectedUnit(null);
        setSelectedCompId(null);
      }
      setDeleteUnitId(null);
    } catch (error) {
      toast.error('Erro ao excluir unidade');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteCompetencia = async (id: string) => {
    setIsDeleting(true);
    try {
      const old = competencias.find(c => c.id === id);

      await deleteDocsInChunks('configuracoes', where('competenciaId', '==', id));
      await deleteDocsInChunks('arrecadacoes', where('competenciaId', '==', id));
      await deleteDocsInChunks('presencas', where('competenciaId', '==', id));
      await deleteDocsInChunks('calculos', where('competenciaId', '==', id));
      await deleteDoc(doc(db, 'competencias', id));

      await logAudit('CONFIG', 'DELETE_CASCADE', 'Competencia', id, old, null);
      toast.success('Período removido com sucesso');

      if (selectedCompId === id) setSelectedCompId(null);
      setDeleteCompId(null);
    } catch (error) {
      toast.error('Erro ao excluir competência');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCreateCompetencia = async () => {
    if (!selectedUnit) return;
    const label = `${newCompYear}-${String(newCompMonth).padStart(2, '0')}`;

    if (competencias.some(c => c.label === label)) {
      toast.error('Este período já está registrado');
      return;
    }

    try {
      const comp: Partial<Competencia> = {
        unitId: selectedUnit,
        mes: newCompMonth,
        ano: newCompYear,
        label,
        status: 'ABERTO'
      };
      const docRef = await addDoc(collection(db, 'competencias'), comp);
      await logAudit('CONFIG', 'CREATE', 'Competencia', docRef.id, null, comp);
      toast.success('Novo período adicionado');
    } catch (error) {
      toast.error('Erro ao registrar período');
    }
  };

  const handleSaveConfig = async () => {
    if (!config || !selectedCompId || !selectedUnit) return;
    setSavingConfig(true);

    const payload = {
      ...config,
      competenciaId: selectedCompId,
      unitId: selectedUnit
    };

    try {
      if (config.id) {
        await updateDoc(doc(db, 'configuracoes', config.id), payload);
        await logAudit('CONFIG', 'UPDATE', 'Configuracao', config.id, null, payload);
      } else {
        const docRef = await addDoc(collection(db, 'configuracoes'), payload);
        await logAudit('CONFIG', 'CREATE', 'Configuracao', docRef.id, null, payload);
      }
      toast.success('Configurações aplicadas');
    } catch (error) {
      toast.error('Erro ao aplicar configurações');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleDuplicateConfig = async () => {
    if (!selectedCompId || !selectedUnit) return;

    const currentIndex = competencias.findIndex(c => c.id === selectedCompId);
    if (currentIndex === -1 || currentIndex === competencias.length - 1) {
      toast.error('Nenhuma configuração anterior disponível');
      return;
    }

    const prevComp = competencias[currentIndex + 1];

    try {
      // Find the current configuration for this competence
      const currentConfigQuery = query(collection(db, 'configuracoes'), where('competenciaId', '==', selectedCompId));
      const currentSnap = await getDocs(currentConfigQuery);
      
      const previousConfigQuery = query(collection(db, 'configuracoes'), where('competenciaId', '==', prevComp.id));
      const prevSnap = await getDocs(previousConfigQuery);

      if (prevSnap.empty) {
        toast.error('Não há dados no período anterior');
        return;
      }

      const prevConfig = prevSnap.docs[0].data() as Configuracao;
      const newConfig = {
        ...prevConfig,
        competenciaId: selectedCompId,
        unitId: selectedUnit,
        ativo: true
      };
      // @ts-ignore
      delete newConfig.id;

      if (!currentSnap.empty) {
        await updateDoc(doc(db, 'configuracoes', currentSnap.docs[0].id), newConfig);
      } else {
        await addDoc(collection(db, 'configuracoes'), newConfig);
      }

      toast.success('Novo mês criado com sucesso com base na configuração do mês anterior. Os lançamentos começaram zerados.');
    } catch (error) {
      toast.error('Erro ao replicar regras');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 pb-10">
      {/* Side Management */}
      <div className="space-y-6 lg:col-span-1">
        <Card className="border-border/50 shadow-xl shadow-muted/50 rounded-[40px] overflow-hidden bg-white ring-1 ring-border/5">
          <CardHeader className="bg-muted/30 border-b border-border/60 p-6 px-8 relative overflow-hidden">
             <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl -mr-16 -mt-16" />
             <CardTitle className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#2c3e50]/40 relative">
              <Building2 className="h-4 w-4 text-primary" /> Unidades de Negócio
            </CardTitle>
          </CardHeader>
          <CardContent className="p-8 space-y-5">
            {(!profile?.unitId || profile.unitId === 'ALL') && (
              <div className="space-y-5">
                <div className="space-y-2.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-[#2c3e50]/30 ml-1">Denominação</label>
                  <Input
                    placeholder="Ex: Matriz Itaim Bibi"
                    value={newUnitName}
                    onChange={e => setNewUnitName(e.target.value)}
                    className="h-12 text-sm rounded-2xl border-border/60 font-bold bg-muted/5 focus:ring-primary shadow-sm"
                  />
                </div>
                <div className="space-y-2.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-[#2c3e50]/30 ml-1">Identidade Visual</label>
                  <div className="flex flex-col gap-3">
                    {newUnitLogoUrl ? (
                      <div className="relative h-24 w-full bg-white rounded-2xl border border-border/60 p-2 flex items-center gap-4 transition-all shadow-inner">
                        <div className="h-full aspect-square bg-muted/20 rounded-xl overflow-hidden border border-border/40 flex items-center justify-center p-1.5 shadow-sm">
                          <img src={newUnitLogoUrl} alt="Preview" className="h-full w-full object-contain" />
                        </div>
                        <div className="space-y-1 pr-2 flex-1">
                           <p className="text-[10px] font-bold text-foreground/80 uppercase truncate tracking-widest">Logo Carregada</p>
                           <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 rounded-lg font-bold text-[9px] uppercase px-2 tracking-widest"
                            onClick={() => setNewUnitLogoUrl('')}
                          >
                            <Trash2 className="h-3 w-3 mr-1" /> Remover
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="relative group">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={e => handleFileUpload(e, false)}
                          className="absolute inset-0 opacity-0 cursor-pointer z-10"
                        />
                        <div className="h-24 w-full border-2 border-dashed border-border/40 rounded-2xl flex flex-col items-center justify-center gap-2 group-hover:border-primary group-hover:bg-primary/5 transition-all shadow-sm">
                          <div className="h-10 w-10 rounded-xl bg-muted/30 flex items-center justify-center text-muted-foreground group-hover:bg-primary group-hover:text-white transition-all shadow-sm">
                             <ImagePlus className="h-5 w-5" />
                          </div>
                          <span className="text-[9px] font-bold text-muted-foreground/60 uppercase tracking-widest group-hover:text-primary transition-colors">Selecionar Arquivo</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <Button onClick={handleAddUnit} className="w-full h-12 gap-2 bg-primary hover:bg-primary/90 text-white shadow-xl shadow-primary/20 font-bold uppercase text-[10px] tracking-widest rounded-2xl transition-all active:scale-95 border-none">
                  <Plus className="h-4 w-4" /> Registrar Unidade
                </Button>
              </div>
            )}

            <div className={`pt-5 ${(!profile?.unitId || profile.unitId === 'ALL') ? 'border-t border-border/60' : ''} space-y-1.5`}>
              {units.map(unit => (
                <motion.div key={unit.id} layout className="group flex items-center gap-1">
                  <button
                    onClick={() => setSelectedUnit(unit.id)}
                    className={`flex-1 flex items-center gap-3 text-left px-4 py-3 rounded-2xl text-[13px] font-bold transition-all relative overflow-hidden ${
                      selectedUnit === unit.id ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'hover:bg-muted font-bold text-zinc-500'
                    }`}
                  >
                    {unit.logoUrl ? (
                      <div className="h-7 w-7 rounded-lg bg-white p-0.5 shrink-0 overflow-hidden flex items-center justify-center border border-black/5 shadow-sm">
                        <img 
                          src={unit.logoUrl} 
                          alt={unit.name} 
                          className="h-full w-full object-contain"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(unit.name)}&background=f4f4f5&color=71717a&bold=true`;
                          }}
                        />
                      </div>
                    ) : (
                      <div className="h-7 w-7 rounded-lg bg-muted/40 flex items-center justify-center shrink-0 shadow-sm">
                        <Building2 className="h-3.5 w-3.5 text-zinc-400" />
                      </div>
                    )}
                    <span className="truncate uppercase tracking-tight">{unit.name}</span>
                    {selectedUnit === unit.id && (
                      <motion.div layoutId="unit-active" className="ml-auto">
                        <ChevronRight className="h-3.5 w-3.5 opacity-50" />
                      </motion.div>
                    )}
                  </button>
                  <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity translate-x-3 group-hover:translate-x-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-zinc-400 hover:text-primary hover:bg-primary/10 rounded-xl transition-all"
                      onClick={() => setEditingUnit(unit)}
                    >
                      <Cog className="h-4 w-4" />
                    </Button>
                    {(!profile?.unitId || profile.unitId === 'ALL') && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-zinc-400 hover:text-destructive hover:bg-destructive/10 rounded-xl transition-all"
                        onClick={() => setDeleteUnitId(unit.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-xl shadow-muted/50 rounded-[40px] overflow-hidden bg-white ring-1 ring-border/5">
          <CardHeader className="bg-muted/30 border-b border-border/60 p-6 px-8 relative overflow-hidden">
             <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl -mr-16 -mt-16" />
             <CardTitle className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#2c3e50]/40 relative">
              <Layers className="h-4 w-4 text-primary" /> Períodos / Competências
            </CardTitle>
          </CardHeader>
          <CardContent className="p-8 space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold text-zinc-400 px-1 uppercase tracking-widest">Mês</label>
                <Select value={String(newCompMonth)} onValueChange={v => setNewCompMonth(parseInt(v, 10))}>
                  <SelectTrigger className="h-12 text-sm rounded-2xl font-bold bg-muted/10 border-border/50 shadow-sm focus:ring-primary">
                    <SelectValue>
                      {String(newCompMonth).padStart(2, '0')}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl border-border shadow-2xl p-1">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)} className="font-bold py-2.5 rounded-xl cursor-pointer">{String(i + 1).padStart(2, '0')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold text-zinc-400 px-1 uppercase tracking-widest">Ano</label>
                <Input
                  type="number"
                  value={isNaN(newCompYear) ? '' : newCompYear}
                  onChange={e => {
                    const val = parseInt(e.target.value, 10);
                    setNewCompYear(isNaN(val) ? new Date().getFullYear() : val);
                  }}
                  className="h-12 text-sm rounded-2xl border-border/50 font-bold bg-muted/10 shadow-sm focus:ring-primary"
                />
              </div>
            </div>
            <Button onClick={handleCreateCompetencia} className="w-full h-12 gap-2 text-[10px] font-bold uppercase tracking-widest bg-primary hover:bg-primary/90 text-white rounded-2xl shadow-xl shadow-primary/20 transition-all active:scale-95 border-none">
              <Plus className="h-4 w-4" /> Adicionar Ciclo
            </Button>
            <div className="space-y-1.5 pt-5 border-t border-border/60">
              {competencias.map(comp => (
                <motion.div key={comp.id} layout className="group flex items-center gap-1">
                  <button
                    onClick={() => setSelectedCompId(comp.id)}
                    className={`flex-1 text-left px-5 py-3 rounded-2xl text-[13px] flex justify-between items-center transition-all border ${
                      selectedCompId === comp.id ? 'bg-primary/5 font-bold text-primary border-primary/20 shadow-inner' : 'hover:bg-muted font-bold text-zinc-500 border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                       <div className={cn(
                          "h-2 w-2 rounded-full",
                          comp.status === 'FECHADO' ? 'bg-zinc-300' : 'bg-primary'
                       )} />
                       <span className="uppercase tracking-tight">{comp.label}</span>
                    </div>
                    <Badge variant={comp.status === 'FECHADO' ? 'destructive' : 'outline'} className={cn(
                      "rounded-xl px-2 py-0 text-[8px] font-bold uppercase border-none scale-90 tracking-widest",
                      comp.status === 'FECHADO' ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'
                    )}>
                      {comp.status}
                    </Badge>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 opacity-0 group-hover:opacity-100 text-zinc-300 hover:text-destructive hover:bg-destructive/10 rounded-xl transition-all"
                    onClick={() => setDeleteCompId(comp.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Form */}
      <div className="lg:col-span-3 space-y-6">
        <AnimatePresence mode="wait">
          {config && competenciaSelecionada ? (
            <motion.div
              key="config-form"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
            >
              <Card className="border-border/40 shadow-xl shadow-muted/5 rounded-[40px] overflow-hidden bg-white ring-1 ring-border/5">
                <CardHeader className="p-10 border-b border-border/60 bg-muted/20 relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-32 -mt-32" />
                  <div className="flex items-center gap-6 relative">
                    <div className="h-16 w-16 rounded-2xl bg-primary flex items-center justify-center text-white shadow-xl shadow-primary/30 rotate-2">
                       <Cog className="h-8 w-8 -rotate-2" />
                    </div>
                    <div className="space-y-1">
                      <CardTitle className="text-3xl font-bold text-foreground leading-none">Parâmetros de Cálculo</CardTitle>
                      <CardDescription className="font-bold text-zinc-400 text-sm mt-3 flex items-center gap-2 capitalize tracking-widest">
                        <CalendarIcon className="h-4 w-4" /> Ciclo Fiscal: {competenciaSelecionada.label}
                      </CardDescription>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="h-12 rounded-xl gap-3 px-6 font-bold uppercase text-[10px] tracking-widest border-border/60 hover:bg-white hover:border-primary text-zinc-500 shadow-sm relative group" onClick={handleDuplicateConfig}>
                    <Copy className="h-4 w-4 text-zinc-300 group-hover:text-primary transition-colors" /> Copiar configuração do mês anterior
                  </Button>
                </CardHeader>
                <CardContent className="p-10 lg:p-14 space-y-12">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-16 gap-y-12">
                    <ConfigField 
                      icon={<Percent className="h-5 w-5" />}
                      label="Service Charge (Sugestão)"
                      description="Referência institucional para o faturamento (ex: 10%)."
                      value={(config.percentualGorjeta || 0) * 100}
                      onChange={val => setConfig({ ...config, percentualGorjeta: val / 100 })}
                    />
                    <ConfigField 
                      icon={<ShieldCheck className="h-5 w-5" />}
                      label="Reserva de Encargos"
                      description="Percentual de retenção para impostos e taxas operacionais."
                      value={(config.retencaoEncargos || 0) * 100}
                      onChange={val => setConfig({ ...config, retencaoEncargos: val / 100 })}
                    />
                    <ConfigField 
                      icon={<Zap className="h-5 w-5" />}
                      label="Share Pool Cozinha"
                      description="Percentual da gorjeta líquida destinado ao setor de produção."
                      value={(config.percentualPoolCozinha || 0) * 100}
                      onChange={val => {
                        const normVal = val / 100;
                        setConfig({ ...config, percentualPoolCozinha: normVal, percentualPoolSalao: 1 - normVal });
                      }}
                    />
                    <ConfigField 
                      icon={<LayoutGrid className="h-5 w-5" />}
                      label="Share Pool Salão"
                      description="Percentual da gorjeta líquida destinado ao atendimento direto."
                      value={(config.percentualPoolSalao || 0) * 100}
                      onChange={val => {
                        const normVal = val / 100;
                        setConfig({ ...config, percentualPoolSalao: normVal, percentualPoolCozinha: 1 - normVal });
                      }}
                    />
                  </div>

                  <div className="pt-12 border-t border-border/60 flex justify-end">
                    <Button onClick={handleSaveConfig} disabled={savingConfig} className="h-16 px-16 rounded-[24px] bg-primary hover:bg-primary/90 text-white font-bold text-lg shadow-2xl shadow-primary/20 transition-all active:scale-95 group uppercase tracking-widest border-none">
                      {savingConfig ? 'PROCESSANDO...' : 'ATUALIZAR POLÍTICAS'}
                      {!savingConfig && <Save className="h-6 w-6 ml-4 group-hover:rotate-12 transition-transform" />}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ) : (
            <motion.div
              layout
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="h-full min-h-[500px] flex flex-col items-center justify-center bg-white border-2 border-dashed border-border/40 rounded-[60px] text-zinc-300 p-12 text-center shadow-inner"
            >
              <div className="h-32 w-32 rounded-[40px] bg-muted/30 flex items-center justify-center mb-8 shadow-sm">
                <CalendarIcon className="h-12 w-12 text-zinc-400/30" />
              </div>
              <h4 className="text-2xl font-bold text-zinc-400/50 uppercase tracking-widest">Aguardando Seleção</h4>
              <p className="max-w-sm mt-4 font-bold text-zinc-400/40 text-sm leading-relaxed tracking-wider">
                Por favor, escolha uma unidade de operação e defina o período de competência no painel lateral para carregar os parâmetros de rateio.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <ConfirmModal
        isOpen={!!deleteUnitId}
        title="Excluir Definitivamente"
        message="Deseja realmente apagar esta unidade e TODOS os cálculos e colaboradores vinculados? Esta ação é irreversível e afetará o histórico."
        onConfirm={() => deleteUnitId && handleDeleteUnit(deleteUnitId)}
        onCancel={() => setDeleteUnitId(null)}
        confirmText={isDeleting ? 'Excluindo...' : 'Apagar Unidade'}
      />

      <ConfirmModal
        isOpen={!!deleteCompId}
        title="Apagar Ciclo"
        message="Deseja realmente excluir este período e todos os lançamentos de faturamento e presença acumulados? Não é possível desfazer."
        onConfirm={() => deleteCompId && handleDeleteCompetencia(deleteCompId)}
        onCancel={() => setDeleteCompId(null)}
        confirmText={isDeleting ? 'Excluindo...' : 'Apagar Período'}
      />

      <ConfirmModal
        isOpen={!!editingUnit}
        title="Editar Unidade"
        message=""
        onConfirm={handleUpdateUnit}
        onCancel={() => setEditingUnit(null)}
        confirmText="Salvar Alterações"
        variant="default"
      >
        {editingUnit && (
          <div className="space-y-6 px-1 py-4">
            <div className="space-y-2.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-[#2c3e50]/40 ml-1">Denominação</label>
              <Input
                value={editingUnit.name}
                onChange={e => setEditingUnit({ ...editingUnit, name: e.target.value })}
                className="h-12 rounded-2xl border-border/60 font-bold bg-muted/5 shadow-sm"
              />
            </div>
            <div className="space-y-2.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-[#2c3e50]/40 ml-1">Identidade Visual</label>
              <div className="relative group mt-1">
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => handleFileUpload(e, true)}
                  className="absolute inset-0 opacity-0 cursor-pointer z-10"
                />
                <div className="h-32 w-full border-2 border-dashed border-border/40 rounded-[32px] flex flex-col items-center justify-center gap-2 group-hover:border-primary group-hover:bg-primary/5 transition-all overflow-hidden bg-white shadow-sm">
                  {editingUnit.logoUrl ? (
                    <div className="h-full w-full p-4 flex items-center justify-center relative">
                       <img src={editingUnit.logoUrl} alt="Logo" className="h-full w-full object-contain" />
                       <div className="absolute inset-x-0 bottom-0 bg-primary/90 p-2 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                         <span className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2">
                            <Upload className="h-4 w-4" /> Alterar Arquivo
                         </span>
                       </div>
                    </div>
                  ) : (
                    <>
                      <ImagePlus className="h-8 w-8 text-muted-foreground/30 group-hover:text-primary transition-colors" />
                      <span className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-widest group-hover:text-primary transition-colors">Carregar Nova Logo</span>
                    </>
                  )}
                </div>
              </div>
              {editingUnit.logoUrl && (
                <div className="flex justify-end mt-2">
                   <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 rounded-xl font-bold text-[10px] uppercase"
                    onClick={() => setEditingUnit({ ...editingUnit, logoUrl: '' })}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Remover Logotipo
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </ConfirmModal>
    </div>
  );
}

function ConfigField({ icon, label, description, value, onChange }: { icon: React.ReactNode, label: string, description: string, value: number, onChange: (val: number) => void }) {
  return (
    <div className="space-y-5 group">
      <div className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-2xl bg-muted/60 flex items-center justify-center text-zinc-400 group-focus-within:bg-primary group-focus-within:text-white transition-all shadow-sm">
          {icon}
        </div>
        <div className="space-y-0.5">
          <label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 group-focus-within:text-foreground transition-colors leading-none">
            {label}
          </label>
          <p className="text-[10px] text-zinc-400 font-bold leading-tight tracking-wide">{description}</p>
        </div>
      </div>
      <div className="relative">
        <Input
          type="number"
          step="1"
          value={isNaN(value) ? '' : value}
          onChange={e => {
            const val = parseFloat(e.target.value);
            onChange(isNaN(val) ? 0 : val);
          }}
          className="h-16 border-border/40 rounded-[20px] font-mono font-bold text-3xl pl-8 pr-16 focus:ring-primary focus:border-primary bg-muted/5 shadow-inner transition-all hover:bg-muted/10 tracking-tighter"
        />
        <div className="absolute right-8 top-1/2 -translate-y-1/2 flex flex-col items-end leading-none opacity-40 group-focus-within:opacity-100 transition-opacity">
           <span className="font-bold text-2xl text-foreground">%</span>
        </div>
      </div>
    </div>
  );
}
