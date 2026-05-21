import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { fsAPI } from '../api/client';
import { useStore } from '../store';
import toast from 'react-hot-toast';

const UNITS = [
  { label: 'Actual',    value: 1        },
  { label: 'Hundreds',  value: 100      },
  { label: 'Thousands', value: 1000     },
  { label: 'Lakhs',     value: 100000   },
  { label: 'Crores',    value: 10000000 },
];

const METHOD_CONFIG = {
  AS:       { bsTitle: 'Balance Sheet',                   plTitle: 'Statement of Profit and Loss',    tabs: ['BS','PL','CFS'],             standard: 'Companies Act 2013 — Schedule III',     hasOCI: false },
  IND_AS:   { bsTitle: 'Balance Sheet',                   plTitle: 'Statement of Profit and Loss',    tabs: ['BS','PL','OCI','CFS','SOCE'], standard: 'Ind AS — Schedule III Division II',     hasOCI: true  },
  IFRS:     { bsTitle: 'Statement of Financial Position', plTitle: 'Statement of Comprehensive Income', tabs: ['BS','PL','OCI','CFS','SOCE'], standard: 'IFRS — IAS 1',                     hasOCI: true  },
  IFRS_SME: { bsTitle: 'Statement of Financial Position', plTitle: 'Statement of Comprehensive Income', tabs: ['BS','PL','CFS','SOCE'],     standard: 'IFRS for SMEs — Section 3',        hasOCI: false },
};

function fmt(n, divisor = 1) {
  const num = Number(n || 0) / divisor;
  const abs = Math.abs(num);
  const s   = abs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return num < 0 ? `(${s})` : s;
}

// ── Table Row ────────────────────────────────────────────────────────────────
function Row({ label, note, amount, bold, indent, section, subheader, borderTop, divisor, onHide, hideable }) {
  const [hovered, setHovered] = useState(false);
  if (section)   return <tr className="bg-slate-100"><td colSpan={4} className="px-3 py-2 font-bold text-slate-700 uppercase text-xs tracking-wide">{label}</td></tr>;
  if (subheader) return <tr className="bg-slate-50"><td colSpan={4} className="px-3 py-1.5 font-semibold text-slate-600 text-xs">{label}</td></tr>;
  return (
    <tr className={`${borderTop ? 'border-t-2 border-slate-600' : ''} ${bold ? 'bg-slate-50' : 'border-b border-slate-100 hover:bg-blue-50'} transition-colors`}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <td className={`py-2.5 pr-4 text-sm ${indent===2?'pl-10':indent?'pl-6':'pl-3'} ${bold?'font-bold text-slate-900':'text-slate-700'}`}>{label}</td>
      <td className="py-2.5 px-2 text-center w-16 text-sm">{note && <span className="text-indigo-600 font-semibold">{note}</span>}</td>
      <td className={`py-2.5 px-3 text-right font-mono text-sm w-44 ${bold?'font-bold text-slate-900':'text-slate-800'}`}>
        {amount !== undefined && amount !== null ? fmt(amount, divisor) : '—'}
      </td>
      <td className="py-2.5 px-2 w-20 text-center">
        {hideable && hovered && onHide && (
          <button onClick={onHide} className="px-1.5 py-0.5 text-xs bg-red-100 text-red-600 rounded hover:bg-red-200">👁 Hide</button>
        )}
      </td>
    </tr>
  );
}

// ── Balance Sheet ─────────────────────────────────────────────────────────────
function BSStatement({ lines, method, hidden, onHide, divisor, currSymbol }) {
  const cfg    = METHOD_CONFIG[method] || METHOD_CONFIG.AS;
  const D      = divisor;
  const isIFRS = method === 'IFRS' || method === 'IFRS_SME';

  const vis    = lines.filter(l => !hidden[l.groupName]);
  const eq     = vis.filter(l => l.assetLiability === 'Equity');
  const liab   = vis.filter(l => l.assetLiability === 'Liabilities');
  const assets = vis.filter(l => l.assetLiability === 'Assets');
  const other  = vis.filter(l => !['Equity','Liabilities','Assets','Income','Expenses'].includes(l.assetLiability));

  const totalEq     = eq.reduce((s,l)    => s + Number(l.totalFinalNet||0), 0);
  const totalLiab   = liab.reduce((s,l)  => s + Number(l.totalFinalNet||0), 0);
  const totalEqLiab = totalEq + totalLiab + other.reduce((s,l) => s + Number(l.totalFinalNet||0), 0);
  const totalAssets = assets.reduce((s,l) => s + Number(l.totalFinalNet||0), 0);
  const diff        = totalAssets - totalEqLiab;

  const Lines = ({ arr }) => arr.map((l,i) => (
    <Row key={i} label={l.groupName} note={l.noteGroup?.noteNumber} amount={Number(l.totalFinalNet)}
      indent={2} divisor={D} hideable onHide={() => onHide(l.groupName)} />
  ));

  return (
    <div>
      <div className="text-center mb-5">
        <h2 className="text-lg font-bold uppercase tracking-wide">{cfg.bsTitle}</h2>
        <p className="text-sm text-slate-500">as at 31st March</p>
        <p className="text-xs text-slate-400 mt-0.5">All amounts in {currSymbol}</p>
        <p className="text-xs text-slate-400">{cfg.standard}</p>
      </div>

      <table className="w-full text-sm border border-slate-300 rounded-lg overflow-hidden">
        <thead>
          <tr className="bg-slate-800 text-white">
            <th className="text-left px-3 py-3 font-semibold">Particulars</th>
            <th className="text-center px-2 py-3 font-semibold w-16">Note</th>
            <th className="text-right px-3 py-3 font-semibold w-44">Amount ({currSymbol})</th>
            <th className="w-20"></th>
          </tr>
        </thead>
        <tbody>
          {/* ── EQUITY & LIABILITIES ── */}
          <Row label={isIFRS ? 'EQUITY AND LIABILITIES' : 'I. EQUITY AND LIABILITIES'} section />

          {eq.length > 0 && <>
            <Row label="Equity" subheader />
            <Lines arr={eq} />
            <Row label="Total Equity" amount={totalEq} bold borderTop divisor={D} />
          </>}

          {liab.length > 0 && <>
            <Row label="Liabilities" subheader />
            <Lines arr={liab} />
            <Row label="Total Liabilities" amount={totalLiab} bold borderTop divisor={D} />
          </>}

          {other.length > 0 && <>
            <Row label="Other" subheader />
            <Lines arr={other} />
          </>}

          <Row label={isIFRS ? 'TOTAL EQUITY AND LIABILITIES' : 'TOTAL — EQUITY AND LIABILITIES'} amount={totalEqLiab} bold borderTop divisor={D} />

          {/* ── ASSETS ── */}
          <Row label={isIFRS ? 'ASSETS' : 'II. ASSETS'} section />
          {assets.length > 0
            ? <Lines arr={assets} />
            : <tr><td colSpan={4} className="px-3 py-4 text-slate-400 text-sm text-center italic">No asset lines — re-generate FS after fixing mappings</td></tr>}
          <Row label={isIFRS ? 'TOTAL ASSETS' : 'TOTAL — ASSETS'} amount={totalAssets} bold borderTop divisor={D} />
        </tbody>
      </table>

      {/* Balance check */}
      <div className={`mt-3 p-3 rounded-xl text-sm font-semibold text-right ${Math.abs(diff) < 1 ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
        {Math.abs(diff) < 1
          ? '✓ Balance Sheet tallies — Assets = Equity + Liabilities'
          : <>
              ⚠ Difference: {fmt(Math.abs(diff), D)} — Balance Sheet does not balance
              <div className="text-xs font-normal mt-1 text-red-600">
                Assets: {fmt(totalAssets, D)} | Equity: {fmt(totalEq, D)} | Liabilities: {fmt(totalLiab, D)}<br/>
                Fix: Check that liability/equity items are not mapped as assets. Re-generate FS after fixing.
              </div>
            </>
        }
      </div>
    </div>
  );
}

// ── Profit & Loss ─────────────────────────────────────────────────────────────
function PLStatement({ lines, method, divisor, currSymbol }) {
  const cfg   = METHOD_CONFIG[method] || METHOD_CONFIG.AS;
  const D     = divisor;
  const isIFRS = method === 'IFRS' || method === 'IFRS_SME';

  const incomeLines  = lines.filter(l => l.assetLiability === 'Income');
  const expenseLines = lines.filter(l => l.assetLiability === 'Expenses' && l.sheet === 'PL');
  const ociLines     = lines.filter(l => l.sheet === 'OCI');

  // Gross Profit = Revenue - Cost of Sales
  const revenue     = incomeLines.filter(l => ['revenue from operations','revenue from contracts','revenue','turnover','sales'].some(k=>l.groupName?.toLowerCase().includes(k))).reduce((s,l)=>s+Number(l.totalFinalNet||0),0);
  const otherIncome = incomeLines.filter(l => !['revenue from operations','revenue from contracts','revenue','turnover','sales'].some(k=>l.groupName?.toLowerCase().includes(k))).reduce((s,l)=>s+Number(l.totalFinalNet||0),0);
  const totalIncome = incomeLines.reduce((s,l)=>s+Number(l.totalFinalNet||0),0);

  const cos         = expenseLines.filter(l=>['cost of sale','cost of good','cost of material','purchase of stock','changes in inventor'].some(k=>l.groupName?.toLowerCase().includes(k))).reduce((s,l)=>s+Number(l.totalFinalNet||0),0);
  const totalExpense= expenseLines.reduce((s,l)=>s+Number(l.totalFinalNet||0),0);
  const taxExpense  = expenseLines.filter(l=>['tax expense','income tax'].some(k=>l.groupName?.toLowerCase().includes(k))).reduce((s,l)=>s+Number(l.totalFinalNet||0),0);

  const grossProfit = revenue - cos;
  const pat         = totalIncome - totalExpense;
  const ociTotal    = ociLines.reduce((s,l)=>s+Number(l.totalFinalNet||0),0);
  const totalComprehensive = pat + ociTotal;

  return (
    <div>
      <div className="text-center mb-5">
        <h2 className="text-lg font-bold uppercase tracking-wide">{cfg.plTitle}</h2>
        <p className="text-sm text-slate-500">for the year ended 31st March</p>
        <p className="text-xs text-slate-400 mt-0.5">All amounts in {currSymbol}</p>
        <p className="text-xs text-slate-400">{cfg.standard}</p>
      </div>

      <table className="w-full text-sm border border-slate-300 rounded-lg overflow-hidden">
        <thead>
          <tr className="bg-slate-800 text-white">
            <th className="text-left px-3 py-3 font-semibold">Particulars</th>
            <th className="text-center px-2 py-3 font-semibold w-16">Note</th>
            <th className="text-right px-3 py-3 font-semibold w-44">Amount ({currSymbol})</th>
            <th className="w-20"></th>
          </tr>
        </thead>
        <tbody>
          <Row label="I. REVENUE / INCOME" section />
          {incomeLines.map((l,i) => <Row key={i} label={l.groupName} note={l.noteGroup?.noteNumber} amount={Number(l.totalFinalNet)} indent={2} divisor={D} hideable />)}
          <Row label="Total Revenue (I)" amount={totalIncome} bold borderTop divisor={D} />

          <Row label="II. EXPENSES" section />
          {expenseLines.map((l,i) => <Row key={i} label={l.groupName} note={l.noteGroup?.noteNumber} amount={Number(l.totalFinalNet)} indent={2} divisor={D} hideable />)}
          <Row label="Total Expenses (II)" amount={totalExpense} bold borderTop divisor={D} />

          {/* Formula: Gross Profit */}
          {cos > 0 && <Row label="Gross Profit (Revenue − Cost of Sales)" amount={grossProfit} bold borderTop divisor={D} />}

          <Row label="Profit / (Loss) Before Tax (I − II)" amount={pat + taxExpense} bold borderTop divisor={D} />
          <Row label="Less: Income Tax Expense" amount={taxExpense} indent divisor={D} />
          <Row label="Profit / (Loss) for the Year" amount={pat} bold borderTop divisor={D} />

          {/* OCI for IFRS / Ind AS */}
          {cfg.hasOCI && <>
            <Row label="III. OTHER COMPREHENSIVE INCOME" section />
            {ociLines.length > 0
              ? ociLines.map((l,i) => <Row key={i} label={l.groupName} note={l.noteGroup?.noteNumber} amount={Number(l.totalFinalNet)} indent={2} divisor={D} />)
              : <tr><td colSpan={4} className="px-3 py-2 text-xs text-slate-400 italic">No OCI items — map items to OCI in Mapping page if applicable</td></tr>}
            <Row label="Total Other Comprehensive Income (III)" amount={ociTotal} bold borderTop divisor={D} />
            <Row label="Total Comprehensive Income for the Year (I − II + III)" amount={totalComprehensive} bold borderTop divisor={D} />
          </>}

          {/* EPS placeholder */}
          <Row label="Earnings Per Share (Face Value — see Note)" bold borderTop divisor={D} />
          <Row label="Basic EPS" amount={null} indent={2} divisor={D} />
          <Row label="Diluted EPS" amount={null} indent={2} divisor={D} />
        </tbody>
      </table>

      {/* Formula Summary */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        {[
          { label: 'Total Revenue', value: totalIncome, color: 'bg-green-50 border-green-200 text-green-800' },
          { label: 'Total Expenses', value: totalExpense, color: 'bg-red-50 border-red-200 text-red-800' },
          { label: 'Net Profit / (Loss)', value: pat, color: pat >= 0 ? 'bg-indigo-50 border-indigo-200 text-indigo-800' : 'bg-red-50 border-red-200 text-red-800' },
        ].map(s => (
          <div key={s.label} className={`border rounded-xl p-3 ${s.color}`}>
            <div className="text-xs font-medium opacity-70">{s.label}</div>
            <div className="text-lg font-bold font-mono mt-1">{fmt(s.value, D)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── CFS ───────────────────────────────────────────────────────────────────────
function CFSStatement({ bsLines, plLines, method, cfsMethod, onMethodChange, divisor, currSymbol }) {
  const D = divisor;
  const incomeLines  = plLines.filter(l => l.assetLiability === 'Income');
  const expenseLines = plLines.filter(l => l.assetLiability === 'Expenses' && l.sheet === 'PL');
  const totalIncome  = incomeLines.reduce((s,l) => s + Number(l.totalFinalNet||0), 0);
  const totalExpense = expenseLines.reduce((s,l) => s + Number(l.totalFinalNet||0), 0);
  const pbt          = totalIncome - totalExpense;
  const cash         = bsLines.filter(l => ['cash','bank'].some(k=>l.groupName?.toLowerCase().includes(k))).reduce((s,l)=>s+Number(l.totalFinalNet||0),0);
  const depr         = expenseLines.filter(l => ['depreciation','amortis'].some(k=>l.groupName?.toLowerCase().includes(k))).reduce((s,l)=>s+Number(l.totalFinalNet||0),0);
  const finCost      = expenseLines.filter(l => ['finance cost','interest expense','bank charge'].some(k=>l.groupName?.toLowerCase().includes(k))).reduce((s,l)=>s+Number(l.totalFinalNet||0),0);
  const isIFRS       = method === 'IFRS' || method === 'IFRS_SME';

  const CRow = ({ label, amount, bold, indent }) => (
    <tr className={`${bold ? 'border-t-2 border-slate-500 bg-slate-50 font-bold' : 'border-b border-slate-100 hover:bg-blue-50'}`}>
      <td className={`py-2 text-sm ${indent===2?'pl-10':indent?'pl-6':'pl-3'} ${bold?'font-bold text-slate-900':'text-slate-700'}`}>{label}</td>
      <td className={`py-2 pr-3 text-right font-mono text-sm ${bold?'font-bold text-slate-900':'text-slate-800'}`}>{amount !== undefined ? fmt(amount, D) : ''}</td>
    </tr>
  );
  const SH = ({ label }) => <tr className="bg-slate-100"><td colSpan={2} className="px-3 py-2 font-bold text-slate-700 text-xs uppercase">{label}</td></tr>;

  return (
    <div>
      <div className="text-center mb-4">
        <h2 className="text-lg font-bold uppercase">{isIFRS ? 'Statement of Cash Flows' : 'Cash Flow Statement'}</h2>
        <p className="text-sm text-slate-500">for the year ended 31st March</p>
        <p className="text-xs text-slate-400">{isIFRS ? 'IAS 7' : method === 'IND_AS' ? 'Ind AS 7' : 'AS 3'}</p>
      </div>
      <div className="flex gap-3 mb-4 justify-center items-center">
        {['indirect','direct'].map(m => (
          <button key={m} onClick={() => onMethodChange(m)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${cfsMethod===m?'bg-indigo-600 text-white border-indigo-600':'bg-white text-slate-600 border-slate-300 hover:border-indigo-400'}`}>
            {m === 'indirect' ? 'Indirect Method' : 'Direct Method'}
          </button>
        ))}
      </div>
      <table className="w-full text-sm border border-slate-300 rounded-lg overflow-hidden">
        <thead><tr className="bg-slate-800 text-white"><th className="text-left px-3 py-3">Particulars</th><th className="text-right px-3 py-3 w-44">Amount ({currSymbol})</th></tr></thead>
        <tbody>
          <SH label="A. Cash Flow from Operating Activities" />
          {cfsMethod === 'indirect' ? <>
            <CRow label="Net Profit / (Loss) Before Tax" amount={pbt} indent />
            <CRow label="Add: Depreciation and Amortisation" amount={depr} indent={2} />
            <CRow label="Add: Finance Costs" amount={finCost} indent={2} />
            <CRow label="Working Capital Changes (Upload prior year TB for details)" amount={0} indent={2} />
          </> : <>
            <CRow label="Cash receipts from customers" amount={totalIncome} indent />
            <CRow label="Cash paid to suppliers and employees" amount={-Math.abs(totalExpense)} indent />
          </>}
          <CRow label="Net Cash from Operating Activities (A)" amount={pbt + depr} bold />
          <SH label="B. Cash Flow from Investing Activities" />
          <CRow label="Purchase of Fixed Assets / Capital Expenditure" amount={0} indent />
          <CRow label="Net Cash from Investing Activities (B)" amount={0} bold />
          <SH label="C. Cash Flow from Financing Activities" />
          <CRow label="Proceeds from / (Repayment of) Borrowings" amount={0} indent />
          <CRow label="Finance Costs Paid" amount={-finCost} indent />
          <CRow label="Net Cash from Financing Activities (C)" amount={-finCost} bold />
          <tr className="border-t-2 border-slate-700 bg-slate-50">
            <td className="px-3 py-3 font-bold text-slate-900 text-sm">Net Change in Cash (A+B+C)</td>
            <td className="px-3 py-3 text-right font-mono font-bold">{fmt(pbt + depr - finCost, D)}</td>
          </tr>
          <CRow label="Cash at Beginning of Year" amount={0} indent />
          <tr className="border-t-2 border-slate-700 bg-indigo-50">
            <td className="px-3 py-3 font-bold text-indigo-900 text-sm">Cash at End of Year (from Balance Sheet)</td>
            <td className="px-3 py-3 text-right font-mono font-bold text-indigo-900">{fmt(cash, D)}</td>
          </tr>
        </tbody>
      </table>
      <p className="text-xs text-slate-400 mt-2 italic">* Upload prior year TB for complete working capital changes and comparative figures.</p>
    </div>
  );
}

// ── OCI ───────────────────────────────────────────────────────────────────────
function OCIStatement({ lines, divisor, currSymbol }) {
  const D = divisor;
  const ociLines = lines.filter(l => l.sheet === 'OCI');
  const total    = ociLines.reduce((s,l)=>s+Number(l.totalFinalNet||0),0);
  return (
    <div>
      <div className="text-center mb-5">
        <h2 className="text-lg font-bold uppercase">Other Comprehensive Income</h2>
        <p className="text-xs text-slate-400 mt-1">All amounts in {currSymbol} · IAS 1 Para 82A</p>
      </div>
      <table className="w-full text-sm border border-slate-300 rounded-lg overflow-hidden">
        <thead><tr className="bg-slate-800 text-white"><th className="text-left px-3 py-3">Particulars</th><th className="text-right px-3 py-3 w-44">Amount ({currSymbol})</th></tr></thead>
        <tbody>
          <tr className="bg-slate-100"><td colSpan={2} className="px-3 py-2 text-xs font-bold text-slate-600 uppercase">A. Items not reclassified to P&L</td></tr>
          {ociLines.filter(l=>['actuarial','remeasurement','defined benefit'].some(k=>l.groupName?.toLowerCase().includes(k))).map((l,i)=>(
            <tr key={i} className="border-b hover:bg-blue-50"><td className="py-2 pl-8">{l.groupName}</td><td className="py-2 pr-3 text-right font-mono">{fmt(l.totalFinalNet,D)}</td></tr>
          ))}
          <tr className="bg-slate-100"><td colSpan={2} className="px-3 py-2 text-xs font-bold text-slate-600 uppercase">B. Items that may be reclassified to P&L</td></tr>
          {ociLines.filter(l=>!['actuarial','remeasurement','defined benefit'].some(k=>l.groupName?.toLowerCase().includes(k))).map((l,i)=>(
            <tr key={i} className="border-b hover:bg-blue-50"><td className="py-2 pl-8">{l.groupName}</td><td className="py-2 pr-3 text-right font-mono">{fmt(l.totalFinalNet,D)}</td></tr>
          ))}
          {ociLines.length === 0 && <tr><td colSpan={2} className="py-8 text-center text-slate-400 italic text-sm">No OCI items mapped. Map OCI items in Mapping page.</td></tr>}
          <tr className="border-t-2 border-slate-600 font-bold bg-slate-50">
            <td className="px-3 py-2.5">Total Other Comprehensive Income</td>
            <td className="px-3 py-2.5 text-right font-mono">{fmt(total,D)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ── SOCE ─────────────────────────────────────────────────────────────────────
function SOCEStatement({ bsLines, plLines, divisor, currSymbol }) {
  const D      = divisor;
  const equity = bsLines.filter(l => l.assetLiability === 'Equity');
  const pat    = plLines.filter(l=>l.assetLiability==='Income').reduce((s,l)=>s+Number(l.totalFinalNet||0),0)
               - plLines.filter(l=>l.assetLiability==='Expenses'&&l.sheet==='PL').reduce((s,l)=>s+Number(l.totalFinalNet||0),0);
  const total  = equity.reduce((s,l)=>s+Number(l.totalFinalNet||0),0);
  return (
    <div>
      <div className="text-center mb-5">
        <h2 className="text-lg font-bold uppercase">Statement of Changes in Equity</h2>
        <p className="text-xs text-slate-400 mt-1">All amounts in {currSymbol} · IAS 1 Para 106</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border border-slate-300 rounded-lg overflow-hidden min-w-max">
          <thead><tr className="bg-slate-800 text-white">
            <th className="text-left px-3 py-3 w-48">Component</th>
            <th className="text-right px-3 py-3 w-36">Opening Balance</th>
            <th className="text-right px-3 py-3 w-36">Profit for Year</th>
            <th className="text-right px-3 py-3 w-36">OCI</th>
            <th className="text-right px-3 py-3 w-36">Dividends</th>
            <th className="text-right px-3 py-3 w-36">Closing Balance</th>
          </tr></thead>
          <tbody>
            {equity.map((l,i)=>(
              <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-2.5 font-medium text-slate-800">{l.groupName}</td>
                <td className="px-3 py-2.5 text-right font-mono text-slate-400">—</td>
                <td className="px-3 py-2.5 text-right font-mono text-slate-400">—</td>
                <td className="px-3 py-2.5 text-right font-mono text-slate-400">—</td>
                <td className="px-3 py-2.5 text-right font-mono text-slate-400">—</td>
                <td className="px-3 py-2.5 text-right font-mono font-semibold">{fmt(l.totalFinalNet,D)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-slate-600 font-bold bg-indigo-50">
              <td className="px-3 py-2.5 text-indigo-900">Total Equity</td>
              <td className="px-3 py-2.5 text-right font-mono text-slate-400">—</td>
              <td className="px-3 py-2.5 text-right font-mono text-indigo-700">{fmt(pat,D)}</td>
              <td className="px-3 py-2.5 text-right font-mono text-slate-400">—</td>
              <td className="px-3 py-2.5 text-right font-mono text-slate-400">—</td>
              <td className="px-3 py-2.5 text-right font-mono text-indigo-900 font-bold">{fmt(total,D)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400 mt-2 italic">* Opening balance requires prior year data. Upload prior year TB for full SOCE.</p>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function FinancialStatements() {
  const { engagementId } = useParams();
  const { currentEngagement, firm } = useStore();
  const [data, setData]             = useState(null);
  const [loading, setLoading]       = useState(true);
  const [generating, setGenerating] = useState(false);
  const [tab, setTab]               = useState('BS');
  const [hidden, setHidden]         = useState({});
  const [unit, setUnit]             = useState(UNITS[0]);
  const [cfsMethod, setCfsMethod]   = useState('indirect');
  const [fsErrors, setFsErrors]     = useState([]);

  const method      = currentEngagement?.method || 'AS';
  const currency    = firm?.currency || (['IFRS','IFRS_SME'].includes(method) ? 'AED' : 'INR');
  const currSymbol  = currency;
  const cfg         = METHOD_CONFIG[method] || METHOD_CONFIG.AS;

  useEffect(() => { load(); }, [engagementId]);

  async function load() {
    setLoading(true);
    try { const res = await fsAPI.get(engagementId); setData(res); }
    catch { setData(null); }
    finally { setLoading(false); }
  }

  async function generate() {
    setGenerating(true);
    try {
      const res = await fsAPI.generate(engagementId);
      const sheets = res.sheets || res;
      setData(sheets);
      if (res.errors?.length > 0) {
        setFsErrors(res.errors);
        toast.error(`Generated with ${res.errors.length} issue(s) — check validation`);
      } else {
        setFsErrors([]);
        toast.success('Financial statements generated successfully');
      }
    } catch (err) { toast.error(err?.error || 'Generation failed'); }
    finally { setGenerating(false); }
  }

  const allLines   = Object.values(data || {}).flat();
  const getLines   = (sheet) => (data?.[sheet] || []).filter(l => !hidden[l.groupName]);
  const toggleHide = (key)   => setHidden(h => ({ ...h, [key]: !h[key] }));
  const hiddenCount = Object.values(hidden).filter(Boolean).length;

  const tabs = cfg.tabs.map(key => ({
    key,
    label: { BS:'Balance Sheet', PL:'P & L', CFS:'Cash Flow', OCI:'OCI', SOCE:'SOCE' }[key] || key,
  }));

  if (loading) return <div className="p-8 text-slate-400">Loading...</div>;

  return (
    <div className="p-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Financial Statements</h1>
          <p className="text-slate-500 text-sm mt-0.5">{method} · {currentEngagement?.financialYear} · {currency}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {hiddenCount > 0 && (
            <button onClick={() => setHidden({})} className="px-3 py-1.5 text-xs border border-amber-400 text-amber-700 rounded-lg hover:bg-amber-50">
              ↩ Restore {hiddenCount} hidden
            </button>
          )}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500">Amounts in:</span>
            <select value={unit.value} onChange={e => setUnit(UNITS.find(u=>u.value===Number(e.target.value)))}
              className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400">
              {UNITS.map(u => <option key={u.value} value={u.value}>{currency} {u.label}</option>)}
            </select>
          </div>
          <button onClick={generate} disabled={generating}
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {generating ? '⏳ Generating...' : '⚡ Generate / Refresh'}
          </button>
        </div>
      </div>

      {/* Validation errors */}
      {fsErrors.length > 0 && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-sm font-semibold text-red-700 mb-2">⚠ Validation Issues Found:</p>
          {fsErrors.map((e,i) => <p key={i} className="text-xs text-red-600">{e.message}</p>)}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-0 mb-6 border-b border-slate-200 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors -mb-px ${tab===t.key?'border-indigo-600 text-indigo-600':'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {!data || Object.keys(data).length === 0 ? (
        <div className="text-center py-20 bg-white border border-slate-200 rounded-xl text-slate-400">
          <div className="text-5xl mb-4">📋</div>
          <p className="font-medium text-slate-600">No financial statements yet.</p>
          <p className="text-sm mt-1">Complete TB upload → Mapping → click Generate.</p>
          <button onClick={generate} disabled={generating} className="mt-5 px-5 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700">
            {generating ? 'Generating...' : '⚡ Generate Now'}
          </button>
        </div>
      ) : (
        <>
          {tab==='BS'   && <BSStatement   lines={allLines.filter(l=>l.sheet==='BS')} method={method} hidden={hidden} onHide={toggleHide} divisor={unit.value} currSymbol={currSymbol} />}
          {tab==='PL'   && <PLStatement   lines={allLines} method={method} divisor={unit.value} currSymbol={currSymbol} />}
          {tab==='CFS'  && <CFSStatement  bsLines={allLines.filter(l=>l.sheet==='BS')} plLines={allLines} method={method} cfsMethod={cfsMethod} onMethodChange={setCfsMethod} divisor={unit.value} currSymbol={currSymbol} />}
          {tab==='OCI'  && <OCIStatement  lines={allLines} divisor={unit.value} currSymbol={currSymbol} />}
          {tab==='SOCE' && <SOCEStatement bsLines={allLines.filter(l=>l.sheet==='BS')} plLines={allLines} divisor={unit.value} currSymbol={currSymbol} />}
        </>
      )}
    </div>
  );
}
