export type UserRole = 'admin' | 'viewer' | 'ADMIN' | 'VIEWER' | 'GERENTE' | 'GESTOR' | 'gerente' | 'gestor';
export type AccessRequestStatus = 'PENDENTE' | 'APROVADO' | 'REJEITADO';
export type Pool = 'COZINHA' | 'SALAO';
export type StatusColaborador = 'ATIVO' | 'INATIVO';
export type StatusPresenca = 'PRESENTE' | 'FALTA' | 'FOLGA' | 'FERIAS' | 'AFASTADO' | 'ADMISSAO' | 'DESLIGAMENTO';
export type StatusCompetencia = 'ABERTO' | 'FECHADO';

export interface AuthGate {
  title: string;
  message: string;
  tone: 'warning' | 'danger' | 'info';
}

export interface UserProfile {
  id: string; // compatibility
  uid: string;
  email: string;
  nome: string;
  name?: string; // compatibility
  role: UserRole;
  ativo: boolean;
  active?: boolean; // compatibility
  telefone: string;
  unitId: string;
  authUid: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccessRequest {
  id: string;
  uid: string;
  email: string;
  nome: string;
  name?: string; // compatibility
  status: AccessRequestStatus;
  requestedAt: string;
  updatedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export interface Unit {
  id: string;
  name: string;
  logoUrl?: string;
}

export interface Competencia {
  id: string;
  unitId: string;
  mes: number;
  ano: number;
  label: string; // YYYY-MM
  status: StatusCompetencia;
  dataFechamento?: string;
  fechadoPor?: string;
}

export interface Configuracao {
  id: string;
  unitId: string;
  competenciaId: string;
  percentualGorjeta: number;
  retencaoEncargos: number;
  percentualPoolCozinha: number;
  percentualPoolSalao: number;
  ativo: boolean;
}

export interface Cargo {
  id: string;
  nome: string;
  pontosBase: number;
  pool: Pool;
  ativo: boolean;
}

export interface Colaborador {
  id: string;
  unitId: string;
  nome: string;
  cargoId: string;
  setor: string;
  status: StatusColaborador;
  pontosBase: number;
  dataAdmissao: string;
  dataDesligamento?: string;
  nomeMae?: string;
  endereco?: string;
  bairro?: string;
  cidade?: string;
  observacoes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PresencaDiaria {
  id: string;
  competenciaId: string;
  colaboradorId: string;
  data: string; // ISO Date
  status: StatusPresenca;
  pontosDoDia: number;
}

export interface ArrecadacaoDiaria {
  id: string;
  competenciaId: string;
  data: string;
  valorBruto: number;
  valorLiquido: number;
  observacoes?: string;
}

export interface CalculoMensal {
  id: string;
  competenciaId: string;
  colaboradorId: string;
  totalPontos: number;
  valorBrutoCalculado: number; // Theoretical proportion
  valorFinalCentavos: number; // Integer cents
  valorFinal: number; // valorFinalCentavos / 100
  criterioResiduoOrdem: number; // Position in residual distribution
}

export interface ConfirmacaoFaltas {
  id: string;
  userId: string;
  userName: string;
  date: string; // ISO Date YYYY-MM-DD representing THE DAY of confirmation
  timestamp: string;
  unitId: string;
}

export interface Auditoria {
  id: string;
  modulo: string;
  entidade: string;
  entidadeId: string;
  acao: string;
  antes?: any;
  depois?: any;
  usuario: string;
  timestamp: string;
}
