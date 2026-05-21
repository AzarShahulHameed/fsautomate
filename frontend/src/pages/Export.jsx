import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { exportAPI } from '../api/client';
import toast from 'react-hot-toast';

export default function Export() {
  const { engagementId } = useParams();
  const [loading, setLoading] = useState('');

  const download = async (type) => {
    setLoading(type);
    try {
      const blob = type === 'word' ? await exportAPI.word(engagementId) : await exportAPI.excel(engagementId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `financial-statements.${type === 'word' ? 'docx' : 'xlsx'}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Downloaded successfully');
    } catch { toast.error('Export failed'); }
    finally { setLoading(''); }
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-slate-800 mb-2">Export</h1>
      <p className="text-slate-500 text-sm mb-8">Download the complete financial report in your preferred format.</p>
      <div className="grid grid-cols-2 gap-5 max-w-xl">
        {[
          { type: 'word',  label: 'Word Document',  desc: 'Full report with all sections and notes', ext: 'DOCX' },
          { type: 'excel', label: 'Excel Workbook', desc: 'BS, PL and Notes in separate sheets',     ext: 'XLSX' },
        ].map(({ type, label, desc, ext }) => (
          <button
            key={type}
            onClick={() => download(type)}
            disabled={loading === type}
            className="bg-white border-2 border-slate-200 rounded-xl p-6 text-left hover:border-indigo-400 hover:shadow-md transition-all disabled:opacity-50"
          >
            <div className="text-3xl font-black text-slate-200 mb-3">{ext}</div>
            <div className="font-semibold text-slate-800">{label}</div>
            <div className="text-slate-500 text-sm mt-1">{desc}</div>
            <div className="mt-4 text-indigo-600 text-sm font-medium">
              {loading === type ? 'Generating...' : 'Download →'}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
