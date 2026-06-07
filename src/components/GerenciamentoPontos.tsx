import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, updateDoc, doc, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Cargo, Colaborador, Unit } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { 
  Briefcase, 
  Users, 
  ChevronRight, 
  Search, 
  Save, 
  UserPlus, 
  UserMinus,
  Calculator,
  ArrowRightLeft,
  Building2,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { logAudit } from '../services/calculationService';

export default function GerenciamentoPontos() {
  const { profile } = useAuth();
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedCargoId, setSelectedCargoId] = useState<string | null>(null);
  const [cargoSearchTerm, setCargoSearchTerm] = useState('');
  const [colaboradorSearchTerm, setColaboradorSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [isEditingPoints, setIsEditingPoints] = useState<string | null>(null);
  const [editPointsValue, setEditPointsValue] = useState<number>(0);

  useEffect(() => {
    const unsubCargos = onSnapshot(collection(db, 'cargos'), (snapshot) => {
      const cargosData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Cargo));
      setCargos(cargosData.sort((a, b) => a.nome.localeCompare(b.nome)));
      if (!selectedCargoId && cargosData.length > 0) {
        setSelectedCargoId(cargosData[0].id);
      }
    });

    let qColabs = query(collection(db, 'colaboradores'));
    if (profile?.unitId && profile.unitId !== 'ALL') {
      qColabs = query(collection(db, 'colaboradores'), where('unitId', '==', profile.unitId));
    }
    const unsubColabs = onSnapshot(qColabs, (snapshot) => {
      setColaboradores(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Colaborador)));
    });

    const unsubUnits = onSnapshot(collection(db, 'units'), (snapshot) => {
      setUnits(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Unit)));
    });

    return () => {
      unsubCargos();
      unsubColabs();
      unsubUnits();
    };
  }, [profile?.unitId, selectedCargoId]);

  const handleUpdateCargoPoints = async (cargoId: string) => {
    if (editPointsValue < 0) {
      toast.error('A pontuação não pode ser negativa');
      return;
    }

    setLoading(true);
    try {
      const cargo = cargos.find(c => c.id === cargoId);
      await updateDoc(doc(db, 'cargos', cargoId), { pontosBase: editPointsValue });
      
      // Update all collaborators with this cargo to have the new pointsBase (optional, depending on business rule)
      // Usually, collaborators should inherit pointsBase from cargo unless explicitly overridden.
      // In this system, it seems collaborators have their own pontosBase field.
      const colabsToUpdate = colaboradores.filter(c => c.cargoId === cargoId);
      for (const colab of colabsToUpdate) {
        await updateDoc(doc(db, 'colaboradores', colab.id), { pontosBase: editPointsValue });
      }

      await logAudit('CARGOS', 'UPDATE_POINTS', 'Cargo', cargoId, { oldPoints: cargo?.pontosBase }, { newPoints: editPointsValue });
      toast.success('Pontuação atualizada com sucesso');
      setIsEditingPoints(null);
    } catch (error) {
      toast.error('Erro ao atualizar pontuação');
    } finally {
      setLoading(false);
    }
  };

  const handleChangeColabCargo = async (colabId: string, newCargoId: string) => {
    setLoading(true);
    try {
      const colab = colaboradores.find(c => c.id === colabId);
      const newCargo = cargos.find(c => c.id === newCargoId);
      
      if (!newCargo) return;

      await updateDoc(doc(db, 'colaboradores', colabId), { 
        cargoId: newCargoId,
        pontosBase: newCargo.pontosBase 
      });

      await logAudit('COLABORADORES', 'CHANGE_CARGO', 'Colaborador', colabId, { oldCargoId: colab?.cargoId }, { newCargoId });
      toast.success(`${colab?.nome} movido para ${newCargo.nome}`);
    } catch (error) {
      toast.error('Erro ao mover colaborador');
    } finally {
      setLoading(false);
    }
  };

  const filteredCargos = cargos.filter(c => 
    c.nome.toLowerCase().includes(cargoSearchTerm.toLowerCase())
  );

  const selectedCargo = cargos.find(c => c.id === selectedCargoId);
  
  const colabsInCargo = colaboradores.filter(c => c.cargoId === selectedCargoId)
    .sort((a, b) => a.nome.localeCompare(b.nome));

  const availableColabs = colaboradores.filter(c => 
    c.cargoId !== selectedCargoId && 
    (c.nome.toLowerCase().includes(colaboradorSearchTerm.toLowerCase()) || 
     c.setor?.toLowerCase().includes(colaboradorSearchTerm.toLowerCase()))
  ).sort((a, b) => a.nome.localeCompare(b.nome));

  return (
    <div className="space-y-8 pb-10">
      {/* Header */}
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <motion.h1 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-3xl font-bold tracking-tight text-zinc-900 flex items-center gap-3"
          >
            <div className="p-2 bg-zinc-900 rounded-xl text-white">
              <Calculator className="h-6 w-6" />
            </div>
            Gestão de Pontos
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-zinc-500 font-semibold text-sm tracking-wide"
          >
            Definição de pontuação base e alocação de equipe por cargo.
          </motion.p>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Cargos List */}
        <div className="lg:col-span-4 space-y-4">
          <Card className="border-none shadow-xl shadow-zinc-200/50 rounded-3xl overflow-hidden bg-white">
            <CardHeader className="p-6 border-b border-zinc-100 bg-zinc-50/50">
              <CardTitle className="text-sm font-bold uppercase tracking-widest text-zinc-400">
                Selecione o Cargo
              </CardTitle>
              <div className="relative mt-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                <Input 
                  placeholder="Buscar cargo..."
                  value={cargoSearchTerm}
                  onChange={e => setCargoSearchTerm(e.target.value)}
                  className="pl-10 h-10 border-zinc-200 rounded-xl text-sm font-bold"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0 max-h-[600px] overflow-y-auto custom-scrollbar">
              <div className="divide-y divide-zinc-50">
                {filteredCargos.map((cargo) => (
                  <button
                    key={cargo.id}
                    onClick={() => setSelectedCargoId(cargo.id)}
                    className={`
                      w-full text-left p-5 flex items-center justify-between transition-all group
                      ${selectedCargoId === cargo.id ? 'bg-primary text-white shadow-lg' : 'hover:bg-zinc-50'}
                    `}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`
                        h-10 w-10 rounded-xl flex items-center justify-center shrink-0 transition-all
                        ${selectedCargoId === cargo.id ? 'bg-white/20' : 'bg-zinc-100 text-zinc-400'}
                      `}>
                        <Briefcase className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className={`font-bold truncate ${selectedCargoId === cargo.id ? 'text-white' : 'text-zinc-900'}`}>
                          {cargo.nome}
                        </p>
                        <p className={`text-[10px] font-bold uppercase tracking-widest ${selectedCargoId === cargo.id ? 'text-white/60' : 'text-zinc-400'}`}>
                          {cargo.pool}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge className={`
                        rounded-full px-2 py-0.5 text-[10px] font-mono font-bold border-none
                        ${selectedCargoId === cargo.id ? 'bg-white text-primary' : 'bg-zinc-100 text-zinc-600'}
                      `}>
                        {cargo.pontosBase.toFixed(1)}
                      </Badge>
                      <div className={`transition-all ${selectedCargoId === cargo.id ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2'}`}>
                        <ChevronRight className="h-4 w-4" />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Cargo Details & Members */}
        <div className="lg:col-span-8 space-y-6">
          <AnimatePresence mode="wait">
            {selectedCargo ? (
              <motion.div
                key={selectedCargo.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                {/* Configuração de Pontos */}
                <Card className="border-none shadow-xl shadow-zinc-200/50 rounded-3xl overflow-hidden bg-white">
                  <CardHeader className="p-8 border-b border-zinc-100">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                      <div className="flex items-center gap-4">
                        <div className="h-14 w-14 rounded-2xl bg-zinc-900 text-white flex items-center justify-center shadow-lg">
                          <Briefcase className="h-6 w-6" />
                        </div>
                        <div>
                          <h2 className="text-2xl font-bold text-zinc-900 tracking-tight">{selectedCargo.nome}</h2>
                          <div className="flex gap-2 mt-1">
                            <Badge variant="outline" className="rounded-xl bg-zinc-50 text-[10px] uppercase font-bold tracking-widest border-border/40">
                              {selectedCargo.pool}
                            </Badge>
                            <Badge variant="outline" className="rounded-xl bg-zinc-50 text-[10px] uppercase font-bold tracking-widest border-border/40">
                              {colabsInCargo.length} Colaboradores
                            </Badge>
                          </div>
                        </div>
                      </div>

                      <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100 flex items-center gap-6">
                        <div className="space-y-1">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Pontuação Base</p>
                          {isEditingPoints === selectedCargo.id ? (
                            <div className="flex items-center gap-2">
                              <Input 
                                type="number" 
                                step="0.1"
                                value={editPointsValue}
                                onChange={e => setEditPointsValue(parseFloat(e.target.value) || 0)}
                                className="w-24 h-10 border-zinc-200 rounded-xl font-mono font-bold text-lg"
                                autoFocus
                              />
                              <Button 
                                size="icon" 
                                className="h-10 w-10 bg-primary rounded-xl border-none"
                                onClick={() => handleUpdateCargoPoints(selectedCargo.id)}
                                disabled={loading}
                              >
                                {loading ? <div className="h-4 w-4 animate-spin border-2 border-white/30 border-t-white rounded-full" /> : <Save className="h-4 w-4" />}
                              </Button>
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                className="h-10 w-10 text-zinc-400"
                                onClick={() => setIsEditingPoints(null)}
                              >
                                <UserMinus className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-4">
                              <span className="text-3xl font-bold text-zinc-900 font-mono tracking-tighter">
                                {selectedCargo.pontosBase.toFixed(1)}
                              </span>
                              <Button 
                                variant="outline" 
                                className="h-10 px-4 rounded-xl border-zinc-200 font-bold gap-2 hover:bg-primary hover:text-white hover:border-primary transition-all uppercase text-[10px] tracking-widest"
                                onClick={() => {
                                  setIsEditingPoints(selectedCargo.id);
                                  setEditPointsValue(selectedCargo.pontosBase);
                                }}
                              >
                                Alterar
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="bg-zinc-50 border-b border-zinc-100 p-8">
                       <h3 className="text-lg font-bold text-zinc-900 mb-6 flex items-center gap-2 uppercase tracking-widest text-[11px] text-zinc-400">
                         <Users className="h-5 w-5 text-zinc-400" />
                         Integrantes do Cargo
                       </h3>
                       
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                         {colabsInCargo.map((colab) => (
                           <motion.div 
                             key={colab.id}
                             layout
                             initial={{ opacity: 0, scale: 0.95 }}
                             animate={{ opacity: 1, scale: 1 }}
                             className="bg-white border border-zinc-200 rounded-2xl p-4 flex items-center justify-between group hover:shadow-md transition-all shadow-sm"
                           >
                             <div className="flex items-center gap-3 min-w-0">
                               <div className="h-10 w-10 rounded-xl bg-zinc-100 flex items-center justify-center font-bold text-zinc-400 shadow-inner uppercase">
                                 {colab.nome.charAt(0)}
                               </div>
                               <div className="min-w-0">
                                 <p className="font-bold text-zinc-900 truncate leading-tight uppercase text-xs">{colab.nome}</p>
                                 <div className="flex items-center gap-1.5 mt-0.5">
                                   <p className="text-[9px] font-bold uppercase text-zinc-400 tracking-widest truncate">
                                     {colab.setor || 'Sem setor'}
                                   </p>
                                   <div className="h-1 w-1 rounded-full bg-zinc-200" />
                                   <Badge className="bg-emerald-50 text-emerald-600 text-[8px] h-4 rounded-lg uppercase font-bold p-1 tracking-widest border-none">
                                      {units.find(u => u.id === colab.unitId)?.name || 'N/A'}
                                   </Badge>
                                 </div>
                               </div>
                             </div>
                             <div className="flex items-center gap-2">
                               <div className="text-right mr-2 hidden sm:block">
                                   <p className="text-[9px] font-bold text-zinc-400 uppercase leading-none tracking-widest">Pontos</p>
                                   <p className="text-sm font-bold text-zinc-900 font-mono tracking-tighter">{colab.pontosBase.toFixed(1)}</p>
                               </div>
                             </div>
                           </motion.div>
                         ))}
                         {colabsInCargo.length === 0 && (
                            <div className="md:col-span-2 py-12 text-center border-2 border-dashed border-zinc-200 rounded-2xl text-zinc-400 font-bold uppercase text-[10px] tracking-widest">
                              Nenhum colaborador vinculado a este cargo.
                            </div>
                         )}
                       </div>
                    </div>

                    <div className="p-8">
                       <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                         <h3 className="text-lg font-bold text-zinc-400 flex items-center gap-2 uppercase tracking-widest text-[11px]">
                           <ArrowRightLeft className="h-5 w-5 text-zinc-400" />
                           Mover Colaboradores para este Cargo
                         </h3>
                         <div className="relative w-full md:w-64">
                           <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                           <Input 
                             placeholder="Buscar colaboradores..."
                             value={colaboradorSearchTerm}
                             onChange={e => setColaboradorSearchTerm(e.target.value)}
                             className="pl-10 h-10 border-zinc-200 rounded-xl text-sm font-bold"
                           />
                         </div>
                       </div>
                       
                       <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                         {availableColabs.map((colab) => {
                           const currentCargo = cargos.find(c => c.id === colab.cargoId);
                           return (
                             <div 
                               key={colab.id}
                               className="bg-zinc-50 border border-zinc-100 rounded-2xl p-4 flex items-center justify-between hover:bg-zinc-100 transition-all group shadow-sm"
                             >
                               <div className="flex items-center gap-3 min-w-0">
                                 <div className="h-10 w-10 rounded-xl bg-white border border-zinc-100 flex items-center justify-center font-bold text-zinc-400 shadow-sm uppercase">
                                   {colab.nome.charAt(0)}
                                 </div>
                                 <div className="min-w-0">
                                   <p className="font-bold text-zinc-900 truncate leading-tight uppercase text-xs">{colab.nome}</p>
                                   <div className="flex items-center gap-2 mt-0.5">
                                      <p className="text-[9px] font-bold uppercase text-zinc-400 tracking-widest truncate">
                                        Atual: {currentCargo?.nome || 'N/A'}
                                      </p>
                                      <Badge variant="outline" className="text-[9px] font-mono py-0 h-4 bg-white font-bold tracking-tighter rounded-lg">
                                        {colab.pontosBase.toFixed(1)} pts
                                      </Badge>
                                   </div>
                                 </div>
                               </div>
                               <Button 
                                 size="sm"
                                 className="rounded-xl h-10 px-4 bg-white border-zinc-200 text-zinc-900 hover:bg-primary hover:text-white hover:border-primary flex items-center gap-2 group-hover:shadow-md transition-all font-bold uppercase text-[10px] tracking-widest"
                                 onClick={() => handleChangeColabCargo(colab.id, selectedCargo.id)}
                                 disabled={loading}
                               >
                                 <UserPlus className="h-4 w-4 shrink-0" />
                                 <span className="hidden sm:inline">Mover Aqui</span>
                               </Button>
                             </div>
                           )
                         })}
                         {availableColabs.length === 0 && (
                            <div className="py-12 text-center text-zinc-400 italic font-bold uppercase text-[10px] tracking-widest">
                               Nenhum colaborador disponível para movimentação.
                            </div>
                         )}
                       </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ) : (
              <div className="h-full flex items-center justify-center py-20 text-center">
                 <div className="space-y-4 max-w-sm">
                   <div className="h-20 w-20 bg-zinc-100 rounded-3xl flex items-center justify-center mx-auto text-zinc-300">
                      <Briefcase className="h-10 w-10" />
                   </div>
                   <h3 className="text-xl font-bold text-zinc-900">Selecione um Cargo</h3>
                   <p className="text-zinc-500">Escolha um cargo na lista lateral para gerenciar suas pontuações e membros.</p>
                 </div>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
