import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react';
import { Button } from './ui/button';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserProfile } from '../types';
import { toast } from 'sonner';

interface FaltasConfirmationModalProps {
  isOpen: boolean;
  profile: UserProfile;
  onConfirm: () => void;
  onGoToLancamentos: () => void;
}

export function FaltasConfirmationModal({ isOpen, profile, onConfirm, onGoToLancamentos }: FaltasConfirmationModalProps) {
  const [loading, setLoading] = React.useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      await addDoc(collection(db, 'confirmacoes_faltas'), {
        userId: profile.uid,
        userName: profile.nome || profile.name || 'Usuário',
        date: today,
        timestamp: new Date().toISOString(),
        unitId: profile.unitId || 'ALL'
      });
      toast.success('Confirmação registrada com sucesso!');
      onConfirm();
    } catch (error) {
      console.error('Error confirming faltas:', error);
      toast.error('Erro ao registrar confirmação.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-zinc-950/40 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="w-full max-w-lg bg-white rounded-[40px] shadow-2xl overflow-hidden border border-zinc-200"
          >
            <div className="bg-amber-500 p-10 text-white text-center relative overflow-hidden">
               <div className="absolute inset-0 bg-gradient-to-br from-amber-500 to-amber-600 opacity-90" />
               <div className="relative z-10 flex flex-col items-center">
                  <div className="h-20 w-20 bg-white/20 backdrop-blur-xl rounded-3xl flex items-center justify-center mb-6 border border-white/30 shadow-xl shadow-amber-900/10">
                    <AlertCircle className="h-10 w-10 text-white" />
                  </div>
                  <h2 className="text-3xl font-black tracking-tight leading-none mb-2">Tudo certo para começar?</h2>
                  <p className="text-amber-100/80 text-[10px] font-black uppercase tracking-[0.3em]">Controle de Lançamentos</p>
               </div>
            </div>

            <div className="p-10 space-y-8">
              <div className="bg-amber-50/50 border border-amber-100/50 p-6 rounded-3xl">
                <p className="text-zinc-600 text-base font-medium leading-relaxed text-center">
                  Antes de seguir, confirme se as faltas de <span className="font-black text-amber-600 underline underline-offset-4 decoration-amber-200">ontem</span> já foram lançadas. Esse controle evita erro no fechamento da gorjeta.
                </p>
              </div>

              <div className="flex flex-col gap-4">
                <Button 
                  onClick={onGoToLancamentos}
                  variant="outline"
                  className="h-16 rounded-2xl border-zinc-200 hover:bg-zinc-50 font-black uppercase text-[11px] tracking-widest gap-3 transition-all active:scale-[0.98] border-none shadow-xl shadow-zinc-200/50 ring-1 ring-zinc-200/50"
                >
                  <ArrowRight className="h-4 w-4" />
                  Lançar faltas agora
                </Button>
                
                <Button 
                  onClick={handleConfirm}
                  disabled={loading}
                  className="h-16 bg-zinc-900 hover:bg-zinc-800 text-white font-black rounded-2xl gap-3 shadow-xl shadow-zinc-900/10 transition-all active:scale-[0.98] text-base border-none uppercase text-[11px] tracking-widest"
                >
                  {loading ? (
                    <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-5 w-5" />
                  )}
                  Confirmo que as faltas já foram lançadas
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
