import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';

export default function OAuthCallback() {
  const navigate  = useNavigate();
  const { checkAuth } = useStore();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const error = params.get('error');
    if (error) {
      console.error('OAuth error:', error);
      navigate('/login?error=' + encodeURIComponent(error), { replace: true });
      return;
    }

    // The backend already set an httpOnly auth cookie during the OAuth
    // redirect — there's no token in this URL to read anymore (a token in
    // a URL ends up in browser history and server access logs, which is
    // its own leak). We just ask the API who we are now that the cookie
    // is set, then continue in.
    checkAuth().then(() => navigate('/', { replace: true }));
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
