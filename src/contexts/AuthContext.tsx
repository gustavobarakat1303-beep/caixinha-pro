import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { AlertTriangle, XCircle } from 'lucide-react';
import { auth } from '../lib/firebase';
import { AuthGate, UserProfile } from '../types';
import { resolveUserAccess } from '../services/userService';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: () => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  isViewer: boolean;
  isManagement: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const BOOTSTRAP_ADMIN = 'gustavobarakat1303@gmail.com';
const normalizeEmail = (email?: string | null) => (email || '').trim().toLowerCase();

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [gate, setGate] = useState<AuthGate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (authUser) => {
      setError(null);
      setUser(authUser);
      setGate(null);

      if (!authUser) {
        setProfile(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const result = await resolveUserAccess(authUser);
        setProfile(result.profile);
        setGate(result.gate);
      } catch (e) {
        console.error('Access resolution error:', e);
        setError('Erro ao validar seu acesso ao sistema.');
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  const signIn = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      if (error.code === 'auth/popup-closed-by-user') return;
      console.error('Login error:', error);
      setError('Falha na autenticacao com Google.');
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setProfile(null);
      setUser(null);
      setError(null);
    } catch (e) {
      console.error('Logout error:', e);
    }
  };

  const isAdmin = profile?.role?.toUpperCase() === 'ADMIN';
  const isViewer = profile?.role?.toUpperCase() === 'VIEWER';
  const isGerente = profile?.role?.toUpperCase() === 'GERENTE';
  const isGestor = profile?.role?.toUpperCase() === 'GESTOR';
  const isManagement = isAdmin || isGerente || isGestor;
  const isInactive = user && profile && profile.ativo === false;

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="h-10 w-10 border-4 border-zinc-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white border border-zinc-200 shadow-2xl rounded-[32px] overflow-hidden p-12 text-center space-y-6">
          <div className="h-20 w-20 bg-amber-50 rounded-3xl flex items-center justify-center mx-auto border border-amber-100">
            <svg className="h-10 w-10 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-black text-zinc-900 leading-tight">Erro de Sistema</h2>
            <p className="text-zinc-500 text-sm font-medium leading-relaxed">{error}</p>
          </div>
          <button onClick={logout} className="w-full h-14 bg-zinc-900 hover:bg-zinc-800 text-white font-black rounded-2xl transition-all">
            Voltar para Login
          </button>
        </div>
      </div>
    );
  }

  if (gate) {
    const ToneIcon = gate.tone === 'danger' ? 'text-red-500' : 'text-amber-500';
    const ToneBg = gate.tone === 'danger' ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100';

    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white border border-zinc-200 shadow-2xl rounded-[32px] overflow-hidden p-12 text-center space-y-6">
          <div className={`h-20 w-20 ${ToneBg} rounded-3xl flex items-center justify-center mx-auto border`}>
            {gate.tone === 'danger' ? (
              <XCircle className={`h-10 w-10 ${ToneIcon}`} />
            ) : (
              <AlertTriangle className={`h-10 w-10 ${ToneIcon}`} />
            )}
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-black text-zinc-900 leading-tight">{gate.title}</h2>
            <p className="text-zinc-500 text-sm font-medium leading-relaxed">
              {gate.message}
            </p>
          </div>
          <button onClick={logout} className="w-full h-14 bg-zinc-900 hover:bg-zinc-800 text-white font-black rounded-2xl transition-all active:scale-95 shadow-lg shadow-zinc-200">
            Sair ou Trocar Conta
          </button>
        </div>
      </div>
    );
  }

  if (isInactive) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white border border-zinc-200 shadow-2xl rounded-[32px] overflow-hidden p-12 text-center space-y-6">
          <div className="h-20 w-20 bg-red-50 rounded-3xl flex items-center justify-center mx-auto border border-red-100">
            <svg className="h-10 w-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m0 0v2m0-2h2m-2 0H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-black text-zinc-900 leading-tight">Conta Inativa</h2>
            <p className="text-zinc-500 text-sm font-medium leading-relaxed">
              Sua conta esta aguardando liberacao do administrador.
            </p>
          </div>
          <button onClick={logout} className="w-full h-14 bg-zinc-900 hover:bg-zinc-800 text-white font-black rounded-2xl transition-all active:scale-95 shadow-lg shadow-zinc-200">
            Trocar de Conta
          </button>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, logout, isAdmin, isViewer, isManagement }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
