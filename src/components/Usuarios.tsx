import React, { useEffect, useMemo, useState } from 'react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { collection, doc, getDocs, onSnapshot, setDoc } from 'firebase/firestore';
import { RefreshCw, Search, Building2, UserPlus, ShieldCheck, Mail, Calendar, Settings2, Trash2, Edit2, X, Check, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { normalizeEmail, isBootstrapAdmin } from '../services/userService';
import { normalizeDataForFirestore, normalizeToUppercase } from '../lib/normalization';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Switch } from './ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { UserRole, AccessRequestStatus, Unit, UserProfile, AccessRequest } from '../types';

type ManagedUser = UserProfile & {
  dirty?: boolean;
};

const BOOTSTRAP_ADMIN = 'gustavobarakat1303@gmail.com';

const formatDate = (value?: string) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('pt-BR');
};

const sortUsers = (items: ManagedUser[]) =>
  [...items].sort((a, b) => {
    const roleA = a.role.toUpperCase();
    const roleB = b.role.toUpperCase();
    if (roleA !== roleB) return roleA === 'ADMIN' ? -1 : 1;
    return (a.nome || a.name || '').localeCompare(b.nome || b.name || '', 'pt-BR');
  });

export default function Usuarios() {
  const { user, isAdmin } = useAuth();
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [approvalRoles, setApprovalRoles] = useState<Record<string, UserRole>>({});
  const [approvalUnits, setApprovalUnits] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);

    try {
      const [requestSnap, userSnap, unitSnap] = await Promise.all([
        getDocs(collection(db, 'access_requests')),
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'units')),
      ]);

      const nextRequests = requestSnap.docs.map((item) => ({
        id: item.id,
        ...(item.data() as any),
      })) as AccessRequest[];

      const nextUsers = userSnap.docs.map((item) => ({
        id: item.id,
        ...(item.data() as any),
      })) as ManagedUser[];

      const nextUnits = unitSnap.docs.map(item => ({
        id: item.id,
        ...item.data()
      })) as Unit[];

      setRequests(nextRequests);
      setUsers(sortUsers(nextUsers));
      setUnits(nextUnits.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (error) {
      console.error(error);
      toast.error('Nao foi possivel carregar os usuarios.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();

    // Listener em tempo real para novos pedidos de acesso
    const unsubRequests = onSnapshot(collection(db, 'access_requests'), (snap) => {
      const nextRequests = snap.docs.map((item) => ({
        id: item.id,
        ...(item.data() as any),
      })) as AccessRequest[];
      setRequests(nextRequests);
    });
    return () => unsubRequests();
  }, []);

  const pendingRequests = useMemo(() => {
    const term = search.trim().toLowerCase();
    return requests
      .filter((item: any) => item.status === 'PENDENTE')
      .filter((item: any) => {
        if (!term) return true;
        const searchName = item.nome || item.name || '';
        const searchPhone = item.telefone || '';
        return `${searchName} ${item.email} ${searchPhone}`.toLowerCase().includes(term);
      })
      .sort((a, b) => (a.requestedAt || '').localeCompare(b.requestedAt || ''));
  }, [requests, search]);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((item) => {
      if (!term) return true;
      const searchName = item.nome || item.name || '';
      const searchPhone = item.telefone || '';
      return `${searchName} ${item.email} ${searchPhone}`.toLowerCase().includes(term);
    });
  }, [users, search]);

  const updateUserDraft = (id: string, patch: Partial<ManagedUser>) => {
    setUsers((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              ...patch,
              dirty: true,
            }
          : item
      )
    );
  };

  const handleApprove = async (request: any) => {
    const now = new Date().toISOString();
    const role = approvalRoles[request.id] || 'viewer';
    const unitId = approvalUnits[request.id] || 'ALL';

    setSavingId(request.id);

    try {
      const newUser: Partial<UserProfile> = {
        uid: request.uid || request.id,
        authUid: request.authUid || request.id,
        email: normalizeEmail(request.email),
        nome: normalizeToUppercase(request.nome || request.name || 'Usuario'),
        name: normalizeToUppercase(request.nome || request.name || 'Usuario'),
        role: role as any,
        ativo: true,
        active: true,
        unitId,
        updatedAt: now,
      };

      if (!request.createdAt) {
        newUser.createdAt = now;
      }

      await setDoc(doc(db, 'users', request.uid || request.id), newUser, { merge: true });

      await setDoc(
        doc(db, 'access_requests', request.id),
        {
          status: 'APROVADO',
          reviewedAt: now,
          reviewedBy: user?.email || 'admin',
          updatedAt: now,
        },
        { merge: true }
      );

      toast.success('Solicitacao aprovada com sucesso.');
      await loadData();
    } catch (error) {
      console.error(error);
      toast.error('Nao foi possivel aprovar o acesso.');
    } finally {
      setSavingId(null);
    }
  };

  const handleReject = async (request: AccessRequest) => {
    const now = new Date().toISOString();

    setSavingId(request.id);

    try {
      await setDoc(
        doc(db, 'access_requests', request.id),
        {
          status: 'REJEITADO',
          reviewedAt: now,
          reviewedBy: user?.email || 'admin',
          updatedAt: now,
        },
        { merge: true }
      );

      toast.success('Solicitacao rejeitada.');
      await loadData();
    } catch (error) {
      console.error(error);
      toast.error('Nao foi possivel rejeitar a solicitacao.');
    } finally {
      setSavingId(null);
    }
  };

  const handleSaveUser = async (item: ManagedUser) => {
    const isBootstrap = isBootstrapAdmin(item.email);
    const now = new Date().toISOString();

    const normalizedItem = normalizeDataForFirestore(item, ['nome', 'name']);
    const payload: any = {
      ...normalizedItem,
      role: isBootstrap ? 'admin' : item.role.toLowerCase(),
      ativo: isBootstrap ? true : item.ativo,
      active: isBootstrap ? true : (item.ativo ?? item.active),
      updatedAt: now,
    };

    delete payload.dirty;

    setSavingId(item.id);

    try {
      await setDoc(doc(db, 'users', item.id), payload, { merge: true });

      setUsers((current) =>
        sortUsers(
          current.map((entry) =>
            entry.id === item.id
              ? {
                  ...entry,
                  ...payload,
                  dirty: false,
                }
              : entry
          )
        )
      );

      toast.success('Usuario atualizado com sucesso.');
    } catch (error) {
      console.error(error);
      toast.error('Nao foi possivel salvar o usuario.');
    } finally {
      setSavingId(null);
    }
  };

  if (!isAdmin) {
    return (
      <Card className="border-zinc-200 shadow-sm">
        <CardHeader>
          <CardTitle>Acesso Restrito</CardTitle>
          <CardDescription>Apenas administradores podem gerenciar usuarios.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-1">
        <div className="flex items-center gap-6">
          <div className="h-16 w-16 rounded-[22px] bg-primary flex items-center justify-center text-white shadow-xl shadow-primary/30 rotate-2">
            <ShieldCheck className="h-8 w-8 -rotate-2" />
          </div>
          <div className="space-y-1">
            <motion.h1 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-3xl font-bold text-foreground flex items-center gap-3"
            >
               Gestão de Acessos
               <Badge className="bg-primary/10 text-primary border-none px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest leading-none">Security</Badge>
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-zinc-500 font-semibold text-sm tracking-wide"
            >
               Controle de permissões, níveis de acesso e auditoria de usuários.
            </motion.p>
          </div>
        </div>
        <Button 
          variant="outline" 
          onClick={() => void loadData()} 
          disabled={loading}
          className="rounded-xl border-border/60 h-12 px-6 font-bold uppercase text-[10px] tracking-widest hover:bg-white hover:border-primary/40 text-muted-foreground shadow-sm transition-all w-full md:w-auto"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Sincronizar Base
        </Button>
      </div>

      <Card className="border-border/50 shadow-2xl shadow-muted/50 rounded-[40px] overflow-hidden bg-white ring-1 ring-border/5">
        <CardHeader className="p-10 border-b border-border/60 bg-muted/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-32 -mt-32" />
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 relative">
            <div className="space-y-2">
              <CardTitle className="text-xl font-bold text-foreground uppercase tracking-widest leading-none">Busca Avançada</CardTitle>
              <CardDescription className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Filtre por nome, e-mail ou identificador</CardDescription>
            </div>
            
            <div className="relative w-full md:w-[450px] group">
              <div className="absolute left-5 top-1/2 -translate-y-1/2 transition-colors group-focus-within:text-primary text-muted-foreground">
                <Search className="h-5 w-5" />
              </div>
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Ex: Gustavo Barakat ou gustavo@..."
                className="pl-14 h-14 rounded-xl border-border/40 bg-white focus:ring-4 focus:ring-primary/5 transition-all font-bold placeholder:text-muted-foreground/30 text-foreground"
              />
              {search && (
                <button 
                  onClick={() => setSearch('')}
                  className="absolute right-5 top-1/2 -translate-y-1/2 p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card className="border-border/50 shadow-2xl shadow-muted/50 rounded-[40px] overflow-hidden bg-white ring-1 ring-border/5">
        <CardHeader className="p-10 border-b border-border/60 bg-primary/5">
          <div className="flex items-center gap-6">
            <div className="h-14 w-14 bg-white border border-primary/20 rounded-[22px] flex items-center justify-center text-primary shadow-lg shadow-primary/10">
              <UserPlus className="h-7 w-7" />
            </div>
            <div>
              <CardTitle className="text-xl font-bold text-foreground uppercase tracking-widest leading-none mb-2">Solicitações de Ingresso</CardTitle>
              <CardDescription className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Aguardando validação da diretoria</CardDescription>
            </div>
            <Badge className="ml-auto bg-primary text-white border-none rounded-xl px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest shadow-lg shadow-primary/20">
              {pendingRequests.length} PENDENTES
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Desktop Table Requests */}
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow className="hover:bg-transparent border-b border-border/60">
                  <TableHead className="py-6 px-10 text-[11px] font-bold uppercase tracking-widest text-zinc-500 leading-none">Candidato</TableHead>
                  <TableHead className="py-6 px-10 text-[11px] font-bold uppercase tracking-widest text-zinc-500 leading-none">Perfil Sugerido</TableHead>
                  <TableHead className="py-6 px-10 text-[11px] font-bold uppercase tracking-widest text-zinc-500 leading-none">Unidade Foco</TableHead>
                  <TableHead className="py-6 px-10 text-[11px] font-bold uppercase tracking-widest text-zinc-500 leading-none">Timeline</TableHead>
                  <TableHead className="py-6 px-10 text-[11px] font-bold uppercase tracking-widest text-zinc-500 leading-none text-right">Avaliação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingRequests.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-32 text-center">
                      <div className="flex flex-col items-center gap-6">
                        <div className="h-24 w-24 bg-muted/30 rounded-3xl flex items-center justify-center text-muted-foreground/20">
                          <Check className="h-12 w-12" />
                        </div>
                        <p className="text-zinc-400 font-bold uppercase tracking-widest text-[11px]">Nenhuma pendência detectada</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  pendingRequests.map((item: any) => (
                    <TableRow key={item.id} className="group hover:bg-muted/10 transition-colors border-b border-border/40 last:border-0">
                      <TableCell className="py-8 px-10">
                        <div className="flex items-center gap-4">
                          <div className="h-12 w-12 bg-muted rounded-2xl flex items-center justify-center text-muted-foreground group-hover:bg-primary group-hover:text-white transition-all font-bold uppercase text-sm shadow-inner">
                            {(item.nome || item.name || 'U').charAt(0)}
                          </div>
                          <div>
                            <p className="font-bold text-foreground leading-none mb-2 text-base">{item.nome || item.name}</p>
                            <p className="text-[11px] font-bold text-zinc-400 tracking-wider font-mono">{item.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-8 px-10">
                        <Select
                          value={approvalRoles[item.id] || 'viewer'}
                          onValueChange={(value) =>
                            setApprovalRoles((current) => ({
                              ...current,
                              [item.id]: value as UserRole,
                            }))
                          }
                        >
                          <SelectTrigger className="w-[150px] h-12 rounded-xl border-border/50 font-bold bg-white focus:ring-primary shadow-sm uppercase text-[10px] tracking-widest">
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl border-border/40 bg-white/95 backdrop-blur-xl">
                            <SelectItem value="viewer" className="font-bold rounded-lg text-[10px] tracking-widest uppercase">VIEWER</SelectItem>
                            <SelectItem value="gerente" className="font-bold rounded-lg text-[10px] tracking-widest uppercase">GERENTE</SelectItem>
                            <SelectItem value="gestor" className="font-bold rounded-lg text-[10px] tracking-widest uppercase">GESTOR</SelectItem>
                            <SelectItem value="admin" className="font-bold rounded-lg text-[10px] tracking-widest uppercase">ADMIN</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="py-8 px-10">
                        <Select
                          value={approvalUnits[item.id] || 'ALL'}
                          onValueChange={(value) =>
                            setApprovalUnits((current) => ({
                              ...current,
                              [item.id]: value,
                            }))
                          }
                        >
                          <SelectTrigger className="w-[200px] h-12 rounded-xl border-border/50 font-bold bg-white focus:ring-primary shadow-sm uppercase text-[10px] tracking-widest">
                            <SelectValue placeholder="Unidade" />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl border-border/40 bg-white/95 backdrop-blur-xl">
                            <SelectItem value="ALL" className="font-bold rounded-lg text-[10px] tracking-widest uppercase">TODA A REDE</SelectItem>
                            {units.map(u => (
                              <SelectItem key={u.id} value={u.id} className="font-bold rounded-lg text-[10px] tracking-widest uppercase">{u.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="py-8 px-10">
                        <div className="flex flex-col gap-1">
                          <span className="font-bold text-zinc-400 text-[10px] uppercase tracking-widest">Data do Pedido</span>
                          <span className="font-bold text-muted-foreground text-xs">{formatDate(item.requestedAt)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-8 px-10">
                        <div className="flex justify-end gap-3">
                          <Button 
                            variant="ghost" 
                            onClick={() => void handleReject(item)} 
                            disabled={savingId === item.id}
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive rounded-xl font-bold uppercase text-[10px] tracking-widest h-12 px-6"
                          >
                            Recusar
                          </Button>
                          <Button 
                            onClick={() => void handleApprove(item)} 
                            disabled={savingId === item.id}
                            className="bg-primary hover:bg-primary/90 text-white rounded-xl font-bold uppercase text-[10px] tracking-widest h-12 px-8 shadow-lg shadow-primary/20 border-none"
                          >
                            {savingId === item.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
                            Liberar Acesso
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Mobile View Requests */}
          <div className="md:hidden divide-y divide-zinc-100">
            {pendingRequests.map((item: any) => (
              <div key={item.id} className="p-6 space-y-6 text-zinc-900">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 bg-zinc-900 rounded-2xl flex items-center justify-center text-white font-black text-xl">
                    {(item.nome || item.name || 'U').charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-black text-zinc-900 text-lg leading-tight truncate">{item.nome || item.name}</h4>
                    <p className="text-xs font-bold text-zinc-400 truncate">{item.email}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Perfil de Acesso</label>
                    <Select
                      value={approvalRoles[item.id] || 'viewer'}
                      onValueChange={(value) =>
                        setApprovalRoles((current) => ({ ...current, [item.id]: value as UserRole }))
                      }
                    >
                      <SelectTrigger className="w-full h-12 rounded-xl border-zinc-200 font-bold bg-zinc-50/50 text-zinc-900">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-2xl">
                        <SelectItem value="viewer">VIEWER</SelectItem>
                        <SelectItem value="admin">ADMIN</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Unidade Permitida</label>
                    <Select
                      value={approvalUnits[item.id] || 'ALL'}
                      onValueChange={(value) => setApprovalUnits((current) => ({ ...current, [item.id]: value }))}
                    >
                      <SelectTrigger className="w-full h-12 rounded-xl border-zinc-200 font-bold bg-zinc-50/50 text-zinc-900">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-2xl">
                        <SelectItem value="ALL">Toda a Rede</SelectItem>
                        {units.map(u => (
                          <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <p className="text-[10px] font-bold text-zinc-400 italic">Solicitado em: {formatDate(item.requestedAt)}</p>
                  <div className="flex gap-2">
                    <Button 
                      variant="ghost" 
                      onClick={() => void handleReject(item)}
                      className="text-rose-500 font-black uppercase text-[10px] tracking-widest"
                    >
                      Recusar
                    </Button>
                    <Button 
                      onClick={() => void handleApprove(item)}
                      className="bg-zinc-900 text-white rounded-xl px-6 font-black uppercase text-[10px] tracking-widest shadow-xl shadow-zinc-200 border-none"
                    >
                      Aprovar
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50 shadow-2xl shadow-muted/50 rounded-[40px] overflow-hidden bg-white ring-1 ring-border/5">
        <CardHeader className="p-10 border-b border-border/60 bg-muted/20">
          <div className="flex items-center gap-6">
            <div className="h-14 w-14 bg-primary rounded-[22px] flex items-center justify-center text-white shadow-lg shadow-primary/20 rotate-2">
              <Building2 className="h-8 w-8 -rotate-2" />
            </div>
            <div>
              <CardTitle className="text-xl font-bold text-foreground uppercase tracking-widest leading-none mb-2">Base de Seguidores</CardTitle>
              <CardDescription className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Controle operacional e permissões</CardDescription>
            </div>
            <Badge className="ml-auto bg-primary/10 text-primary border-none rounded-xl px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest">
              {filteredUsers.length} ATIVOS
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0 text-foreground">
          {/* Desktop Table Base */}
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow className="hover:bg-transparent border-b border-border/60">
                  <TableHead className="py-6 px-10 text-[11px] font-bold uppercase tracking-widest text-zinc-500 w-[350px]">Identificador Usuário</TableHead>
                  <TableHead className="py-6 px-10 text-[11px] font-bold uppercase tracking-widest text-zinc-500">Privilégios</TableHead>
                  <TableHead className="py-6 px-10 text-[11px] font-bold uppercase tracking-widest text-zinc-500">Domínio</TableHead>
                  <TableHead className="py-6 px-10 text-[11px] font-bold uppercase tracking-widest text-zinc-500">Status Conta</TableHead>
                  <TableHead className="py-6 px-10 text-[11px] font-bold uppercase tracking-widest text-zinc-500 text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-32 text-center text-zinc-400 font-bold uppercase text-[11px] tracking-widest">
                      Nenhum registro encontrado na base de dados.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((item) => {
                    const isBootstrap = isBootstrapAdmin(item.email);
                    const isCurrent = user?.uid === item.id;
 
                    return (
                      <TableRow key={item.id} className="group hover:bg-muted/10 transition-colors border-b border-border/40 last:border-0 px-10">
                        <TableCell className="py-8 px-10">
                          <div className="flex items-center gap-5">
                            <div className={`h-14 w-14 ${isCurrent ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-muted text-muted-foreground shadow-inner'} rounded-2xl flex items-center justify-center font-bold uppercase text-base group-hover:scale-105 transition-all shrink-0`}>
                              {(item.nome || item.name || 'U').charAt(0)}
                            </div>
                            <div className="space-y-3 min-w-[240px]">
                              <Input
                                value={item.nome || item.name || ''}
                                onChange={(e) => updateUserDraft(item.id, { nome: e.target.value, name: e.target.value })}
                                className="h-9 rounded-xl border-border/40 font-bold text-foreground bg-muted/20 focus:bg-white transition-all text-sm shadow-sm"
                                placeholder="Nome Completo"
                              />
                              <div className="flex items-center gap-3">
                                <div className="relative flex-1">
                                  <Input
                                    value={item.telefone || ''}
                                    onChange={(e) => updateUserDraft(item.id, { telefone: e.target.value })}
                                    className="h-7 rounded-lg border-border/40 font-bold text-zinc-400 bg-muted/10 focus:bg-white transition-all text-[11px] w-full shadow-sm"
                                    placeholder="Contato Direto"
                                  />
                                </div>
                                {isBootstrap && <Badge className="bg-indigo-100 text-indigo-700 border-none px-2 py-0 text-[8px] font-bold uppercase tracking-widest">ROOT</Badge>}
                                {isCurrent && <Badge className="bg-primary/10 text-primary border-none px-2 py-0 text-[8px] font-bold uppercase tracking-widest">DIRETOR</Badge>}
                              </div>
                              <p className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest ml-1 font-mono">{item.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-8 px-10">
                          <Select
                            value={item.role.toLowerCase()}
                            onValueChange={(value) => updateUserDraft(item.id, { role: value as UserRole })}
                            disabled={isBootstrap}
                          >
                            <SelectTrigger className="w-[130px] h-10 rounded-xl border-border/50 font-bold bg-white text-foreground uppercase text-[10px] tracking-widest">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                              <SelectItem value="admin" className="font-bold text-[10px] uppercase tracking-widest">ADMIN</SelectItem>
                              <SelectItem value="gerente" className="font-bold text-[10px] uppercase tracking-widest">GERENTE</SelectItem>
                              <SelectItem value="gestor" className="font-bold text-[10px] uppercase tracking-widest">GESTOR</SelectItem>
                              <SelectItem value="viewer" className="font-bold text-[10px] uppercase tracking-widest">VIEWER</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="py-8 px-10">
                          <Select
                            value={item.unitId || 'ALL'}
                            onValueChange={(value) => updateUserDraft(item.id, { unitId: value })}
                            disabled={isBootstrap}
                          >
                            <SelectTrigger className="w-[180px] h-10 rounded-xl border-border/50 font-bold bg-white text-foreground uppercase text-[10px] tracking-widest">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                              <SelectItem value="ALL" className="font-bold text-[10px] uppercase tracking-widest">TODA A REDE</SelectItem>
                              {units.map(u => (
                                <SelectItem key={u.id} value={u.id} className="font-bold text-[10px] uppercase tracking-widest">{u.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="py-8 px-10">
                          <div className="flex items-center gap-4">
                            <Switch
                              checked={isBootstrap ? true : (item.ativo ?? item.active ?? false)}
                              onCheckedChange={(checked) =>
                                updateUserDraft(item.id, { ativo: Boolean(checked), active: Boolean(checked) })
                              }
                              disabled={isBootstrap}
                              className="data-[state=checked]:bg-primary"
                            />
                            <Badge className={cn(
                               "rounded-xl px-3 py-1 text-[9px] font-bold uppercase border-none",
                               (item.ativo ?? item.active) ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'
                            )}>
                              {(item.ativo ?? item.active) ? 'ATIVO' : 'SUSPENSO'}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="py-8 px-10 text-right">
                          <Button
                            onClick={() => void handleSaveUser(item)}
                            disabled={!item.dirty || savingId === item.id}
                            className={cn(
                              "h-10 px-8 rounded-xl font-bold uppercase text-[10px] tracking-widest transition-all",
                              item.dirty 
                                ? 'bg-primary text-white shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 border-none' 
                                : 'bg-muted text-muted-foreground/30 border-none'
                            )}
                          >
                            {savingId === item.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : item.dirty ? 'Persistir' : 'Garantido'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <div className="md:hidden divide-y divide-zinc-100">
            {filteredUsers.map((item) => {
               const isBootstrap = isBootstrapAdmin(item.email);
               const unit = units.find(u => u.id === item.unitId);
               const isCurrent = user?.uid === item.id;
               
               return (
                 <div key={item.id} className="p-6 space-y-5 text-zinc-900">
                   <div className="flex items-start justify-between">
                     <div className="flex items-center gap-3 flex-1 min-w-0">
                       <div className={`h-12 w-12 ${isCurrent ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-muted text-muted-foreground shadow-inner'} rounded-2xl flex items-center justify-center font-bold text-lg shrink-0`}>
                         {(item.nome || item.name || 'U').charAt(0)}
                       </div>
                       <div className="flex-1 space-y-2">
                         <div className="space-y-1">
                           <Input
                            value={item.nome || item.name || ''}
                            onChange={(e) => updateUserDraft(item.id, { nome: e.target.value, name: e.target.value })}
                            className="h-10 rounded-xl border-zinc-100 font-bold text-zinc-900 bg-zinc-50/50 focus:bg-white transition-all shadow-sm"
                            placeholder="Nome"
                           />
                           <Input
                            value={item.telefone || ''}
                            onChange={(e) => updateUserDraft(item.id, { telefone: e.target.value })}
                            className="h-9 rounded-xl border-zinc-100 font-bold text-zinc-500 text-xs bg-zinc-50/50 focus:bg-white transition-all shadow-sm"
                            placeholder="Telefone"
                           />
                         </div>
                         <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-[10px] font-bold text-zinc-400 truncate max-w-[150px]">{item.email}</p>
                            {isBootstrap && <Badge className="bg-indigo-50 text-indigo-600 border-none px-1 py-0 text-[7px] font-bold uppercase tracking-widest">BOOT</Badge>}
                         </div>
                       </div>
                     </div>
                     <Switch
                        checked={isBootstrap ? true : (item.ativo ?? item.active ?? false)}
                        onCheckedChange={(checked) =>
                          updateUserDraft(item.id, { ativo: Boolean(checked), active: Boolean(checked) })
                        }
                        disabled={isBootstrap}
                        className="ml-4 data-[state=checked]:bg-primary"
                      />
                   </div>

                   <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-1">
                       <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Perfil</label>
                       <Select
                          value={item.role.toLowerCase()}
                          onValueChange={(val) => updateUserDraft(item.id, { role: val as UserRole })}
                          disabled={isBootstrap}
                        >
                          <SelectTrigger className="h-10 rounded-xl bg-zinc-50 border-zinc-100 font-bold text-zinc-900 shadow-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl">
                            <SelectItem value="admin" className="font-bold text-[10px] uppercase tracking-widest">ADMIN</SelectItem>
                            <SelectItem value="viewer" className="font-bold text-[10px] uppercase tracking-widest">VIEWER</SelectItem>
                          </SelectContent>
                        </Select>
                     </div>
                     <div className="space-y-1">
                       <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Escopo</label>
                       <Select
                          value={item.unitId || 'ALL'}
                          onValueChange={(val) => updateUserDraft(item.id, { unitId: val })}
                          disabled={isBootstrap}
                        >
                          <SelectTrigger className="h-10 rounded-xl bg-zinc-50 border-zinc-100 font-bold text-zinc-900 shadow-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl">
                            <SelectItem value="ALL" className="font-bold text-[10px] uppercase tracking-widest">REDE</SelectItem>
                            {units.map(u => (
                              <SelectItem key={u.id} value={u.id} className="font-bold text-[10px] uppercase tracking-widest">{u.name.split(' ')[0]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                     </div>
                   </div>

                   <div className="flex items-center justify-between pt-2 border-t border-zinc-100">
                     <p className="text-[9px] font-bold text-zinc-400 font-mono tracking-tighter">Atu: {formatDate(item.updatedAt)}</p>
                     <Button
                        onClick={() => void handleSaveUser(item)}
                        disabled={!item.dirty || savingId === item.id}
                        size="sm"
                        className={`h-10 rounded-xl px-8 font-bold uppercase text-[10px] tracking-widest transition-all border-none ${
                          item.dirty ? 'bg-primary text-white shadow-lg shadow-primary/20 hover:scale-105' : 'bg-transparent text-zinc-300 border border-zinc-100 shadow-none'
                        }`}
                      >
                        {savingId === item.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : item.dirty ? 'Salvar' : 'Sincronizado'}
                      </Button>
                   </div>
                 </div>
               );
            })}
          </div>
        </CardContent>
        <div className="p-10 bg-muted/20 border-t border-border/40 backdrop-blur-3xl">
          <p className="text-[11px] text-zinc-400 font-bold uppercase tracking-widest text-center">
            Conselho de Segurança: Revise as permissões periodicamente para garantir a integridade dos dados operacionais.
          </p>
        </div>
      </Card>
    </div>
  );
}
