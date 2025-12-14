//app/contexts/UserContext.jsx
import { createContext, useEffect, useState } from 'react'
import { auth } from '../lib/supabase'
import * as SecureStore  from 'expo-secure-store'

export const UserContext = createContext();

export function UserProvider({ children }) {
  const [user, setUser] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)

// ✅ Save session after login
  async function saveSession() {
    const session = auth.getSession()?.data?.session;
    if (session) {
      await SecureStore.setItemAsync('supabase-session', JSON.stringify(session));
    }
  }

  // ✅ Restore session on app load
  async function restoreSession() {
    try {
      const session = await SecureStore.getItemAsync('supabase-session');
      if (session) {
        const parsed = JSON.parse(session);
        await auth.setSession(parsed);
        const { data, error } = await auth.getUser();
        if (!error) setUser(data.user);
      }
    } catch (err) {
      console.log('Session restore failed:', err.message);
    } finally {
      setAuthChecked(true);
    }
  }


// Login Function 
  async function login(email, password) {
    try {
      // Sign in the user
      const { error: loginError } = await auth.signInWithPassword({ email, password });
      if (loginError) throw loginError;

      // Fetch the currently logged-in user
      const { data: userData, error: userError } = await auth.getUser();
      if (userError) throw userError;
      
      setUser(userData.user);
      const {
      data: { session },
    } = await auth.getSession();

    if (session) {
      await SecureStore.setItemAsync('supabase-session', JSON.stringify(session));
    }

  } catch (error) {
    throw new Error(error.message);
  }
}


// Register Function 
  async function register(email, password) {
    try {
      const { error } = await auth.signUp({ email, password });
      if (error) throw error;

      // Auto-login after successful registration
      await login(email, password);
    } catch (error) {
      throw new Error(error.message);
    }
  }

// Logout Function 
  async function logout() {
    await auth.signOut();
    await SecureStore.deleteItemAsync('supabase-session');
    setUser(null)
  }

async function restoreSession() {
  try {
    const session = await SecureStore.getItemAsync("supabase-session");
    if (session) {
      await auth.setSession(JSON.parse(session));
      const { data, error } = await auth.getUser();
      if (data?.user) setUser(data.user);
    }
  } catch {
    setUser(null);
  } finally {
    setAuthChecked(true);
  }
}


  useEffect(() => {
    restoreSession();
  }, [])

  return (
    <UserContext.Provider value={{ user, login, register, logout, authChecked }}>
      {children}
    </UserContext.Provider>
  );
}

