import {
  ArrecadacaoDiaria,
  Cargo,
  Colaborador,
  Configuracao,
  Pool,
  PresencaDiaria,
  StatusPresenca
} from '../types';

export type PoolMetrics = {
  pool: Pool;
  valorPool: number;
  totalPontosPresentes: number;
  valorPonto: number;
  quantidadePresentes: number;
};

export type DayPoolBreakdown = {
  totalLiquido: number;
  salao: PoolMetrics;
  cozinha: PoolMetrics;
};

function createEmptyPoolMetrics(pool: Pool): PoolMetrics {
  return {
    pool,
    valorPool: 0,
    totalPontosPresentes: 0,
    valorPonto: 0,
    quantidadePresentes: 0
  };
}

export function getPontosFixos(colaborador: Pick<Colaborador, 'pontosBase'>, cargo?: Pick<Cargo, 'pontosBase'> | null) {
  return cargo?.pontosBase ?? colaborador.pontosBase ?? 0;
}

export function getNormalizedPoolPercentages(
  config?: Pick<Configuracao, 'percentualPoolCozinha' | 'percentualPoolSalao'> | null
) {
  const percentualPoolCozinha = Number(config?.percentualPoolCozinha ?? 0);
  const percentualPoolSalao = Number(config?.percentualPoolSalao ?? 0);
  const totalPercentual = percentualPoolCozinha + percentualPoolSalao;

  if (totalPercentual <= 0) {
    return {
      percentualPoolCozinha: 0,
      percentualPoolSalao: 0
    };
  }

  return {
    percentualPoolCozinha: percentualPoolCozinha / totalPercentual,
    percentualPoolSalao: percentualPoolSalao / totalPercentual
  };
}

export function getPoolFromCargo(cargo?: Pick<Cargo, 'pool'> | null): Pool | null {
  return cargo?.pool ?? null;
}

export function getSetorFromCargo(
  colaborador?: Pick<Colaborador, 'setor'> | null,
  cargo?: Pick<Cargo, 'pool'> | null
) {
  return getPoolFromCargo(cargo) ?? colaborador?.setor ?? '';
}

export function getPresencaKey(colaboradorId: string, data: string) {
  return `${colaboradorId}:${data}`;
}

export function getCanonicalPresencaId(competenciaId: string, colaboradorId: string, data: string) {
  return `${competenciaId}__${colaboradorId}__${data}`;
}

const NON_PRESENT_STATUSES: StatusPresenca[] = [
  'FALTA',
  'FOLGA',
  'FERIAS',
  'AFASTADO',
  'ADMISSAO',
  'DESLIGAMENTO'
];

function getResolvedStatus(group: PresencaDiaria[]): StatusPresenca {
  const nonPresentStatus = NON_PRESENT_STATUSES.find(status => group.some(presenca => presenca.status === status));
  if (nonPresentStatus) return nonPresentStatus;
  return 'PRESENTE';
}

export function resolvePresencas(presencas: PresencaDiaria[]) {
  const grouped = new Map<string, PresencaDiaria[]>();

  presencas.forEach(presenca => {
    const key = getPresencaKey(presenca.colaboradorId, presenca.data);
    const current = grouped.get(key);
    if (current) {
      current.push(presenca);
      return;
    }
    grouped.set(key, [presenca]);
  });

  return Array.from(grouped.values()).map(group => {
    const [first] = group;
    const canonicalId = getCanonicalPresencaId(first.competenciaId, first.colaboradorId, first.data);
    const canonical = group.find(presenca => presenca.id === canonicalId) ?? first;
    const status = getResolvedStatus(group);

    return {
      ...canonical,
      id: canonicalId,
      status,
      pontosDoDia: status === 'PRESENTE' ? canonical.pontosDoDia : 0
    };
  });
}

export function getResolvedPresencasMap(presencas: PresencaDiaria[]) {
  return new Map(resolvePresencas(presencas).map(presenca => [getPresencaKey(presenca.colaboradorId, presenca.data), presenca] as const));
}

type DayPoolBreakdownParams = {
  date: string;
  arrecadacao?: ArrecadacaoDiaria | null;
  presencas: PresencaDiaria[];
  colaboradores: Colaborador[];
  cargos: Cargo[];
  config?: Configuracao | null;
};

export function getDayPoolBreakdown({
  date,
  arrecadacao,
  presencas,
  colaboradores,
  cargos,
  config
}: DayPoolBreakdownParams): DayPoolBreakdown {
  if (!arrecadacao) {
    return {
      totalLiquido: 0,
      salao: createEmptyPoolMetrics('SALAO'),
      cozinha: createEmptyPoolMetrics('COZINHA')
    };
  }

  const { percentualPoolCozinha, percentualPoolSalao } = getNormalizedPoolPercentages(config);
  const totalLiquido =
    typeof arrecadacao.valorLiquido === 'number'
      ? arrecadacao.valorLiquido
      : arrecadacao.valorBruto * (1 - (config?.retencaoEncargos ?? 0.33));

  const colaboradoresMap = new Map(colaboradores.map(colaborador => [colaborador.id, colaborador] as const));
  const cargosMap = new Map(cargos.map(cargo => [cargo.id, cargo] as const));
  const presencasResolvidas = resolvePresencas(presencas);
  const pontosPorPool: Record<Pool, number> = {
    SALAO: 0,
    COZINHA: 0
  };
  const quantidadePresentesPorPool: Record<Pool, number> = {
    SALAO: 0,
    COZINHA: 0
  };
  const presencasConsideradas = new Set<string>();

  presencasResolvidas.forEach(presenca => {
    if (presenca.data !== date || presenca.status !== 'PRESENTE') return;
    if (presencasConsideradas.has(presenca.colaboradorId)) return;

    const colaborador = colaboradoresMap.get(presenca.colaboradorId);
    if (!colaborador) return;

    const cargo = cargosMap.get(colaborador.cargoId);
    const pool = getPoolFromCargo(cargo);
    if (!pool) return;

    presencasConsideradas.add(presenca.colaboradorId);
    pontosPorPool[pool] += getPontosFixos(colaborador, cargo);
    quantidadePresentesPorPool[pool] += 1;
  });

  const valorPoolSalao = totalLiquido * percentualPoolSalao;
  const valorPoolCozinha = totalLiquido * percentualPoolCozinha;

  return {
    totalLiquido,
    salao: {
      pool: 'SALAO',
      valorPool: valorPoolSalao,
      totalPontosPresentes: pontosPorPool.SALAO,
      valorPonto: pontosPorPool.SALAO > 0 ? valorPoolSalao / pontosPorPool.SALAO : 0,
      quantidadePresentes: quantidadePresentesPorPool.SALAO
    },
    cozinha: {
      pool: 'COZINHA',
      valorPool: valorPoolCozinha,
      totalPontosPresentes: pontosPorPool.COZINHA,
      valorPonto: pontosPorPool.COZINHA > 0 ? valorPoolCozinha / pontosPorPool.COZINHA : 0,
      quantidadePresentes: quantidadePresentesPorPool.COZINHA
    }
  };
}
