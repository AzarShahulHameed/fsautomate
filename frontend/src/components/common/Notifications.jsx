import React from 'react';
import { useAppStore } from '../../store';
const COLORS = { info: 'bg-blue-600', success: 'bg-green-600', error: 'bg-red-600', warning: 'bg-yellow-600' };
export default function Notifications() {
  const { notifications, removeNotification } = useAppStore();
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
      {notifications.map((n) => (
        <div key={n.id} className={`${COLORS[n.type]||COLORS.info} text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 max-w-sm`}>
          <span className="flex-1 text-sm">{n.msg}</span>
          <button onClick={() => removeNotification(n.id)} className="text-white/80 hover:text-white">✕</button>
        </div>
      ))}
    </div>
  );
}
