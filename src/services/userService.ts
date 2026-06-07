import { User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { AuthGate, UserProfile, UserRole } from '../types';

const BOOTSTRAP_ADMIN_EMAIL = 'gustavobarakat1303@gmail.com';

export function normalizeEmail(email?: string | null) {
  return (email || '').trim().toLowerCase();
}

export function normalizePhone(phone?: string | null) {
  if (!phone) return '';

  const trimmed = phone.trim();
  if (!trimmed) return '';

  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';

  let normalizedDigits = digits;

  if (trimmed.startsWith('00')) {
    normalizedDigits = digits.slice(2);
  } else if (!trimmed.startsWith('+')) {
    if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
      normalizedDigits = digits;
    } else if (digits.length === 10 || digits.length === 11) {
      normalizedDigits = `55${digits}`;
    } else if (digits.length < 12) {
      return '';
    }
  }

  return `+${normalizedDigits}`;
}

export function formatPhone(phone?: string | null) {
  const normalized = normalizePhone(phone);
  if (!normalized) return '-';

  const digits = normalized.replace(/\D/g, '');

  if (digits.startsWith('55') && digits.length === 13) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }

  if (digits.startsWith('55') && digits.length === 12) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }

  return normalized;
}

export function isBootstrapAdmin(email?: string | null) {
  return normalizeEmail(email) === BOOTSTRAP_ADMIN_EMAIL;
}

export function getFallbackName(user: User) {
  return user.displayName?.trim() || normalizePhone(user.phoneNumber) || user.email?.split('@')[0] || 'Usuario';
}

function normalizeRole(role: unknown, email?: string | null): UserRole {
  const r = String(role || '').toUpperCase();
  if (['ADMIN', 'VIEWER', 'GERENTE', 'GESTOR'].includes(r)) {
    return r as UserRole;
  }

  return isBootstrapAdmin(email) ? 'ADMIN' : 'VIEWER';
}

function buildProfile(user: User, data: Partial<UserProfile>, overrides?: Partial<UserProfile>): UserProfile {
  const now = new Date().toISOString();
  const normalizedPhone = normalizePhone(data.telefone || user.phoneNumber || '');

  return {
    id: data.uid || normalizedPhone || user.uid, // compatibility
    uid: data.uid || normalizedPhone || user.uid,
    nome: data.nome || data.name || getFallbackName(user),
    name: data.nome || data.name || getFallbackName(user), // compatibility
    telefone: normalizedPhone,
    email: normalizeEmail(data.email || user.email || ''),
    unitId: data.unitId || '',
    role: normalizeRole(data.role || data.role, user.email),
    ativo: data.ativo !== false && data.active !== false,
    active: data.ativo !== false && data.active !== false, // compatibility
    createdAt: data.createdAt || now,
    updatedAt: data.updatedAt || now,
    authUid: data.authUid || user.uid,
    ...overrides
  } as UserProfile;
}

async function ensureBootstrapAdminProfile(user: User): Promise<UserProfile> {
  const now = new Date().toISOString();
  const userRef = doc(db, 'users', user.uid);
  const userSnap = await getDoc(userRef);
  const existing = userSnap.exists() ? (userSnap.data() as Partial<UserProfile>) : {};

  const adminProfile = buildProfile(user, existing, {
    uid: existing.uid || user.uid,
    id: existing.uid || user.uid,
    nome: existing.nome || existing.name || user.displayName || 'Administrador',
    name: existing.nome || existing.name || user.displayName || 'Administrador',
    telefone: normalizePhone(existing.telefone || user.phoneNumber || ''),
    email: normalizeEmail(user.email),
    unitId: existing.unitId || 'ALL',
    role: 'ADMIN',
    ativo: true,
    active: true,
    authUid: user.uid,
    createdAt: existing.createdAt || now,
    updatedAt: now
  });

  await setDoc(userRef, adminProfile, { merge: true });
  return adminProfile;
}

async function ensurePendingPhoneProfile(user: User, phone: string): Promise<UserProfile> {
  const now = new Date().toISOString();
  const userRef = doc(db, 'users', phone);
  const pendingProfile = buildProfile(user, {}, {
    uid: phone,
    id: phone,
    telefone: phone,
    email: normalizeEmail(user.email),
    unitId: '',
    role: 'VIEWER',
    ativo: false,
    active: false,
    authUid: user.uid,
    createdAt: now,
    updatedAt: now
  });

  await setDoc(userRef, pendingProfile, { merge: true });

  // Also create access request
  const requestRef = doc(db, 'access_requests', phone);
  await setDoc(requestRef, {
    id: phone,
    uid: phone,
    email: normalizeEmail(user.email),
    nome: pendingProfile.nome,
    name: pendingProfile.nome,
    status: 'PENDENTE',
    requestedAt: now,
    updatedAt: now
  }, { merge: true });

  return pendingProfile;
}

async function ensurePendingEmailProfile(user: User, email: string): Promise<UserProfile> {
  const now = new Date().toISOString();
  const userRef = doc(db, 'users', user.uid);
  const pendingProfile = buildProfile(user, {}, {
    uid: user.uid,
    id: user.uid,
    telefone: normalizePhone(user.phoneNumber),
    email,
    unitId: '',
    role: 'VIEWER',
    ativo: false,
    active: false,
    authUid: user.uid,
    createdAt: now,
    updatedAt: now
  });

  await setDoc(userRef, pendingProfile, { merge: true });

  // Also create access request
  const requestRef = doc(db, 'access_requests', user.uid);
  await setDoc(requestRef, {
    id: user.uid,
    uid: user.uid,
    email: email,
    nome: pendingProfile.nome,
    name: pendingProfile.nome,
    status: 'PENDENTE',
    requestedAt: now,
    updatedAt: now
  }, { merge: true });

  return pendingProfile;
}

export async function resolveUserAccess(user: User): Promise<{ profile: UserProfile | null; gate: AuthGate | null }> {
  const phone = normalizePhone(user.phoneNumber);
  const email = normalizeEmail(user.email);

  if (phone) {
    const phoneRef = doc(db, 'users', phone);
    const phoneSnap = await getDoc(phoneRef);

    if (!phoneSnap.exists()) {
      const pendingProfile = await ensurePendingPhoneProfile(user, phone);
      return {
        profile: pendingProfile,
        gate: {
          title: 'Cadastro Recebido',
          message: 'Seu cadastro foi enviado e agora esta aguardando liberacao do administrador.',
          tone: 'warning'
        }
      };
    }

    const existing = phoneSnap.data() as Partial<UserProfile>;
    const now = new Date().toISOString();
    const profile = buildProfile(user, existing, {
      uid: phone,
      id: phone,
      telefone: phone,
      authUid: user.uid,
      updatedAt: existing.updatedAt || now
    });

    if (existing.authUid !== user.uid || existing.telefone !== phone) {
      await setDoc(
        phoneRef,
        {
          telefone: phone,
          authUid: user.uid,
          updatedAt: now
        },
        { merge: true }
      );
    }

    return { profile, gate: null };
  }

  if (!email) {
    return {
      profile: null,
      gate: {
        title: 'Login Invalido',
        message: 'Use o login por numero do celular para entrar no sistema.',
        tone: 'danger'
      }
    };
  }

  if (isBootstrapAdmin(email)) {
    const profile = await ensureBootstrapAdminProfile(user);
    return { profile, gate: null };
  }

  const userRef = doc(db, 'users', user.uid);
  const userSnap = await getDoc(userRef);

  if (userSnap.exists()) {
    const existing = userSnap.data() as Partial<UserProfile>;
    return {
      profile: buildProfile(user, existing),
      gate: null
    };
  }

  const pendingProfile = await ensurePendingEmailProfile(user, email);
  return {
    profile: pendingProfile,
    gate: {
      title: 'Cadastro Recebido',
      message: 'Seu cadastro foi enviado e agora esta aguardando liberacao do administrador.',
      tone: 'warning'
    }
  };
}
