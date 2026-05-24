import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { schedulesAPI } from '../api/schedulesAPI';
import { useStore } from '../store';
import toast from 'react-hot-toast';

const N  = v => Number(v || 0);
const fmt = v => {
  const n = N(v), abs = Math.abs(n);
  const s = abs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `(${s})` : s;
};

// ── Shared input ──────────────────────────────────────────────────────────────
function Amt({ value, onChange, className = '' }) {
  return (
    <input type="number" step="0.01" value={value || ''} onChange={e => onChange(Number(e.target.value))}
      className={`w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400 ${className}`}
      placeholder="0.00" />
  );
}

// ── Disclaimer banner ─────────────────────────────────────────────────────────
function Disclaimer({ method, title, dataNeeded, note }) {
  return (
    <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <span className="text-amber-500 text-xl flex-shrink-0">ℹ️</span>
        <div>
          <p className="font-semibold text-amber-900 text-sm">{title} — Data Required</p>
          <p className="text-amber-800 text-xs mt-1"><strong>Method:</strong> {method}</p>
          <p className="text-amber-800 text-xs mt-0.5"><strong>What to enter:</strong> {dataNeeded}</p>
          {note && <p className="text-amber-700 text-xs mt-0.5 italic">{note}</p>}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PPE SCHEDULE — auto-initialises from TB mapping, user fills opening balances
// ═══════════════════════════════════════════════════════════════════════════════
function PPESchedule({ engagementId, method, currency }) {
  const [rows, setRows]   = useState([]);
  const [saving, setSaving] = useState({});
  const [loading, setLoading] = useState(true);

  const isIFRS = ['IFRS','IFRS_SME','IND_AS'].includes(method);
  const std    = method === 'AS' ? 'Schedule II — Companies Act 2013' : method === 'IND_AS' ? 'Ind AS 16' : 'IAS 16';

  useEffect(() => { load(); }, [engagementId]);
  async function load() {
    setLoading(true);
    try { setRows(await schedulesAPI.getPPE(engagementId)); }
    catch (e) { toast.error('Failed to load PPE: ' + e.message); }
    finally { setLoading(false); }
  }

  async function save(row) {
    setSaving(s => ({ ...s, [row.id]: true }));
    try { await schedulesAPI.savePPE(engagementId, row.id, row); toast.success('Saved'); }
    catch { toast.error('Save failed'); }
    finally { setSaving(s => ({ ...s, [row.id]: false })); }
  }

  async function addRow() {
    try { const r = await schedulesAPI.addPPE(engagementId, { assetClass: 'New Asset Class', isDepreciable: true }); setRows(p => [...p, r]); }
    catch { toast.error('Failed to add'); }
  }

  async function del(id) {
    if (!window.confirm('Delete?')) return;
    try { await schedulesAPI.deletePPE(engagementId, id); setRows(p => p.filter(r => r.id !== id)); }
    catch { toast.error('Failed'); }
  }

  const upd = (id, f, v) => setRows(p => p.map(r => r.id === id ? { ...r, [f]: v } : r));

  const calc = rows.map(r => ({
    ...r,
    closingGross: N(r.openingGross) + N(r.additions) - N(r.disposals) + N(r.revaluationAmt),
    closingDepr:  r.isDepreciable ? N(r.openingDepr) + N(r.deprForYear) - N(r.deprOnDisposal) : 0,
    netCY: (N(r.openingGross)+N(r.additions)-N(r.disposals)+N(r.revaluationAmt)) - (r.isDepreciable?N(r.openingDepr)+N(r.deprForYear)-N(r.deprOnDisposal):0) - N(r.impairmentAmt),
    netPY: N(r.openingGross) - N(r.openingDepr),
  }));

  const tot = calc.reduce((t,r) => ({
    og:t.og+N(r.openingGross), add:t.add+N(r.additions), dis:t.dis+N(r.disposals),
    rev:t.rev+N(r.revaluationAmt), cg:t.cg+r.closingGross,
    od:t.od+N(r.openingDepr), df:t.df+N(r.deprForYear), dd:t.dd+N(r.deprOnDisposal),
    cd:t.cd+r.closingDepr, imp:t.imp+N(r.impairmentAmt), cy:t.cy+r.netCY, py:t.py+r.netPY,
  }), {og:0,add:0,dis:0,rev:0,cg:0,od:0,df:0,dd:0,cd:0,imp:0,cy:0,py:0});

  const th = 'px-2 py-2 text-xs font-semibold text-white bg-slate-800 border border-slate-700 text-center whitespace-nowrap';
  const td = 'px-1 py-1 border border-slate-200 text-xs';

  if (loading) return <div className="p-4 text-slate-400">Loading PPE schedule...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Property, Plant and Equipment</h2>
          <p className="text-sm text-slate-500">{std} — Cost Model</p>
        </div>
        <button onClick={addRow} className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700">+ Add Asset Class</button>
      </div>

      <Disclaimer
        method={method}
        title="PPE Schedule"
        dataNeeded="Opening Gross Block and Opening Accumulated Depreciation from prior year audited accounts. Additions and depreciation for the current year from your TB/fixed asset register."
        note={`Closing balances are auto-computed. Currency: ${currency}. ${isIFRS ? 'Revaluation and Impairment columns shown for ' + std + '.' : ''}`}
      />

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm min-w-max">
          <thead>
            <tr>
              <th className={`${th} text-left w-40`} rowSpan={2}>Asset Class</th>
              <th className={th} colSpan={isIFRS ? 5 : 4}>Gross Block ({currency})</th>
              <th className={th} colSpan={4}>Depreciation ({currency})</th>
              {isIFRS && <th className={th} rowSpan={2}>Impairment</th>}
              <th className={`${th} bg-indigo-800`} colSpan={2}>Net Block ({currency})</th>
              <th className={`${th} w-8`} rowSpan={2}></th>
            </tr>
            <tr>
              {['Opening','Additions','Disposals',...(isIFRS?['Revaluation']:[]),'Closing','Opening','For Year','On Disposal','Closing','CY','PY'].map(h=>(
                <th key={h} className={`${th} ${h==='CY'?'bg-indigo-700':''}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {calc.map(r => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-1 py-1 border border-slate-200">
                  <div>
                    <input value={r.assetClass} onChange={e=>upd(r.id,'assetClass',e.target.value)} className="w-full text-xs border-0 outline-none bg-transparent font-medium"/>
                    <label className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                      <input type="checkbox" checked={r.isDepreciable} onChange={e=>upd(r.id,'isDepreciable',e.target.checked)} className="w-3 h-3"/>
                      Depreciable
                    </label>
                  </div>
                </td>
                {[['openingGross',r.openingGross],['additions',r.additions],['disposals',r.disposals],...(isIFRS?[['revaluationAmt',r.revaluationAmt]]:[])].map(([f,v])=>(
                  <td key={f} className={td}><Amt value={v} onChange={val=>upd(r.id,f,val)}/></td>
                ))}
                <td className={`${td} font-mono text-right font-medium bg-slate-50`}>{fmt(r.closingGross)}</td>
                {[['openingDepr',r.openingDepr],['deprForYear',r.deprForYear],['deprOnDisposal',r.deprOnDisposal]].map(([f,v])=>(
                  <td key={f} className={td}>{r.isDepreciable?<Amt value={v} onChange={val=>upd(r.id,f,val)}/>:<span className="text-slate-300 text-xs px-2">—</span>}</td>
                ))}
                <td className={`${td} font-mono text-right font-medium bg-slate-50`}>{r.isDepreciable?fmt(r.closingDepr):'—'}</td>
                {isIFRS&&<td className={td}><Amt value={r.impairmentAmt} onChange={val=>upd(r.id,'impairmentAmt',val)}/></td>}
                <td className={`${td} font-mono text-right font-bold text-indigo-700 bg-indigo-50`}>{fmt(r.netCY)}</td>
                <td className={`${td} font-mono text-right text-slate-500`}>{fmt(r.netPY)}</td>
                <td className="border border-slate-200 px-1 py-1">
                  <div className="flex gap-0.5">
                    <button onClick={()=>save(r)} disabled={saving[r.id]} className="px-1.5 py-0.5 bg-indigo-600 text-white text-xs rounded">{saving[r.id]?'...':'💾'}</button>
                    <button onClick={()=>del(r.id)} className="px-1.5 py-0.5 bg-red-100 text-red-600 text-xs rounded">✕</button>
                  </div>
                </td>
              </tr>
            ))}
            <tr className="bg-slate-800 text-white font-bold">
              <td className="px-2 py-2 text-xs border border-slate-700">TOTAL</td>
              {[tot.og,tot.add,tot.dis,...(isIFRS?[tot.rev]:[]),tot.cg,tot.od,tot.df,tot.dd,tot.cd,...(isIFRS?[tot.imp]:[]),tot.cy,tot.py].map((v,i)=>(
                <td key={i} className="px-2 py-2 text-xs font-mono text-right border border-slate-700">{fmt(v)}</td>
              ))}
              <td className="border border-slate-700"></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTANGIBLE ASSETS — same columnar format
// ═══════════════════════════════════════════════════════════════════════════════
function IntangibleSchedule({ engagementId, method, currency }) {
  const [rows, setRows]     = useState([]);
  const [saving, setSaving] = useState({});
  const [loading, setLoading] = useState(true);
  const isIFRS = ['IFRS','IFRS_SME','IND_AS'].includes(method);

  useEffect(() => { load(); }, [engagementId]);
  async function load() {
    setLoading(true);
    try { setRows(await schedulesAPI.getIntangibles(engagementId)); }
    catch { toast.error('Failed to load intangibles'); }
    finally { setLoading(false); }
  }

  const upd = (id,f,v) => setRows(p=>p.map(r=>r.id===id?{...r,[f]:v}:r));
  async function save(row) {
    setSaving(s=>({...s,[row.id]:true}));
    try { await schedulesAPI.saveIntangible(engagementId,row.id,row); toast.success('Saved'); }
    catch { toast.error('Failed'); }
    finally { setSaving(s=>({...s,[row.id]:false})); }
  }
  async function addRow() {
    try { const r=await schedulesAPI.addIntangible(engagementId,{assetClass:'New Intangible',usefulLife:'5 years'}); setRows(p=>[...p,r]); }
    catch { toast.error('Failed'); }
  }
  async function del(id) {
    try { await schedulesAPI.deleteIntangible(engagementId,id); setRows(p=>p.filter(r=>r.id!==id)); }
    catch { toast.error('Failed'); }
  }

  const calc = rows.map(r=>({...r,
    cg:N(r.openingGross)+N(r.additions)-N(r.disposals),
    ca:N(r.openingAmort)+N(r.amortForYear)-N(r.amortOnDisposal),
    netCY:(N(r.openingGross)+N(r.additions)-N(r.disposals))-(N(r.openingAmort)+N(r.amortForYear)-N(r.amortOnDisposal))-N(r.impairmentAmt),
    netPY:N(r.openingGross)-N(r.openingAmort),
  }));
  const tot=calc.reduce((t,r)=>({og:t.og+N(r.openingGross),add:t.add+N(r.additions),dis:t.dis+N(r.disposals),cg:t.cg+r.cg,oa:t.oa+N(r.openingAmort),af:t.af+N(r.amortForYear),ad:t.ad+N(r.amortOnDisposal),ca:t.ca+r.ca,imp:t.imp+N(r.impairmentAmt),cy:t.cy+r.netCY,py:t.py+r.netPY}),{og:0,add:0,dis:0,cg:0,oa:0,af:0,ad:0,ca:0,imp:0,cy:0,py:0});
  const th='px-2 py-2 text-xs font-semibold text-white bg-slate-800 border border-slate-700 text-center whitespace-nowrap';
  const td='px-1 py-1 border border-slate-200 text-xs';

  if (loading) return <div className="p-4 text-slate-400">Loading...</div>;
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Intangible Assets</h2>
          <p className="text-sm text-slate-500">{method==='AS'?'Schedule II':'IAS 38 / Ind AS 38'} — Cost Model</p>
        </div>
        <button onClick={addRow} className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg">+ Add Class</button>
      </div>
      <Disclaimer method={method} title="Intangible Assets"
        dataNeeded="Opening Gross Block and Opening Accumulated Amortisation from prior year. Current year additions and amortisation from TB/fixed asset register."
        note="Goodwill — no amortisation under IFRS/Ind AS (annual impairment test required). Mark 'Indefinite life' for such items." />
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm min-w-max">
          <thead>
            <tr>
              <th className={`${th} text-left w-40`} rowSpan={2}>Intangible Class</th>
              <th className={th} colSpan={4}>Gross Block ({currency})</th>
              <th className={th} colSpan={4}>Amortisation ({currency})</th>
              {isIFRS&&<th className={th} rowSpan={2}>Impairment</th>}
              <th className={`${th} bg-indigo-800`} colSpan={2}>Net Block ({currency})</th>
              <th className={`${th} w-24`} rowSpan={2}>Useful Life</th>
              <th className={`${th} w-8`} rowSpan={2}></th>
            </tr>
            <tr>{['Opening','Additions','Disposals','Closing','Opening','For Year','On Disposal','Closing','CY','PY'].map(h=><th key={h} className={`${th} ${h==='CY'?'bg-indigo-700':''}`}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {calc.map(r=>(
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-1 py-1 border border-slate-200">
                  <input value={r.assetClass} onChange={e=>upd(r.id,'assetClass',e.target.value)} className="w-full text-xs border-0 outline-none bg-transparent font-medium"/>
                  {isIFRS&&<label className="flex items-center gap-1 text-xs text-slate-400 mt-0.5"><input type="checkbox" checked={r.isIndefinite} onChange={e=>upd(r.id,'isIndefinite',e.target.checked)} className="w-3 h-3"/>Indefinite life</label>}
                </td>
                {[['openingGross',r.openingGross],['additions',r.additions],['disposals',r.disposals]].map(([f,v])=>(
                  <td key={f} className={td}><Amt value={v} onChange={val=>upd(r.id,f,val)}/></td>
                ))}
                <td className={`${td} font-mono text-right font-medium bg-slate-50`}>{fmt(r.cg)}</td>
                {[['openingAmort',r.openingAmort],['amortForYear',r.amortForYear],['amortOnDisposal',r.amortOnDisposal]].map(([f,v])=>(
                  <td key={f} className={td}>{r.isIndefinite?<span className="text-slate-300 px-2 text-xs">N/A</span>:<Amt value={v} onChange={val=>upd(r.id,f,val)}/>}</td>
                ))}
                <td className={`${td} font-mono text-right font-medium bg-slate-50`}>{r.isIndefinite?'—':fmt(r.ca)}</td>
                {isIFRS&&<td className={td}><Amt value={r.impairmentAmt} onChange={val=>upd(r.id,'impairmentAmt',val)}/></td>}
                <td className={`${td} font-mono text-right font-bold text-indigo-700 bg-indigo-50`}>{fmt(r.netCY)}</td>
                <td className={`${td} font-mono text-right text-slate-500`}>{fmt(r.netPY)}</td>
                <td className={td}><input value={r.usefulLife||''} onChange={e=>upd(r.id,'usefulLife',e.target.value)} className="w-full text-xs border-0 outline-none bg-transparent" placeholder="e.g. 5 years"/></td>
                <td className="border border-slate-200 px-1 py-1">
                  <div className="flex gap-0.5">
                    <button onClick={()=>save(r)} disabled={saving[r.id]} className="px-1.5 py-0.5 bg-indigo-600 text-white text-xs rounded">{saving[r.id]?'...':'💾'}</button>
                    <button onClick={()=>del(r.id)} className="px-1.5 py-0.5 bg-red-100 text-red-600 text-xs rounded">✕</button>
                  </div>
                </td>
              </tr>
            ))}
            <tr className="bg-slate-800 text-white font-bold">
              <td className="px-2 py-2 text-xs border border-slate-700">TOTAL</td>
              {[tot.og,tot.add,tot.dis,tot.cg,tot.oa,tot.af,tot.ad,tot.ca,...(isIFRS?[tot.imp]:[]),tot.cy,tot.py].map((v,i)=>(
                <td key={i} className="px-2 py-2 text-xs font-mono text-right border border-slate-700">{fmt(v)}</td>
              ))}
              <td className="border border-slate-700" colSpan={2}></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// RELATED PARTY — fully manual entry
// ═══════════════════════════════════════════════════════════════════════════════
const REL_TYPES = {SUBSIDIARY:'Subsidiary',ASSOCIATE:'Associate',HOLDING:'Holding Company',JV:'Joint Venture',KMP:'Key Managerial Personnel',RELATIVE_KMP:'Relative of KMP',ENTITY_KMP:'Entity controlled by KMP',OTHER:'Other'};
const TX_TYPES  = {PURCHASE_GOODS:'Purchase of Goods',SALE_GOODS:'Sale of Goods',LOAN_GIVEN:'Loan Given',LOAN_TAKEN:'Loan Received',RENT_PAID:'Rent Paid',RENT_RECEIVED:'Rent Received',REMUNERATION:'Remuneration/Compensation',GUARANTEE_GIVEN:'Guarantee Given',SERVICES_RECEIVED:'Services Received',SERVICES_RENDERED:'Services Rendered',DIVIDEND_PAID:'Dividend Paid',OTHER:'Other'};

function RelatedParty({ engagementId, method, currency }) {
  const [parties, setParties] = useState([]);
  const [active, setActive]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [pForm, setPForm]     = useState({name:'',relationship:'SUBSIDIARY',holdingPct:'',panOrReg:'',country:method==='IFRS'||method==='IFRS_SME'?'UAE':'India'});
  const [tForm, setTForm]     = useState({transactionType:'PURCHASE_GOODS',description:'',amountCY:0,amountPY:0,outstandingDr:0,outstandingCr:0,isArmLength:true,remarks:''});
  const [showP, setShowP]     = useState(false);
  const [showT, setShowT]     = useState(false);
  const isKMP = parties.find(p=>p.id===active)?.relationship === 'KMP';

  useEffect(()=>{ load(); },[engagementId]);
  async function load() {
    setLoading(true);
    try { const d=await schedulesAPI.getRelatedParties(engagementId); setParties(d); if(d.length>0&&!active) setActive(d[0].id); }
    catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  }
  async function addParty() {
    try { await schedulesAPI.addParty(engagementId,pForm); setShowP(false); setPForm({name:'',relationship:'SUBSIDIARY',holdingPct:'',panOrReg:'',country:''}); load(); toast.success('Added'); }
    catch { toast.error('Failed'); }
  }
  async function delParty(id) {
    if(!window.confirm('Delete party and all transactions?')) return;
    try { await schedulesAPI.deleteParty(engagementId,id); load(); }
    catch { toast.error('Failed'); }
  }
  async function addTx(pid) {
    try { await schedulesAPI.addTransaction(engagementId,pid,tForm); setShowT(false); setTForm({transactionType:'PURCHASE_GOODS',description:'',amountCY:0,amountPY:0,outstandingDr:0,outstandingCr:0,isArmLength:true,remarks:''}); load(); toast.success('Added'); }
    catch { toast.error('Failed'); }
  }
  async function delTx(tid) {
    try { await schedulesAPI.deleteTransaction(engagementId,tid); load(); }
    catch { toast.error('Failed'); }
  }

  const activeParty = parties.find(p=>p.id===active);
  const std = method==='AS'?'AS 18':method==='IND_AS'?'Ind AS 24':'IAS 24';

  if (loading) return <div className="p-4 text-slate-400">Loading...</div>;
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Related Party Disclosures</h2>
          <p className="text-sm text-slate-500">{std} — Mandatory disclosure</p>
        </div>
        <button onClick={()=>setShowP(true)} className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg">+ Add Party</button>
      </div>
      <Disclaimer method={method} title="Related Party Disclosures"
        dataNeeded="All related party relationships (subsidiaries, associates, KMP, etc.) and every transaction with them during the year including amounts, outstanding balances, and whether at arm's length."
        note={`${std}: KMP compensation must be broken into salary, perquisites, commission, sitting fees, and post-employment benefits. Outstanding balances (receivable/payable) as at year-end required.`}/>

      {showP && (
        <div className="mb-5 bg-white border border-indigo-200 rounded-xl p-5 shadow-sm">
          <h3 className="font-semibold text-slate-800 mb-4">New Related Party</h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2"><label className="block text-xs font-medium text-slate-600 mb-1">Name *</label>
              <input value={pForm.name} onChange={e=>setPForm(f=>({...f,name:e.target.value}))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" placeholder="ABC Private Limited"/></div>
            <div><label className="block text-xs font-medium text-slate-600 mb-1">Relationship *</label>
              <select value={pForm.relationship} onChange={e=>setPForm(f=>({...f,relationship:e.target.value}))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                {Object.entries(REL_TYPES).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
            <div><label className="block text-xs font-medium text-slate-600 mb-1">Holding %</label>
              <input type="number" value={pForm.holdingPct} onChange={e=>setPForm(f=>({...f,holdingPct:e.target.value}))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" placeholder="100"/></div>
            <div><label className="block text-xs font-medium text-slate-600 mb-1">PAN / Trade License / Reg. No.</label>
              <input value={pForm.panOrReg} onChange={e=>setPForm(f=>({...f,panOrReg:e.target.value}))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"/></div>
            <div><label className="block text-xs font-medium text-slate-600 mb-1">Country</label>
              <input value={pForm.country} onChange={e=>setPForm(f=>({...f,country:e.target.value}))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"/></div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={addParty} className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg">Add</button>
            <button onClick={()=>setShowP(false)} className="px-4 py-2 border border-slate-300 text-sm rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      {parties.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-slate-300 rounded-xl text-slate-400">
          <div className="text-4xl mb-2">🤝</div>
          <p>No related parties added. All transactions with related parties must be disclosed.</p>
        </div>
      ) : (
        <div className="flex gap-4">
          <div className="w-52 flex-shrink-0 space-y-1">
            {parties.map(p=>(
              <div key={p.id} className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer ${active===p.id?'bg-indigo-600 text-white border-indigo-600':'bg-white border-slate-200 hover:border-indigo-300 text-slate-700'}`}
                onClick={()=>setActive(p.id)}>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{p.name}</div>
                  <div className={`text-xs ${active===p.id?'text-indigo-200':'text-slate-400'}`}>{REL_TYPES[p.relationship]}</div>
                </div>
                <button onClick={e=>{e.stopPropagation();delParty(p.id);}} className={`text-xs ml-1 ${active===p.id?'text-indigo-200':'text-slate-300 hover:text-red-500'}`}>✕</button>
              </div>
            ))}
          </div>

          {activeParty && (
            <div className="flex-1">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-slate-800">{activeParty.name}</h3>
                  <p className="text-xs text-slate-500">{REL_TYPES[activeParty.relationship]}{activeParty.holdingPct?` — ${activeParty.holdingPct}%`:''}</p>
                </div>
                <button onClick={()=>setShowT(true)} className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg">+ Add Transaction</button>
              </div>

              {showT && (
                <div className="mb-4 bg-indigo-50 border border-indigo-200 rounded-xl p-4">
                  <h4 className="font-medium text-slate-800 mb-3 text-sm">New Transaction — {activeParty.name}</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-xs font-medium text-slate-600 mb-1">Transaction Type</label>
                      <select value={tForm.transactionType} onChange={e=>setTForm(f=>({...f,transactionType:e.target.value}))} className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400">
                        {Object.entries(TX_TYPES).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
                    <div><label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
                      <input value={tForm.description} onChange={e=>setTForm(f=>({...f,description:e.target.value}))} className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400" placeholder="Brief description"/></div>
                    <div><label className="block text-xs font-medium text-slate-600 mb-1">Amount CY ({currency})</label><Amt value={tForm.amountCY} onChange={v=>setTForm(f=>({...f,amountCY:v}))}/></div>
                    <div><label className="block text-xs font-medium text-slate-600 mb-1">Amount PY ({currency})</label><Amt value={tForm.amountPY} onChange={v=>setTForm(f=>({...f,amountPY:v}))}/></div>
                    <div><label className="block text-xs font-medium text-slate-600 mb-1">Outstanding Receivable (Dr)</label><Amt value={tForm.outstandingDr} onChange={v=>setTForm(f=>({...f,outstandingDr:v}))}/></div>
                    <div><label className="block text-xs font-medium text-slate-600 mb-1">Outstanding Payable (Cr)</label><Amt value={tForm.outstandingCr} onChange={v=>setTForm(f=>({...f,outstandingCr:v}))}/></div>
                    <div className="col-span-2 flex items-center gap-3">
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input type="checkbox" checked={tForm.isArmLength} onChange={e=>setTForm(f=>({...f,isArmLength:e.target.checked}))} className="w-4 h-4"/>
                        At arm's length
                      </label>
                    </div>
                    <div className="col-span-2"><label className="block text-xs font-medium text-slate-600 mb-1">Remarks</label>
                      <input value={tForm.remarks} onChange={e=>setTForm(f=>({...f,remarks:e.target.value}))} className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none" placeholder="Additional remarks..."/></div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={()=>addTx(activeParty.id)} className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg">Add</button>
                    <button onClick={()=>setShowT(false)} className="px-3 py-1.5 border border-slate-300 text-sm rounded-lg">Cancel</button>
                  </div>
                </div>
              )}

              {!activeParty.transactions?.length ? (
                <p className="text-slate-400 text-sm py-4 text-center">No transactions yet for {activeParty.name}.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-800 text-white">
                      <tr>
                        <th className="text-left px-3 py-2 text-xs">Transaction</th>
                        <th className="text-right px-3 py-2 text-xs">CY ({currency})</th>
                        <th className="text-right px-3 py-2 text-xs">PY ({currency})</th>
                        <th className="text-right px-3 py-2 text-xs">O/S Dr</th>
                        <th className="text-right px-3 py-2 text-xs">O/S Cr</th>
                        <th className="px-3 py-2 text-xs">Arm's Length</th>
                        <th className="w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activeParty.transactions.map(tx=>(
                        <tr key={tx.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2.5">
                            <div className="font-medium text-slate-800 text-xs">{TX_TYPES[tx.transactionType]}</div>
                            {tx.description&&<div className="text-slate-400 text-xs">{tx.description}</div>}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs">{fmt(tx.amountCY)}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs text-slate-500">{fmt(tx.amountPY)}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs">{fmt(tx.outstandingDr)}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs">{fmt(tx.outstandingCr)}</td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-xs ${tx.isArmLength?'bg-green-100 text-green-700':'bg-amber-100 text-amber-700'}`}>{tx.isArmLength?'Yes':'No'}</span>
                          </td>
                          <td className="px-2 py-2.5 text-center"><button onClick={()=>delTx(tx.id)} className="text-red-400 hover:text-red-600 text-xs">✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EPS — PAT from P&L (auto), shares from user
// ═══════════════════════════════════════════════════════════════════════════════
function EPSWorking({ engagementId, method, currency }) {
  const [data, setData]   = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(()=>{ load(); },[engagementId]);
  async function load() { setLoading(true); try { setData(await schedulesAPI.getEPS(engagementId)); } catch { toast.error('Failed'); } finally { setLoading(false); } }
  async function save() { setSaving(true); try { await schedulesAPI.saveEPS(engagementId,data); toast.success('Saved'); } catch { toast.error('Failed'); } finally { setSaving(false); } }
  const set = (f,v) => setData(d=>({...d,[f]:v}));

  if (loading||!data) return <div className="p-4 text-slate-400">Loading...</div>;
  const net     = N(data.patFromPL) - N(data.prefDividend);
  const basic   = N(data.weightedAvgShares)>0 ? net/N(data.weightedAvgShares) : 0;
  const diluted = (N(data.weightedAvgShares)+N(data.dilutiveShares))>0 ? net/(N(data.weightedAvgShares)+N(data.dilutiveShares)) : 0;
  const basicPY = N(data.sharesPY)>0 ? N(data.patPY)/N(data.sharesPY) : 0;
  const std     = method==='AS'?'AS 20':method==='IND_AS'?'Ind AS 33':'IAS 33';
  const required = method !== 'IFRS_SME';

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Earnings Per Share</h2>
          <p className="text-sm text-slate-500">{std} — {required?'Mandatory':'Voluntary'}</p>
        </div>
      </div>
      <Disclaimer method={method} title="EPS Working"
        dataNeeded="Weighted average number of equity shares outstanding during the year. Face value per share. Preference dividend if any. Dilutive instruments (options, convertibles) if applicable."
        note="PAT is auto-filled from the generated P&L. Prior year PAT and shares must be entered manually."/>

      {!required && <div className="mb-4 p-3 bg-slate-100 rounded-lg text-sm text-slate-600">EPS not mandatory under IFRS for SMEs but included as voluntary disclosure.</div>}

      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-5">
        <h3 className="font-semibold text-slate-700 mb-4 text-sm">Input Data</h3>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-xs font-medium text-slate-600 mb-1">PAT from P&L — auto ({currency})</label>
            <input readOnly value={fmt(data.patFromPL)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 font-mono text-right"/></div>
          <div><label className="block text-xs font-medium text-slate-600 mb-1">Less: Preference Dividend ({currency})</label><Amt value={data.prefDividend} onChange={v=>set('prefDividend',v)}/></div>
          <div><label className="block text-xs font-medium text-slate-600 mb-1">Weighted Avg Equity Shares (Nos.)</label>
            <input type="number" value={data.weightedAvgShares||''} onChange={e=>set('weightedAvgShares',Number(e.target.value))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 text-right font-mono" placeholder="1000000"/></div>
          <div><label className="block text-xs font-medium text-slate-600 mb-1">Dilutive Shares (Nos.)</label>
            <input type="number" value={data.dilutiveShares||''} onChange={e=>set('dilutiveShares',Number(e.target.value))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 text-right font-mono" placeholder="0"/></div>
          <div><label className="block text-xs font-medium text-slate-600 mb-1">Face Value per Share ({currency})</label><Amt value={data.faceValue} onChange={v=>set('faceValue',v)}/></div>
          <div><label className="block text-xs font-medium text-slate-600 mb-1 text-amber-600">Prior Year PAT ({currency}) — manual</label><Amt value={data.patPY} onChange={v=>set('patPY',v)}/></div>
          <div><label className="block text-xs font-medium text-slate-600 mb-1 text-amber-600">Prior Year Wtd Avg Shares — manual</label>
            <input type="number" value={data.sharesPY||''} onChange={e=>set('sharesPY',Number(e.target.value))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 text-right font-mono" placeholder="1000000"/></div>
        </div>
        <button onClick={save} disabled={saving} className="mt-4 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50">{saving?'Saving...':'💾 Save'}</button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead><tr className="bg-slate-800 text-white"><th className="text-left px-4 py-3 text-sm">Particulars</th><th className="text-right px-4 py-3 text-sm w-44">Current Year</th><th className="text-right px-4 py-3 text-sm w-44">Prior Year</th></tr></thead>
          <tbody>
            {[
              ['Profit After Tax ('+currency+')', fmt(data.patFromPL), fmt(data.patPY)],
              ['Less: Preference Dividend ('+currency+')', fmt(data.prefDividend), '—'],
              ['Net Profit for Equity Holders ('+currency+')', fmt(net), fmt(data.patPY), true],
              ['Weighted Avg Shares (Nos.)', N(data.weightedAvgShares).toLocaleString('en-IN'), N(data.sharesPY).toLocaleString('en-IN')],
              ['Basic EPS ('+currency+') — '+std, basic.toFixed(2), basicPY.toFixed(2), true],
              ['Add: Dilutive Shares (Nos.)', N(data.dilutiveShares).toLocaleString('en-IN'), '—'],
              ['Diluted EPS ('+currency+')', diluted.toFixed(2), '—', true],
              ['Face Value per Share ('+currency+')', fmt(data.faceValue), fmt(data.faceValue)],
            ].map(([l,cy,py,bold],i)=>(
              <tr key={i} className={`${bold?'bg-indigo-50 font-semibold border-t border-indigo-200':'hover:bg-slate-50'} border-b border-slate-100`}>
                <td className="px-4 py-2.5 text-sm text-slate-700">{l}</td>
                <td className="px-4 py-2.5 text-right font-mono text-sm">{cy}</td>
                <td className="px-4 py-2.5 text-right font-mono text-sm text-slate-500">{py}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEFERRED TAX — TB-driven with timing differences
// ═══════════════════════════════════════════════════════════════════════════════
function DeferredTax({ engagementId, method, currency }) {
  const [items, setItems]   = useState([]);
  const [saving, setSaving] = useState({});
  const [loading, setLoading] = useState(true);
  const hasOCI = ['IND_AS','IFRS'].includes(method);
  const std    = method==='AS'?'AS 22':method==='IND_AS'?'Ind AS 12':'IAS 12';

  useEffect(()=>{ load(); },[engagementId]);
  async function load() { setLoading(true); try { setItems(await schedulesAPI.getDeferredTax(engagementId)); } catch { toast.error('Failed'); } finally { setLoading(false); } }
  const upd=(id,f,v)=>setItems(p=>p.map(i=>i.id===id?{...i,[f]:v}:i));
  async function save(item) { setSaving(s=>({...s,[item.id]:true})); try { await schedulesAPI.saveDTItem(engagementId,item.id,item); toast.success('Saved'); } catch { toast.error('Failed'); } finally { setSaving(s=>({...s,[item.id]:false})); } }
  async function add() { try { const r=await schedulesAPI.addDTItem(engagementId,{description:'New timing difference',isAsset:true}); setItems(p=>[...p,r]); } catch { toast.error('Failed'); } }
  async function del(id) { try { await schedulesAPI.deleteDTItem(engagementId,id); setItems(p=>p.filter(i=>i.id!==id)); } catch { toast.error('Failed'); } }

  const calc = items.map(r=>{
    const rate=N(r.taxRate)/100;
    const open=N(r.openingDiff)*rate;
    const pl=(N(r.createdInPL)-N(r.reversedInPL))*rate;
    const oci=(N(r.createdInOCI)-N(r.reversedInOCI))*rate;
    return {...r,openTA:open,plEffect:pl,ociEffect:oci,closingTA:open+pl+oci};
  });
  const dta=calc.filter(r=>r.isAsset), dtl=calc.filter(r=>!r.isAsset);
  const netDTA=dta.reduce((s,r)=>s+r.closingTA,0)-dtl.reduce((s,r)=>s+r.closingTA,0);
  const th='px-2 py-2 text-xs font-semibold text-white bg-slate-800 border border-slate-700 text-center';

  if (loading) return <div className="p-4 text-slate-400">Loading...</div>;

  const renderGroup=(grp,label,color)=>(
    <>
      <tr className="bg-slate-100"><td colSpan={hasOCI?10:8} className={`px-3 py-1.5 text-xs font-bold ${color}`}>{label}</td></tr>
      {grp.map(r=>(
        <tr key={r.id} className="hover:bg-slate-50">
          <td className="px-1 py-1 border border-slate-200"><input value={r.description} onChange={e=>upd(r.id,'description',e.target.value)} className="w-full text-xs border-0 outline-none bg-transparent"/></td>
          <td className="px-1 py-1 border border-slate-200"><Amt value={r.openingDiff} onChange={v=>upd(r.id,'openingDiff',v)}/></td>
          <td className="px-1 py-1 border border-slate-200 text-right font-mono text-xs bg-slate-50">{fmt(r.openTA)}</td>
          <td className="px-1 py-1 border border-slate-200"><Amt value={r.createdInPL} onChange={v=>upd(r.id,'createdInPL',v)}/></td>
          <td className="px-1 py-1 border border-slate-200"><Amt value={r.reversedInPL} onChange={v=>upd(r.id,'reversedInPL',v)}/></td>
          {hasOCI&&<><td className="px-1 py-1 border border-slate-200"><Amt value={r.createdInOCI} onChange={v=>upd(r.id,'createdInOCI',v)}/></td>
          <td className="px-1 py-1 border border-slate-200"><Amt value={r.reversedInOCI} onChange={v=>upd(r.id,'reversedInOCI',v)}/></td></>}
          <td className="px-1 py-1 border border-slate-200 font-mono font-bold text-right text-indigo-700 bg-indigo-50 text-xs">{fmt(r.closingTA)}</td>
          <td className="px-1 py-1 border border-slate-200"><input type="number" value={r.taxRate} onChange={e=>upd(r.id,'taxRate',Number(e.target.value))} className="w-14 text-xs border-0 outline-none bg-transparent text-right font-mono"/>%</td>
          <td className="px-1 py-1 border border-slate-200">
            <div className="flex gap-0.5"><button onClick={()=>save(r)} disabled={saving[r.id]} className="px-1.5 py-0.5 bg-indigo-600 text-white text-xs rounded">{saving[r.id]?'...':'💾'}</button>
            <button onClick={()=>del(r.id)} className="px-1.5 py-0.5 bg-red-100 text-red-600 text-xs rounded">✕</button></div>
          </td>
        </tr>
      ))}
    </>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div><h2 className="text-lg font-bold text-slate-800">Deferred Tax Working</h2>
          <p className="text-sm text-slate-500">{std}</p></div>
        <button onClick={add} className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg">+ Add Item</button>
      </div>
      <Disclaimer method={method} title="Deferred Tax"
        dataNeeded="Each timing/temporary difference with its opening balance, amounts created and reversed during the year. Tax rate applicable."
        note={hasOCI?"Ind AS 12/IAS 12: Items recognised in OCI (actuarial gains, FVOCI) have separate OCI columns. Net DTA/DTL must match the BS balance.":"AS 22: Only P&L timing differences. Net balance must match BS."}/>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-max text-sm">
          <thead><tr>
            <th className={`${th} text-left w-52`}>Description</th>
            <th className={th}>Opening Temp Diff</th>
            <th className={th}>Opening Tax Effect</th>
            <th className={th}>Created in P&L</th>
            <th className={th}>Reversed in P&L</th>
            {hasOCI&&<><th className={th}>Created in OCI</th><th className={th}>Reversed in OCI</th></>}
            <th className={`${th} bg-indigo-800`}>Closing DTA/DTL ({currency})</th>
            <th className={th}>Tax Rate</th>
            <th className={th}></th>
          </tr></thead>
          <tbody>
            {renderGroup(dta,'Deferred Tax Assets (DTA)','text-green-700')}
            {renderGroup(dtl,'Deferred Tax Liabilities (DTL)','text-red-700')}
            <tr className="bg-slate-800 text-white font-bold">
              <td className="px-2 py-2 text-xs border border-slate-700" colSpan={hasOCI?7:5}>Net Deferred Tax {netDTA>=0?'Asset':'Liability'} ({currency})</td>
              <td className="px-2 py-2 text-xs font-mono text-right border border-slate-700">{fmt(Math.abs(netDTA))}</td>
              <td className="border border-slate-700" colSpan={2}></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTINGENCIES — fully manual
// ═══════════════════════════════════════════════════════════════════════════════
const CONT_TYPES = {CONTINGENT_LIABILITY:'Contingent Liability',CAPITAL_COMMITMENT:'Capital Commitment',OTHER_COMMITMENT:'Other Commitment'};
const CATEGORIES  = {TAX_DEMAND:'Tax Demand',LEGAL_CASE:'Legal Case / Litigation',BANK_GUARANTEE:'Bank Guarantee',LC:'Letter of Credit',CAPITAL_COMMITMENT:'Capital Commitment',OTHER:'Other'};

function Contingencies({ engagementId, method, currency }) {
  const [items, setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]     = useState({contingencyType:'CONTINGENT_LIABILITY',category:'TAX_DEMAND',description:'',amount:'',remarks:''});

  useEffect(()=>{ load(); },[engagementId]);
  async function load() { setLoading(true); try { setItems(await schedulesAPI.getContingencies(engagementId)); } catch { toast.error('Failed'); } finally { setLoading(false); } }
  async function add() {
    try { await schedulesAPI.addContingency(engagementId,{...form,amount:form.amount?Number(form.amount):null}); setShowForm(false); setForm({contingencyType:'CONTINGENT_LIABILITY',category:'TAX_DEMAND',description:'',amount:'',remarks:''}); load(); toast.success('Added'); }
    catch { toast.error('Failed'); }
  }
  async function save(item) { setSaving(s=>({...s,[item.id]:true})); try { await schedulesAPI.saveContingency(engagementId,item.id,item); toast.success('Saved'); } catch { toast.error('Failed'); } finally { setSaving(s=>({...s,[item.id]:false})); } }
  async function del(id) { try { await schedulesAPI.deleteContingency(engagementId,id); setItems(p=>p.filter(i=>i.id!==id)); } catch { toast.error('Failed'); } }
  const upd=(id,f,v)=>setItems(p=>p.map(i=>i.id===id?{...i,[f]:v}:i));
  const grouped = items.reduce((g,i)=>{ (g[i.contingencyType]=g[i.contingencyType]||[]).push(i); return g; },{});

  if (loading) return <div className="p-4 text-slate-400">Loading...</div>;
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div><h2 className="text-lg font-bold text-slate-800">Contingent Liabilities & Commitments</h2>
          <p className="text-sm text-slate-500">All methods — Mandatory disclosure</p></div>
        <button onClick={()=>setShowForm(true)} className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg">+ Add Item</button>
      </div>
      <Disclaimer method={method} title="Contingencies & Commitments"
        dataNeeded="All known contingent liabilities (tax demands, legal cases, bank guarantees, letters of credit) and capital commitments. Amounts may be left blank if not ascertainable."
        note="These items do NOT appear in the TB — they are off-balance-sheet items that must be entered manually from legal/audit findings."/>

      {showForm && (
        <div className="mb-5 bg-white border border-indigo-200 rounded-xl p-5 shadow-sm">
          <h3 className="font-semibold text-slate-800 mb-4 text-sm">New Item</h3>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
              <select value={form.contingencyType} onChange={e=>setForm(f=>({...f,contingencyType:e.target.value}))} className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400">
                {Object.entries(CONT_TYPES).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
            <div><label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
              <select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))} className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400">
                {Object.entries(CATEGORIES).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
            <div><label className="block text-xs font-medium text-slate-600 mb-1">Amount ({currency}) — if known</label>
              <input type="number" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-right font-mono focus:outline-none focus:ring-1 focus:ring-indigo-400" placeholder="Leave blank if unknown"/></div>
            <div className="col-span-2"><label className="block text-xs font-medium text-slate-600 mb-1">Description *</label>
              <input value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400" placeholder="e.g. Income tax demand for AY 2023-24 — DCIT Circle-1(2)"/></div>
            <div><label className="block text-xs font-medium text-slate-600 mb-1">Remarks</label>
              <input value={form.remarks} onChange={e=>setForm(f=>({...f,remarks:e.target.value}))} className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none" placeholder="Appeal filed before CIT(A)"/></div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={add} className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg">Add</button>
            <button onClick={()=>setShowForm(false)} className="px-4 py-2 border border-slate-300 text-sm rounded-lg">Cancel</button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-slate-300 rounded-xl text-slate-400">
          <div className="text-4xl mb-2">⚖️</div>
          <p>No contingencies added. Add any known tax demands, legal cases, guarantees, or commitments.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([type,typeItems])=>(
            <div key={type} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200">
                <h3 className="font-semibold text-slate-700 text-sm">{CONT_TYPES[type]}</h3>
              </div>
              <div className="divide-y divide-slate-100">
                {typeItems.map(item=>(
                  <div key={item.id} className="px-4 py-3 hover:bg-slate-50">
                    <div className="flex items-start gap-3">
                      <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded mt-0.5 flex-shrink-0">{CATEGORIES[item.category]}</span>
                      <div className="flex-1">
                        <input value={item.description} onChange={e=>upd(item.id,'description',e.target.value)} className="w-full text-sm text-slate-800 border-0 outline-none bg-transparent font-medium"/>
                        <input value={item.remarks||''} onChange={e=>upd(item.id,'remarks',e.target.value)} className="w-full text-xs text-slate-500 border-0 outline-none bg-transparent mt-0.5 italic" placeholder="Remarks..."/>
                      </div>
                      <div className="w-36 flex-shrink-0">
                        <Amt value={item.amount||''} onChange={v=>upd(item.id,'amount',v)}/>
                        <p className="text-xs text-slate-400 text-right mt-0.5">{currency}</p>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button onClick={()=>save(item)} disabled={saving[item.id]} className="px-2 py-1 bg-indigo-600 text-white text-xs rounded">{saving[item.id]?'...':'💾'}</button>
                        <button onClick={()=>del(item.id)} className="px-2 py-1 bg-red-100 text-red-600 text-xs rounded">✕</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
const TABS = [
  { key:'ppe',    label:'PPE Schedule',         icon:'🏗️', all:true },
  { key:'intang', label:'Intangible Assets',     icon:'💡', all:true },
  { key:'rp',     label:'Related Party',         icon:'🤝', all:true },
  { key:'eps',    label:'EPS Working',           icon:'📈', all:true },
  { key:'dt',     label:'Deferred Tax',          icon:'🔄', all:true },
  { key:'cont',   label:'Contingencies',         icon:'⚖️', all:true },
];

export default function Schedules() {
  const { engagementId } = useParams();
  const { currentEngagement, currentClient, firm } = useStore();
  const method   = currentEngagement?.method || 'AS';
  // Method is always authoritative for currency
  const currency = (method === 'IFRS' || method === 'IFRS_SME') ? 'AED'
    : (method === 'AS' || method === 'IND_AS') ? 'INR'
    : (currentClient?.region === 'UAE' || firm?.region === 'UAE') ? 'AED'
    : 'INR';
  const [activeTab, setActiveTab] = useState('ppe');

  return (
    <div className="flex" style={{minHeight:'calc(100vh - 64px)'}}>
      {/* Sidebar */}
      <div className="w-56 flex-shrink-0 bg-slate-50 border-r border-slate-200 p-3">
        <div className="px-2 mb-4">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Schedules & Disclosures</p>
          <div className={`text-xs px-2.5 py-1.5 rounded-lg font-bold text-center ${method==='AS'?'bg-blue-100 text-blue-700':method==='IND_AS'?'bg-purple-100 text-purple-700':method==='IFRS'?'bg-emerald-100 text-emerald-700':'bg-amber-100 text-amber-700'}`}>
            {method} · {currency}
          </div>
        </div>
        <div className="space-y-0.5">
          {TABS.map(t=>(
            <button key={t.key} onClick={()=>setActiveTab(t.key)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab===t.key?'bg-indigo-600 text-white shadow-md':'text-slate-600 hover:bg-slate-200'}`}>
              <span>{t.icon}</span><span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab==='ppe'    && <PPESchedule    engagementId={engagementId} method={method} currency={currency}/>}
        {activeTab==='intang' && <IntangibleSchedule engagementId={engagementId} method={method} currency={currency}/>}
        {activeTab==='rp'     && <RelatedParty   engagementId={engagementId} method={method} currency={currency}/>}
        {activeTab==='eps'    && <EPSWorking     engagementId={engagementId} method={method} currency={currency}/>}
        {activeTab==='dt'     && <DeferredTax    engagementId={engagementId} method={method} currency={currency}/>}
        {activeTab==='cont'   && <Contingencies  engagementId={engagementId} method={method} currency={currency}/>}
      </div>
    </div>
  );
}
