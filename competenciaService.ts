import { collection, query, where, orderBy, limit, getDocs, addDoc, updateDoc, doc, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Competencia, Configuracao } from '../types';
import { logAudit } from './calculationService';

export async function checkAndInitializeNewMonth(unitId: string): Promise<{ created: boolean; competenciaId: string | null }> {
  if (!unitId || unitId === 'ALL') return { created: false, competenciaId: null };

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const currentLabel = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

  try {
    // 1. Check if current month exists
    const q = query(
      collection(db, 'competencias'),
      where('unitId', '==', unitId),
      where('label', '==', currentLabel),
      limit(1)
    );
    const snap = await getDocs(q);

    if (!snap.empty) {
      return { created: false, competenciaId: snap.docs[0].id };
    }

    // 2. Doesn't exist, create it and copy config
    const competenciaId = await duplicateMonthConfig(unitId, currentMonth, currentYear);
    return { created: true, competenciaId };
  } catch (error) {
    console.error('Error checking/initializing new month:', error);
    return { created: false, competenciaId: null };
  }
}

export async function duplicateMonthConfig(unitId: string, month: number, year: number): Promise<string> {
  const label = `${year}-${String(month).padStart(2, '0')}`;
  
  // 1. Create the new Competencia
  const compPayload: Partial<Competencia> = {
    unitId,
    mes: month,
    ano: year,
    label,
    status: 'ABERTO'
  };
  
  const docRef = await addDoc(collection(db, 'competencias'), compPayload);
  const newCompetenciaId = docRef.id;
  await logAudit('CONFIG', 'CREATE_AUTO', 'Competencia', newCompetenciaId, null, compPayload);

  // 2. Find the previous month's configuration
  const prevQuery = query(
    collection(db, 'competencias'),
    where('unitId', '==', unitId),
    where('label', '<', label),
    orderBy('label', 'desc'),
    limit(1)
  );
  
  const prevSnap = await getDocs(prevQuery);
  
  if (!prevSnap.empty) {
    const prevComp = { id: prevSnap.docs[0].id, ...prevSnap.docs[0].data() } as Competencia;
    
    // Copy Configuracao
    const configQuery = query(collection(db, 'configuracoes'), where('competenciaId', '==', prevComp.id));
    const configSnap = await getDocs(configQuery);
    
    if (!configSnap.empty) {
      const prevConfig = configSnap.docs[0].data() as Configuracao;
      const newConfig: Partial<Configuracao> = {
        ...prevConfig,
        competenciaId: newCompetenciaId,
        unitId: unitId,
        ativo: true
      };
      // @ts-ignore
      delete newConfig.id;
      
      await addDoc(collection(db, 'configuracoes'), newConfig);
      await logAudit('CONFIG', 'DUPLICATE', 'Configuracao', newCompetenciaId, { fromCompetenciaId: prevComp.id }, newConfig);
    }
  } else {
    // If no previous month, create a default config
    const defaultConfig: Partial<Configuracao> = {
      competenciaId: newCompetenciaId,
      unitId: unitId,
      percentualGorjeta: 0.10,
      retencaoEncargos: 0.20,
      percentualPoolCozinha: 0.30,
      percentualPoolSalao: 0.70,
      ativo: true
    };
    await addDoc(collection(db, 'configuracoes'), defaultConfig);
  }

  return newCompetenciaId;
}
