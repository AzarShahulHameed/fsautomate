import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { authAPI } from '../api/client';

export const useStore = create(
  persist(
    (set, get) => ({
      // We can no longer read the auth token from JS (it's an httpOnly
      // cookie now, by design — that's what stops an XSS bug from being
      // able to steal it). Auth state is instead tracked as a boolean,
      // established by calling /auth/me once on app load (see checkAuth).
      user:            null,
      firm:            null,
      isAuthenticated: false,
      authChecked:     false,

      // Global request state — prevents stale data in sidebar/header during page loads
      isLoading: false,
      error:     null,
      setLoading: (v) => set({ isLoading: v }),
      setError:   (e) => set({ error: e }),

      setAuth: (user, firm) => set({ user, firm, isAuthenticated: true, authChecked: true }),

      // Called once on app boot (and after OAuth redirect) — the browser
      // sends the httpOnly cookie automatically, so if a valid session
      // exists /auth/me succeeds without us handling any token directly.
      checkAuth: async () => {
        try {
          const res = await authAPI.me();
          const { firm, ...user } = res;
          set({ user, firm, isAuthenticated: true, authChecked: true });
        } catch (_) {
          set({ user: null, firm: null, isAuthenticated: false, authChecked: true });
        }
      },

      clearAuth: async () => {
        try { await authAPI.logout(); } catch (_) {}
        set({ user: null, firm: null, isAuthenticated: false, currentEngagement: null, currentClient: null });
      },

      currentClient:     null,
      currentEngagement: null,

      setCurrentClient:     (client)     => set({ currentClient: client }),
      setCurrentEngagement: (engagement) => set({ currentEngagement: engagement }),

      pageRoute: '/',
      setPageRoute: (route) => set({ pageRoute: route }),

      restorePageState: async () => {
        try { return (await authAPI.getPageState())?.pageState || null; }
        catch { return null; }
      },

      updateUser: (userData) => set(s => ({ user: { ...s.user, ...userData } })),
      updateFirm: (firmData) => set(s => ({ firm: { ...s.firm, ...firmData } })),

      // Computed helpers — use these everywhere for consistency
      getClientRegion: () => {
        const s = get();
        const client = s.currentClient;
        if (!client) return s.firm?.region || 'India';
        if (client.region === 'UAE' || client.country === 'UAE') return 'UAE';
        return 'India';
      },
      getCurrency: () => {
        const s = get();
        // Priority: firm currency → client region → engagement method → default
        if (s.firm?.currency) return s.firm.currency;
        const client = s.currentClient;
        if (client?.region === 'UAE' || client?.country === 'UAE') return 'AED';
        const method = s.currentEngagement?.method;
        if (method === 'IFRS' || method === 'IFRS_SME') return 'AED';
        return 'INR';
      },
      getCurrencySymbol: () => {
        const s = get();
        const currency = s.getCurrency?.() || 'INR';
        return currency === 'AED' ? 'AED' : '₹';
      },
      getAvailableMethods: () => {
        const s = get();
        const region = s.getClientRegion?.() || 'India';
        return region === 'UAE' ? ['IFRS', 'IFRS_SME'] : ['AS', 'IND_AS'];
      },

      

      sidebarOpen: true,
      setSidebarOpen: (v) => set({ sidebarOpen: v }),
    }),
    {
      name: 'finstatement-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        user: s.user, firm: s.firm,
        currentClient: s.currentClient, currentEngagement: s.currentEngagement,
      }),
    }
  )
);
