import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  addDoc,
  writeBatch
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import {
  Colaborador,
  ArrecadacaoDiaria,
  PresencaDiaria,
  Configuracao,
  Cargo,
  Competencia
} from '../types';

type PoolType = 'COZINHA' | 'SALAO';

type ResultadoAcumulado = {
  colaboradorId: string;
  totalPontos: number;
  valorBrutoCalculado: number;
  valorFinalCentavos: number;
  valorFinal: number;
  criterioResiduoOrdem: number;
  maiorResiduoDiario: number;
};

export async function logAudit(modulo: string, acao: string, entidade: string, entidadeId: string, antes?: any, depois?: any) {
  const userIdentifier = auth.currentUser ? `${auth.currentUser.displayName || 'User'} (${auth.currentUser.uid})` : 'system';
  const auditRef = collection(db, 'auditoria');
  await addDoc(auditRef, {
    modulo,
    usuario: userIdentifier,
    acao,
    entidade,
    entidadeId,
    antes: antes ? JSON.parse(JSON.stringify(antes)) : null,
    depois: depois ? JSON.parse(JSON.stringify(depois)) : null,
    timestamp: new Date().toISOString()
  });
}

function distribuirPoolDoDia(
  elegiveis: Array<{ id: string; nome: string; pontosFixos: number }>,
  poolCents: number
) {
  if (elegiveis.length === 0 || poolCents === 0) return [];

  const totalPontos = elegiveis.reduce((sum, colaborador) => sum + colaborador.pontosFixos, 0);
  if (totalPontos === 0) return [];

  let distributedCents = 0;
  const resultados = elegiveis.map(colaborador => {
    const rawProportion = (colaborador.pontosFixos / totalPontos) * poolCents;
    const floorCents = Math.floor(rawProportion);
    const remainder = rawProportion - floorCents;
    distributedCents += floorCents;

    return {
      colaboradorId: colaborador.id,
      nome: colaborador.nome,
      totalPontos: colaborador.pontosFixos,
      rawProportion,
      floorCents,
      remainder
    };
  });

  const residualCents = poolCents - distributedCents;
  resultados.sort((a, b) => {
    if (b.remainder !== a.remainder) return b.remainder - a.remainder;
    if (b.totalPontos !== a.totalPontos) return b.totalPontos - a.totalPontos;
    return a.nome.localeCompare(b.nome);
  });

  for (let i = 0; i < residualCents; i++) {
    resultados[i].floorCents += 1;
  }

  return resultados.map((resultado, index) => ({
    colaboradorId: resultado.colaboradorId,
    totalPontos: resultado.totalPontos,
    valorBrutoCalculado: resultado.rawProportion / 100,
    valorFinalCentavos: resultado.floorCents,
    valorFinal: resultado.floorCents / 100,
    criterioResiduoOrdem: index < residualCents ? index + 1 : 0,
    remainder: resultado.remainder
  }));
}

export async function calcularCompetencia(competenciaId: string) {
  const batch = writeBatch(db);

  const competenciaSnap = await getDoc(doc(db, 'competencias', competenciaId));
  if (!competenciaSnap.exists()) {
    throw new Error('Competencia nao encontrada');
  }
  const competencia = { id: competenciaSnap.id, ...competenciaSnap.data() } as Competencia;

  const tipsQuery = query(collection(db, 'arrecadacoes'), where('competenciaId', '==', competenciaId));
  const tipsSnap = await getDocs(tipsQuery);
  const arrecadacoes = tipsSnap.docs.map(d => ({ id: d.id, ...d.data() } as ArrecadacaoDiaria));

  const configQuery = query(collection(db, 'configuracoes'), where('competenciaId', '==', competenciaId));
  const configSnap = await getDocs(configQuery);
  if (configSnap.empty) throw new Error('Configuracao nao encontrada para esta competencia');
  const config = configSnap.docs[0].data() as Configuracao;

  const presencasQuery = query(collection(db, 'presencas'), where('competenciaId', '==', competenciaId));
  const presencasSnap = await getDocs(presencasQuery);
  const presencas = presencasSnap.docs.map(d => d.data() as PresencaDiaria);

  const colabsQuery = query(collection(db, 'colaboradores'), where('unitId', '==', competencia.unitId));
  const colabsSnap = await getDocs(colabsQuery);
  const colaboradores = colabsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Colaborador));
  const colaboradoresMap = new Map<string, Colaborador>(
    colaboradores.map(colaborador => [colaborador.id, colaborador] as const)
  );

  const cargosSnap = await getDocs(collection(db, 'cargos'));
  const cargos = cargosSnap.docs.map(d => ({ id: d.id, ...d.data() } as Cargo));
  const cargosMap = new Map<string, Cargo>(cargos.map(cargo => [cargo.id, cargo] as const));

  const resultadosAcumulados = new Map<string, ResultadoAcumulado>();

  const acumularResultado = (
    resultadosDia: Array<{
      colaboradorId: string;
      totalPontos: number;
      valorBrutoCalculado: number;
      valorFinalCentavos: number;
      valorFinal: number;
      criterioResiduoOrdem: number;
      remainder: number;
    }>
  ) => {
    resultadosDia.forEach(resultado => {
      const atual = resultadosAcumulados.get(resultado.colaboradorId);

      if (!atual) {
        resultadosAcumulados.set(resultado.colaboradorId, {
          colaboradorId: resultado.colaboradorId,
          totalPontos: resultado.totalPontos,
          valorBrutoCalculado: resultado.valorBrutoCalculado,
          valorFinalCentavos: resultado.valorFinalCentavos,
          valorFinal: resultado.valorFinal,
          criterioResiduoOrdem: resultado.criterioResiduoOrdem,
          maiorResiduoDiario: resultado.remainder
        });
        return;
      }

      atual.totalPontos = resultado.totalPontos;
      atual.valorBrutoCalculado += resultado.valorBrutoCalculado;
      atual.valorFinalCentavos += resultado.valorFinalCentavos;
      atual.valorFinal = atual.valorFinalCentavos / 100;

      if (
        resultado.criterioResiduoOrdem > 0 &&
        (atual.criterioResiduoOrdem === 0 || resultado.remainder > atual.maiorResiduoDiario)
      ) {
        atual.criterioResiduoOrdem = resultado.criterioResiduoOrdem;
        atual.maiorResiduoDiario = resultado.remainder;
      }
    });
  };

  const distribuirPorPoolNoDia = (data: string, pool: PoolType, poolCents: number) => {
    const elegiveis = presencas
      .filter(presenca => presenca.data === data && presenca.status === 'PRESENTE')
      .map(presenca => colaboradoresMap.get(presenca.colaboradorId))
      .filter((colaborador): colaborador is Colaborador => !!colaborador)
      .map(colaborador => {
        const cargo = cargosMap.get(colaborador.cargoId);
        if (!cargo || cargo.pool !== pool) return null;

        return {
          id: colaborador.id,
          nome: colaborador.nome,
          pontosFixos: cargo.pontosBase ?? colaborador.pontosBase ?? 0
        };
      })
      .filter((colaborador): colaborador is { id: string; nome: string; pontosFixos: number } => !!colaborador);

    return distribuirPoolDoDia(elegiveis, poolCents);
  };

  const percentualSalao = config.percentualPoolSalao ?? 0;
  const percentualCozinha = config.percentualPoolCozinha ?? 0;
  const totalPercentualPools = percentualSalao + percentualCozinha;

  if (totalPercentualPools <= 0) {
    throw new Error('Percentuais de pool invalidos');
  }

  const proporcaoSalao = percentualSalao / totalPercentualPools;
  const proporcaoCozinha = percentualCozinha / totalPercentualPools;

  let totalLiquido = 0;

  arrecadacoes.forEach(arrecadacao => {
    // Sempre recalcular o líquido com base na regra atual da configuração
    const valorLiquidoDia = arrecadacao.valorBruto * (1 - config.retencaoEncargos);

    totalLiquido += valorLiquidoDia;

    const totalCentsDia = Math.round(valorLiquidoDia * 100);
    if (totalCentsDia === 0) return;

    const centsSalaoDia = Math.round(totalCentsDia * proporcaoSalao);
    const centsCozinhaDia = totalCentsDia - centsSalaoDia;

    const resultadosSalao = distribuirPorPoolNoDia(arrecadacao.data, 'SALAO', centsSalaoDia);
    const resultadosCozinha = distribuirPorPoolNoDia(arrecadacao.data, 'COZINHA', centsCozinhaDia);

    acumularResultado(resultadosSalao);
    acumularResultado(resultadosCozinha);
  });

  const allResults = Array.from(resultadosAcumulados.values()).map(resultado => ({
    colaboradorId: resultado.colaboradorId,
    totalPontos: resultado.totalPontos,
    valorBrutoCalculado: Number(resultado.valorBrutoCalculado.toFixed(2)),
    valorFinalCentavos: resultado.valorFinalCentavos,
    valorFinal: resultado.valorFinalCentavos / 100,
    criterioResiduoOrdem: resultado.criterioResiduoOrdem
  }));

  const existingQuery = query(collection(db, 'calculos'), where('competenciaId', '==', competenciaId));
  const existingSnap = await getDocs(existingQuery);
  existingSnap.docs.forEach(d => batch.delete(d.ref));

  allResults.forEach(resultado => {
    const calculoRef = doc(collection(db, 'calculos'));
    batch.set(calculoRef, {
      ...resultado,
      competenciaId
    });
  });

  await batch.commit();
  await logAudit('CALCULO', 'RECALCULAR', 'Competencia', competenciaId, null, {
    totalLiquido,
    percentualSalao,
    percentualCozinha
  });
}
