import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';

export default function OAuthCallback() {
  const navigate  = useNavigate();
  const { setAuth } = useStore();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const error = params.get('error');
    if (error) {
      console.error('OAuth error:', error);
      navigate('/login?error=' + encodeURIComponent(error), { replace: true });
      return;
    }

    const token    = params.get('token');
    const userId   = params.get('userId');
    const email    = params.get('email');
    const name     = params.get('name');
    const avatar   = params.get('avatar');
    const firmId   = params.get('firmId');
    const firmName = params.get('firmName');
    const region   = params.get('region');
    const currency = params.get('currency');

    if (!token || !userId) {
      navigate('/login?error=Invalid+OAuth+response', { replace: true });
      return;
    }

    const user = { id: userId, email, name, avatar: avatar || null, role: 'FIRM_ADMIN' };
    const firm = { id: firmId, name: firmName, region, currency };

    setAuth(token, user, firm);
    navigate('/', { replace: true });
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-white text-sm">Signing you in...</p>
      </div>
    </div>
  );
}
