import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { authAPI } from '../api/client';

export const useStore = create(
  persist(
    (set, get) => ({
      token: null,
      user:  null,
      firm:  null,

      setAuth: (token, user, firm) => set({ token, user, firm }),

      clearAuth: async () => {
        try { await authAPI.logout(); } catch (_) {}
        set({ token: null, user: null, firm: null, currentEngagement: null, currentClient: null });
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
        token: s.token, user: s.user, firm: s.firm,
        currentClient: s.currentClient, currentEngagement: s.currentEngagement,
      }),
    }
  )
);
