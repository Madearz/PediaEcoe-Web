import { useEffect, useState } from 'react';
import { onIdTokenChanged, signOut, type User } from 'firebase/auth';
import { doc, getDocFromServer, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';

export type Access = { status: 'setup'|'loading'|'signed-out'|'denied'|'error'; user?: User }
  | { status: 'ready'; user: User; admin: boolean };

const keyFor = (user: User) => user.email?.trim().toLowerCase() ?? '';

export function useAccess() {
  const [state, setState] = useState<Access>({ status: auth ? 'loading' : 'setup' });
  useEffect(() => {
    if (!auth || !db) return;
    const database = db;
    let stopInvite: (() => void) | undefined;
    let generation = 0;
    let principal: string | undefined;
    const stopAuth = onIdTokenChanged(auth, (user) => {
      const uid = user?.uid;
      if (uid && uid === principal) return;
      principal = uid;
      ++generation;
      stopInvite?.();
      if (!user) { setState({ status: 'signed-out' }); return; }
      const email = keyFor(user);
      if (!email || !user.emailVerified || email.includes('/')) { setState({ status: 'denied', user }); return; }
      setState({ status: 'loading' });
      stopInvite = onSnapshot(doc(database, 'authorized_emails', email), { includeMetadataChanges: true }, async (invite) => {
        const current = ++generation;
        if (invite.metadata.fromCache) { setState({ status: 'loading' }); return; }
        if (invite.data()?.active !== true) { setState({ status: 'denied', user }); return; }
        try {
          const profile = doc(database, 'users', user.uid);
          const role = await getDocFromServer(doc(database, 'admins', user.uid));
          await runTransaction(database, async (transaction) => {
            const record = await transaction.get(profile);
            const fields = { email, name: (user.displayName ?? '').slice(0, 120),
              photo: user.photoURL?.startsWith('https://') && user.photoURL.length <= 2048 ? user.photoURL : '' };
            if (!record.exists()) transaction.set(profile, { ...fields, createdAt: serverTimestamp() });
            else if (record.data().email !== fields.email || record.data().name !== fields.name || record.data().photo !== fields.photo) {
              transaction.update(profile, fields);
            }
          });
          if (current === generation) setState({ status: 'ready', user, admin: role.exists() });
        } catch {
          if (current === generation) setState({ status: 'error', user });
        }
      }, () => { ++generation; setState({ status: 'error', user }); });
    });
    return () => { ++generation; stopInvite?.(); stopAuth(); };
  }, []);
  return state;
}

export function logout() { if (auth) return signOut(auth); }
