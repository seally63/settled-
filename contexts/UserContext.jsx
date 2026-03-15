//app/contexts/UserContext.jsx
import { createContext, useEffect, useState } from 'react'
import { auth } from '../lib/supabase'

export const UserContext = createContext();

export function UserProvider({ children }) {
  const [user, setUser] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)

  useEffect(() => {
    // Listen for all auth state changes (login, logout, token refresh, initial load)
    // The SDK handles session persistence and token refresh via AsyncStorage automatically
    const { data: { subscription } } = auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);

      if (event === 'INITIAL_SESSION') {
        setAuthChecked(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function login(email, password) {
    const { error } = await auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  }

  async function register(email, password, metadata = {}) {
    try {
      const { error } = await auth.signUp({
        email,
        password,
        options: {
          data: {
            ...metadata
          }
        }
      });
      if (error) throw error;

      // Auto-login after successful registration
      await login(email, password);
    } catch (error) {
      throw new Error(error.message);
    }
  }

  async function logout() {
    await auth.signOut();
  }

  return (
    <UserContext.Provider value={{ user, login, register, logout, authChecked }}>
      {children}
    </UserContext.Provider>
  );
}
