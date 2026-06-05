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
  { label: 'Millions',  value: 1000000  },
  { label: 'Crores',    value: 10000000 },
];
 
const METHOD_CONFIG = {
  AS:       { bsTitle: 'Balance Sheet',                     plTitle: 'Statement of Profit and Loss',      tabs: ['BS','PL','CFS'],             standard: 'Companies Act 2013 — Schedule III',   hasOCI: false },
  IND_AS:   { bsTitle: 'Balance Sheet',                     plTitle: 'Statement of Profit and Loss',      tabs: ['BS','PL','OCI','CFS','SOCE'], standard: 'Ind AS — Schedule III Division II',   hasOCI: true  },
  IFRS:     { bsTitle: 'Statement of Financial Position',   plTitle: 'Statement of Comprehensive Income', tabs: ['BS','PL','OCI','CFS','SOCE'], standard: 'IFRS — IAS 1',                       hasOCI: true  },
  IFRS_SME: { bsTitle: 'Statement of Financial Position',   plTitle: 'Statement of Comprehensive Income', tabs: ['BS','PL','CFS','SOCE'],       standard: 'IFRS for SMEs — Section 3',          hasOCI: false },
};
 
// locale: 'en-IN' for India (1,00,000 format), 'en-US' for UAE (1,000,000 format)
function fmt(n, divisor = 1, locale = 'en-IN') {
  const num = Number(n || 0) / divisor;
  const abs = Math.abs(num);
  const s   = Math.round(abs).toLocaleString(locale);
  return num < 0 ? `(${s})` : s;
}
 
// ── Table Row — now with PY column ───────────────────────────────────────────
function Row({ label, note, amount, pyAmount, hasPY, bold, indent, section, subheader, borderTop, divisor, locale, onHide, hideable }) {
  const [hovered, setHovered] = useState(false);
 
  if (section) return (
    <tr className="bg-slate-100">
      <td colSpan={hasPY ? 5 : 4} className="px-3 py-2 font-bold text-slate-700 uppercase text-xs tracking-wide">{label}</td>
    </tr>
  );
  if (subheader) return (
    <tr className="bg-slate-50">
      <td colSpan={hasPY ? 5 : 4} className="px-3 py-1.5 font-semibold text-slate-600 text-xs">{label}</td>
    </tr>
  );
 
  return (
    <tr className={`${borderTop ? 'border-t-2 border-slate-600' : ''} ${bold ? 'bg-slate-50' : 'border-b border-slate-100 hover:bg-blue-50'} transition-colors`}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <td className={`py-2.5 pr-4 text-sm ${indent===2?'pl-10':indent?'pl-6':'pl-3'} ${bold?'font-bold text-slate-900':'text-slate-700'}`}>{label}</td>
      <td className="py-2.5 px-2 text-center w-16 text-sm">{note && <span className="text-indigo-600 font-semibold">{note}</span>}</td>
      <td className={`py-2.5 px-3 text-right font-mono text-sm w-44 ${bold?'font-bold text-slate-900':'text-slate-800'}`}>
        {amount !== undefined && amount !== null ? fmt(amount, divisor, locale) : '—'}
      </td>
      {hasPY && (
        <td className={`py-2.5 px-3 text-right font-mono text-sm w-44 text-slate-400 ${bold?'font-semibold':''}` }>
          {pyAmount !== undefined && pyAmount !== null ? fmt(pyAmount, divisor, locale) : '—'}
        </td>
      )}
      <td className="py-2.5 px-2 w-20 text-center">
        {hideable && hovered && onHide && (
          <button onClick={onHide} className="px-1.5 py-0.5 text-xs bg-red-100 text-red-600 rounded hover:bg-red-200">👁 Hide</button>
        )}
      </td>
    </tr>
  );
}
 
// Header row for tables — shows CY and PY year labels
function TableHeader({ hasPY, cyYear, pyYear, cyDate, pyDate, currSymbol, extraCols = 1 }) {
  return (
    <tr className="bg-slate-800 text-white">
      <th className="text-left px-3 py-3 font-semibold">Particulars</th>
      <th className="text-center px-2 py-3 font-semibold w-16">Note</th>
      <th className="text-right px-3 py-3 font-semibold w-44">
        {cyYear || 'Current Year'}
        {cyDate && <div className="text-xs font-normal text-slate-300">{cyDate}</div>}
        <div className="text-xs font-normal text-slate-400">({currSymbol})</div>
      </th>
      {hasPY && (
        <th className="text-right px-3 py-3 font-semibold w-44 text-slate-300">
          {pyYear || 'Previous Year'}
          {pyDate && <div className="text-xs font-normal text-slate-400">{pyDate}</div>}
          <div className="text-xs font-normal text-slate-500">({currSymbol})</div>
        </th>
      )}
      {Array.from({ length: extraCols }).map((_, i) => <th key={i} className="w-20"></th>)}
    </tr>
  );
}
 
// ── Balance Sheet ─────────────────────────────────────────────────────────────
function BSStatement({ lines, method, hidden, onHide, divisor, currSymbol, hasPY, cyYear, pyYear, cyDate, pyDate, locale = 'en-IN' }) {
  const cfg    = METHOD_CONFIG[method] || METHOD_CONFIG.AS;
  const D      = divisor;
  const isIFRS = method === 'IFRS' || method === 'IFRS_SME';
 
  const vis    = lines.filter(l => !hidden[l.groupName]);
  const eq     = vis.filter(l => l.assetLiability === 'Equity');
  const liab   = vis.filter(l => l.assetLiability === 'Liabilities');
  const assets = vis.filter(l => l.assetLiability === 'Assets');
 
  const isShortTerm = n => n.includes('short term') || n.includes('short-term');
  const isLongTerm  = n => (n.includes('long term') || n.includes('long-term')) && !isShortTerm(n);
 
  const NCA_KEYWORDS = [
    'property, plant','property plant','plant and equipment','plant & equipment',
    'fixed asset','tangible asset','ppe','freehold','leasehold improvement',
    'land','building','furniture','fixture','vehicle','motor car','motor vehicle',
    'plant and machinery','machinery','equipment','computer','office equipment',
    'electrical installation','air condition',
    'right-of-use','right of use','rou asset','lease right',
    'intangible','goodwill','software','trademark','patent','brand','copyright',
    'customer relationship','license','franchise',
    'capital work in progress','capital wip','cwip','capital work-in-progress',
    'construction in progress','asset under construction',
    'non-current investment','non current investment',
    'long term investment','long-term investment',
    'investment in subsidiary','investment in associate',
    'investment in joint venture','investment in partnership',
    'investment in equity','quoted investment','unquoted investment',
    'investment in mutual fund','investment in bond','investment in debenture',
    'investment in preference share','investment in share',
    'investment in llp','investment in trust',
    'deferred tax asset',
    'security deposit','earnest money','retention money',
    'capital advance','advance for capital','advance against capital',
    'other non-current asset','other non current asset',
    'non-current asset','non current asset',
    'long term loans and advance','long-term loans and advance',
    'long term loan and advance','long-term loan and advance',
  ];
 
  const CA_KEYWORDS = [
    'inventor','stock','raw material','work in progress','work-in-progress','wip stock',
    'finished good','packing material','stores and spare','consumable','merchandise',
    'trade receivable','trade and other receivable','account receivable',
    'sundry debtor','debtor','bill receivable','note receivable',
    'cash in hand','cash in bank','cash at bank','cash and bank','cash and cash equivalent',
    'bank balance','petty cash','cheque in hand','demand deposit',
    'current investment','short term investment','short-term investment',
    'liquid fund','treasury bill','commercial paper',
    'short term loans and advance','short-term loans and advance',
    'short term loan and advance','short-term loan and advance',
    'loans and advance','loan and advance',
    'advance to supplier','advance to vendor','advance paid','advance given',
    'advance to employee','advance to staff','prepaid expense','prepayment',
    'other receivable','other current asset','other asset',
    'accrued income','income receivable','interest receivable','dividend receivable',
    'due from','receivable from',
    'vat receivable','gst receivable','input tax credit','input gst',
    'income tax receivable','tax refund receivable','advance tax','tds receivable',
    'provision for bad debt','provision for doubtful debt',
    'export incentive receivable','subsidy receivable',
  ];
 
  const ncAssets    = assets.filter(l => { const n=l.groupName?.toLowerCase()||''; if(isShortTerm(n)) return false; if(isLongTerm(n)) return true; if(NCA_KEYWORDS.some(k=>n.includes(k))) return true; if(n.includes('investment')&&!n.includes('current invest')&&!n.includes('short term invest')&&!n.includes('short-term invest')&&!isShortTerm(n)) return true; return false; });
  const cAssets     = assets.filter(l => { const n=l.groupName?.toLowerCase()||''; if(isShortTerm(n)) return true; if(isLongTerm(n)) return false; if(NCA_KEYWORDS.some(k=>n.includes(k))) return false; if(n.includes('investment')&&!n.includes('current invest')&&!n.includes('short term invest')&&!n.includes('short-term invest')&&!isShortTerm(n)) return false; return CA_KEYWORDS.some(k=>n.includes(k)); });
  const otherAssets = assets.filter(l => { const n=l.groupName?.toLowerCase()||''; if(isShortTerm(n)) return false; if(isLongTerm(n)) return false; if(NCA_KEYWORDS.some(k=>n.includes(k))) return false; if(CA_KEYWORDS.some(k=>n.includes(k))) return false; if(n.includes('investment')&&!n.includes('current invest')&&!isShortTerm(n)) return false; return true; });
 
  const NCL_KEYWORDS = ['long term borrowing','long-term borrowing','non-current borrowing','term loan','debenture','bond','note payable long','loan from bank','loan from financial institution','loan from nbfc','foreign currency loan','ecb','external commercial borrowing','lease liabilit','finance lease','right-of-use liab','provision for gratuity','gratuity liabilit','pension liabilit','post employment benefit','defined benefit','employee benefit liabilit','compensated absence','leave encashment liabilit','deferred tax liabilit','deferred tax liab','other non-current liabilit','other long term liabilit','non-current liabilit','security deposit received','deferred revenue long','deferred income long','loan from related party long','loan from director long'];
  const CL_KEYWORDS  = ['trade payable','trade and other payable','account payable','sundry creditor','creditor','bill payable','note payable','short term borrowing','short-term borrowing','working capital loan','cash credit','bank overdraft','overdraft','packing credit','loan repayable','current maturit','installment due','other payable','other current liabilit','accrued expense','accrual','statutory due','statutory liabilit','advance from customer','advance received','customer deposit','deferred revenue','deferred income','unclaimed dividend','unpaid dividend','dividend payable','vat payable','gst payable','tax payable','income tax payable','tds payable','service tax payable','duties and tax','provision for tax','provision for income tax','salary payable','wages payable','employee payable','pf payable','esic payable','pt payable','directors loan','director loan','due to director','loan from shareholder','shareholder loan','due to related','due to subsidiary','due to associate','short term provision','provision for expense','provision for audit','provision for warranty','proposed dividend'];
 
  const ncLiab    = liab.filter(l=>{ const n=l.groupName?.toLowerCase()||''; if(isShortTerm(n)) return false; if(isLongTerm(n)) return true; return NCL_KEYWORDS.some(k=>n.includes(k)); });
  const cLiab     = liab.filter(l=>{ const n=l.groupName?.toLowerCase()||''; if(isShortTerm(n)) return true; if(isLongTerm(n)) return false; if(NCL_KEYWORDS.some(k=>n.includes(k))) return false; return CL_KEYWORDS.some(k=>n.includes(k)); });
  const otherLiab = liab.filter(l=>{ const n=l.groupName?.toLowerCase()||''; if(isShortTerm(n)) return false; if(isLongTerm(n)) return false; if(NCL_KEYWORDS.some(k=>n.includes(k))) return false; if(CL_KEYWORDS.some(k=>n.includes(k))) return false; return true; });
 
  const sumCY = arr => arr.reduce((s,l)=>s+Number(l.totalFinalNet||0),0);
  const sumPY = arr => arr.reduce((s,l)=>s+Number(l.pyAmount||0),0);
 
  const totalNCA    = [...ncAssets,...otherAssets].reduce((s,l)=>s+Number(l.totalFinalNet||0),0);
  const totalCA     = cAssets.reduce((s,l)=>s+Number(l.totalFinalNet||0),0);
  const totalAssets = totalNCA + totalCA;
  const totalEq     = eq.reduce((s,l)=>s+Number(l.totalFinalNet||0),0);
  const totalNCL    = ncLiab.reduce((s,l)=>s+Number(l.totalFinalNet||0),0);
  const totalCL     = [...cLiab,...otherLiab].reduce((s,l)=>s+Number(l.totalFinalNet||0),0);
  const totalLiab   = totalNCL + totalCL;
  const totalEqLiab = totalEq + totalLiab;
 
  const pyTotalNCA    = hasPY ? [...ncAssets,...otherAssets].reduce((s,l)=>s+Number(l.pyAmount||0),0) : null;
  const pyTotalCA     = hasPY ? cAssets.reduce((s,l)=>s+Number(l.pyAmount||0),0) : null;
  const pyTotalAssets = hasPY ? (pyTotalNCA + pyTotalCA) : null;
  const pyTotalEq     = hasPY ? eq.reduce((s,l)=>s+Number(l.pyAmount||0),0) : null;
  const pyTotalNCL    = hasPY ? ncLiab.reduce((s,l)=>s+Number(l.pyAmount||0),0) : null;
  const pyTotalCL     = hasPY ? [...cLiab,...otherLiab].reduce((s,l)=>s+Number(l.pyAmount||0),0) : null;
  const pyTotalLiab   = hasPY ? (pyTotalNCL + pyTotalCL) : null;
  const pyTotalEqLiab = hasPY ? (pyTotalEq + pyTotalLiab) : null;
 
  const diff = totalAssets - totalEqLiab;
 
  const R = ({ label, note, amount, pyAmt, bold, indent, section, subheader, borderTop, hideable, hideKey }) => (
    <Row label={label} note={note} amount={amount} pyAmount={pyAmt} hasPY={hasPY}
      bold={bold} indent={indent} section={section} subheader={subheader}
      borderTop={borderTop} divisor={D} locale={locale} hideable={hideable}
      onHide={hideKey ? () => onHide(hideKey) : undefined} />
  );
 
  const Lines = ({ arr }) => arr.map((l,i) => (
    <R key={i} label={l.groupName} note={l.noteGroup?.noteNumber}
      amount={Number(l.totalFinalNet)} pyAmt={hasPY ? Number(l.pyAmount??0) : null}
      indent={2} hideable hideKey={l.groupName} />
  ));
 
  const renderIFRS = () => (<>
    <R label="ASSETS" section />
    <R label="Non-Current Assets" subheader />
    <Lines arr={[...ncAssets,...otherAssets]} />
    <R label="Total Non-Current Assets" amount={totalNCA} pyAmt={pyTotalNCA} bold borderTop />
    <R label="Current Assets" subheader />
    <Lines arr={cAssets} />
    <R label="Total Current Assets" amount={totalCA} pyAmt={pyTotalCA} bold borderTop />
    <R label="TOTAL ASSETS" amount={totalAssets} pyAmt={pyTotalAssets} bold borderTop />
    <R label="EQUITY AND LIABILITIES" section />
    <R label="Equity" subheader />
    <Lines arr={eq} />
    <R label="Total Equity" amount={totalEq} pyAmt={pyTotalEq} bold borderTop />
    {ncLiab.length > 0 && <>
      <R label="Non-Current Liabilities" subheader />
      <Lines arr={ncLiab} />
      <R label="Total Non-Current Liabilities" amount={totalNCL} pyAmt={pyTotalNCL} bold borderTop />
    </>}
    <R label="Current Liabilities" subheader />
    <Lines arr={[...cLiab,...otherLiab]} />
    <R label="Total Current Liabilities" amount={totalCL} pyAmt={pyTotalCL} bold borderTop />
    <R label="TOTAL EQUITY AND LIABILITIES" amount={totalEqLiab} pyAmt={pyTotalEqLiab} bold borderTop />
  </>);
 
  const renderIndian = () => (<>
    <R label="I. EQUITY AND LIABILITIES" section />
    <R label="(1) Shareholders' Funds / Equity" subheader />
    <Lines arr={eq} />
    <R label="Total Equity" amount={totalEq} pyAmt={pyTotalEq} bold borderTop />
    {ncLiab.length > 0 && <>
      <R label="(2) Non-Current Liabilities" subheader />
      <Lines arr={ncLiab} />
      <R label="Total Non-Current Liabilities" amount={totalNCL} pyAmt={pyTotalNCL} bold borderTop />
    </>}
    <R label={`(${ncLiab.length>0?'3':'2'}) Current Liabilities`} subheader />
    <Lines arr={[...cLiab,...otherLiab]} />
    <R label="Total Current Liabilities" amount={totalCL} pyAmt={pyTotalCL} bold borderTop />
    <R label="TOTAL — EQUITY AND LIABILITIES" amount={totalEqLiab} pyAmt={pyTotalEqLiab} bold borderTop />
    <R label="II. ASSETS" section />
    <R label="(1) Non-Current Assets" subheader />
    <Lines arr={[...ncAssets,...otherAssets]} />
    <R label="Total Non-Current Assets" amount={totalNCA} pyAmt={pyTotalNCA} bold borderTop />
    <R label="(2) Current Assets" subheader />
    <Lines arr={cAssets} />
    <R label="Total Current Assets" amount={totalCA} pyAmt={pyTotalCA} bold borderTop />
    <R label="TOTAL — ASSETS" amount={totalAssets} pyAmt={pyTotalAssets} bold borderTop />
  </>);
 
  return (
    <div>
      <div className="text-center mb-5">
        <h2 className="text-lg font-bold uppercase tracking-wide">{cfg.bsTitle}</h2>
        <p className="text-sm text-slate-500">as at {cyDate}</p>
        <p className="text-xs text-slate-400 mt-0.5">{currSymbol === 'INR' ? 'All amounts in ₹' : `All amounts in ${currSymbol}`}</p>
        <p className="text-xs text-slate-400">{cfg.standard}</p>
      </div>
      <table className="w-full text-sm border border-slate-300 rounded-lg overflow-hidden">
        <thead><TableHeader hasPY={hasPY} cyYear={cyYear} pyYear={pyYear} cyDate={cyDate} pyDate={pyDate} currSymbol={currSymbol} /></thead>
        <tbody>{isIFRS ? renderIFRS() : renderIndian()}</tbody>
      </table>
      <div className={`mt-3 p-3 rounded-xl text-sm font-semibold text-right ${Math.abs(diff)<1?'bg-green-50 text-green-700 border border-green-200':'bg-red-50 text-red-700 border border-red-200'}`}>
        {Math.abs(diff)<1
          ? '✓ Balance Sheet tallies — Assets = Equity + Liabilities'
          : <>⚠ Difference: {fmt(Math.abs(diff),D,locale)} — Balance Sheet does not balance<div className="text-xs font-normal mt-1">Assets: {fmt(totalAssets,D,locale)} | Equity: {fmt(totalEq,D,locale)} | Liabilities: {fmt(totalLiab,D,locale)}</div></>}
      </div>
    </div>
  );
}
 
// ── Profit & Loss ─────────────────────────────────────────────────────────────
function PLStatement({ lines, method, divisor, currSymbol, hasPY, cyYear, pyYear, cyDate, pyDate, locale = 'en-IN' }) {
  const cfg    = METHOD_CONFIG[method] || METHOD_CONFIG.AS;
  const D      = divisor;
  const isIFRS = method === 'IFRS' || method === 'IFRS_SME';
 
  const plLines  = lines.filter(l => l.sheet === 'PL');
  const ociLines = lines.filter(l => l.sheet === 'OCI');
 
  const isIncome  = l => l.assetLiability === 'Income';
  const isExpense = l => l.assetLiability === 'Expenses';
 
  const revenueLines     = plLines.filter(l => isIncome(l) && ['revenue from operations','revenue from contracts','revenue','turnover','sales'].some(k=>l.groupName?.toLowerCase().includes(k)));
  const otherIncomeLines = plLines.filter(l => isIncome(l) && !['revenue from operations','revenue from contracts','revenue','turnover','sales'].some(k=>l.groupName?.toLowerCase().includes(k)));
  const cosLines         = plLines.filter(l => isExpense(l) && (() => { const n=l.groupName?.toLowerCase()||''; return n.includes('cost of sale')||n.includes('cost of good')||n.includes('cost of material')||n.includes('cost of revenue')||n.includes('cost of service')||n.includes('direct cost')||n.includes('purchase of stock')||n.includes('changes in inventor')||n.includes('material consumed')||n.includes('subcontract')||n.includes('job work')||n.includes('labour cost')||n.includes('labor cost')||n==='purchases'||n==='purchase'; })());
  const finCostLines     = plLines.filter(l => isExpense(l) && ['finance cost','interest expense','bank charge','bank interest','borrowing cost'].some(k=>l.groupName?.toLowerCase().includes(k)));
  const deprLines        = plLines.filter(l => isExpense(l) && ['depreciation','amortis','amortiz'].some(k=>l.groupName?.toLowerCase().includes(k)));
  const taxLines         = plLines.filter(l => isExpense(l) && ['tax expense','income tax expense','current tax','deferred tax expense'].some(k=>l.groupName?.toLowerCase().includes(k)));
  const sellingLines     = plLines.filter(l => isExpense(l) && ['selling','distribution','marketing','advertising'].some(k=>l.groupName?.toLowerCase().includes(k)) && !taxLines.includes(l) && !finCostLines.includes(l) && !cosLines.includes(l));
  const adminLines       = plLines.filter(l => isExpense(l) && !cosLines.includes(l) && !finCostLines.includes(l) && !deprLines.includes(l) && !taxLines.includes(l) && !sellingLines.includes(l));
 
  const sum   = arr => arr.reduce((s,l)=>s+Number(l.totalFinalNet||0),0);
  const sumPY = arr => hasPY ? arr.reduce((s,l)=>s+Number(l.pyAmount||0),0) : null;
 
  const totalRevenue     = sum(revenueLines);
  const totalOtherIncome = sum(otherIncomeLines);
  const totalCOS         = sum(cosLines);
  const grossProfit      = totalRevenue - totalCOS;
  const totalSelling     = sum(sellingLines);
  const totalAdmin       = sum(adminLines);
  const totalDepr        = sum(deprLines);
  const totalOpex        = totalSelling + totalAdmin + totalDepr;
  const operatingProfit  = grossProfit + totalOtherIncome - totalOpex;
  const totalFinCost     = sum(finCostLines);
  const pbt              = operatingProfit - totalFinCost;
  const totalTax         = sum(taxLines);
  const pat              = pbt - totalTax;
  const ociTotal         = sum(ociLines);
  const totalCI          = pat + ociTotal;
 
  const pyRevenue     = sumPY(revenueLines);
  const pyOtherIncome = sumPY(otherIncomeLines);
  const pyCOS         = sumPY(cosLines);
  const pyGross       = hasPY ? (pyRevenue - pyCOS) : null;
  const pySelling     = sumPY(sellingLines);
  const pyAdmin       = sumPY(adminLines);
  const pyDepr        = sumPY(deprLines);
  const pyOpex        = hasPY ? (pySelling + pyAdmin + pyDepr) : null;
  const pyOpProfit    = hasPY ? (pyGross + pyOtherIncome - pyOpex) : null;
  const pyFinCost     = sumPY(finCostLines);
  const pyPBT         = hasPY ? (pyOpProfit - pyFinCost) : null;
  const pyTax         = sumPY(taxLines);
  const pyPAT         = hasPY ? (pyPBT - pyTax) : null;
  const pyOCI         = sumPY(ociLines);
  const pyCI          = hasPY ? (pyPAT + pyOCI) : null;
 
  const Blank = () => <tr><td colSpan={hasPY ? 5 : 4} className="py-1.5 border-0"></td></tr>;
  const R = ({label, note, amount, pyAmt, bold, indent, section, subheader, borderTop}) => (
    <Row label={label} note={note} amount={amount} pyAmount={pyAmt} hasPY={hasPY}
      bold={bold} indent={indent} section={section} subheader={subheader} borderTop={borderTop} divisor={D} locale={locale} />
  );
  const Lines = ({arr}) => arr.map((l,i)=>(
    <R key={i} label={l.groupName} note={l.noteGroup?.noteNumber}
      amount={Number(l.totalFinalNet)} pyAmt={hasPY?Number(l.pyAmount??0):null} indent={2} />
  ));
 
  return (
    <div>
      <div className="text-center mb-5">
        <h2 className="text-lg font-bold uppercase tracking-wide">{cfg.plTitle}</h2>
        <p className="text-sm text-slate-500">for the year ended {cyDate}</p>
        <p className="text-xs text-slate-400 mt-0.5">{currSymbol==='INR'?'All amounts in ₹':`All amounts in ${currSymbol}`}</p>
        <p className="text-xs text-slate-400">{cfg.standard}</p>
      </div>
      <table className="w-full text-sm border border-slate-300 rounded-lg overflow-hidden">
        <thead><TableHeader hasPY={hasPY} cyYear={cyYear} pyYear={pyYear} cyDate={cyDate} pyDate={pyDate} currSymbol={currSymbol} /></thead>
        <tbody>
          <R label="REVENUE" section />
          <Lines arr={revenueLines} />
          <R label="Total Revenue" amount={totalRevenue} pyAmt={pyRevenue} bold borderTop /><Blank/>
          {cosLines.length>0 && <>
            <R label="Cost of Sales" subheader />
            <Lines arr={cosLines} />
            <R label="Total Cost of Sales" amount={totalCOS} pyAmt={pyCOS} bold borderTop /><Blank/>
          </>}
          {cosLines.length>0 && <><R label="GROSS PROFIT / (LOSS)" amount={grossProfit} pyAmt={pyGross} bold borderTop /><Blank/></>}
          {isIFRS && <>
            <R label="Other Income" subheader />
            {otherIncomeLines.length>0 ? <Lines arr={otherIncomeLines}/> : <R label="Other Income" amount={0} pyAmt={hasPY?0:null} indent={2}/>}
            <Blank/>
          </>}
          {!isIFRS && otherIncomeLines.length>0 && <>
            <R label="II. OTHER INCOME" subheader />
            <Lines arr={otherIncomeLines} />
            <R label="Total Income" amount={totalRevenue+totalOtherIncome} pyAmt={hasPY?(pyRevenue+pyOtherIncome):null} bold borderTop /><Blank/>
          </>}
          <R label="OPERATING EXPENSES" section />
          {sellingLines.length>0 && <><R label="Distribution / Selling Expenses" subheader /><Lines arr={sellingLines}/></>}
          {adminLines.length>0   && <><R label="Administrative Expenses" subheader /><Lines arr={adminLines}/></>}
          {deprLines.length>0    && <><R label="Depreciation and Amortisation" subheader /><Lines arr={deprLines}/></>}
          <R label="Total Operating Expenses" amount={totalOpex} pyAmt={pyOpex} bold borderTop /><Blank/>
          <R label="OPERATING PROFIT / (LOSS)" amount={operatingProfit} pyAmt={pyOpProfit} bold borderTop /><Blank/>
          <R label="Finance Costs" subheader />
          {finCostLines.length>0 ? <Lines arr={finCostLines}/> : <R label="Finance Costs" amount={0} pyAmt={hasPY?0:null} indent={2}/>}
          <Blank/>
          <R label="PROFIT / (LOSS) BEFORE TAX" amount={pbt} pyAmt={pyPBT} bold borderTop /><Blank/>
          <R label="Tax Expense" subheader />
          {taxLines.length>0 ? <Lines arr={taxLines}/> : <R label="Income Tax Expense" amount={0} pyAmt={hasPY?0:null} indent={2}/>}
          <Blank/>
          <R label="PROFIT / (LOSS) FOR THE YEAR" amount={pat} pyAmt={pyPAT} bold borderTop />
          {cfg.hasOCI && <>
            <Blank/>
            <R label="OTHER COMPREHENSIVE INCOME" section />
            <R label="Items not reclassified to profit or loss" subheader />
            {ociLines.filter(l=>['actuarial','remeasurement','defined benefit'].some(k=>l.groupName?.toLowerCase().includes(k))).map((l,i)=>(
              <R key={i} label={l.groupName} note={l.noteGroup?.noteNumber} amount={Number(l.totalFinalNet)} pyAmt={hasPY?Number(l.pyAmount??0):null} indent={2}/>
            ))}
            <R label="Items that may be reclassified to profit or loss" subheader />
            {ociLines.filter(l=>!['actuarial','remeasurement','defined benefit'].some(k=>l.groupName?.toLowerCase().includes(k))).map((l,i)=>(
              <R key={i} label={l.groupName} note={l.noteGroup?.noteNumber} amount={Number(l.totalFinalNet)} pyAmt={hasPY?Number(l.pyAmount??0):null} indent={2}/>
            ))}
            {ociLines.length===0 && <tr><td colSpan={hasPY?5:4} className="px-10 py-1.5 text-xs text-slate-400 italic">No OCI items — map to OCI sheet in Mapping page if applicable</td></tr>}
            <R label="Total Other Comprehensive Income / (Loss)" amount={ociTotal} pyAmt={pyOCI} bold borderTop /><Blank/>
            <R label="TOTAL COMPREHENSIVE INCOME FOR THE YEAR" amount={totalCI} pyAmt={pyCI} bold borderTop />
          </>}
          <Blank/>
          <R label="Earnings Per Share (Face Value — see Note)" bold borderTop />
          <R label="Basic EPS" amount={null} indent={2} />
          <R label="Diluted EPS" amount={null} indent={2} />
        </tbody>
      </table>
      <div className="mt-4 grid grid-cols-4 gap-3">
        {[
          { label:'Gross Profit',      cy:grossProfit,     py:pyGross,    color:'bg-blue-50 border-blue-200 text-blue-800' },
          { label:'Operating Profit',  cy:operatingProfit, py:pyOpProfit, color:'bg-indigo-50 border-indigo-200 text-indigo-800' },
          { label:'Profit Before Tax', cy:pbt,             py:pyPBT,      color:'bg-amber-50 border-amber-200 text-amber-800' },
          { label:'Profit After Tax',  cy:pat,             py:pyPAT,      color:pat>=0?'bg-green-50 border-green-200 text-green-800':'bg-red-50 border-red-200 text-red-800' },
        ].map(s=>(
          <div key={s.label} className={`border rounded-xl p-3 ${s.color}`}>
            <div className="text-xs font-medium opacity-70">{s.label}</div>
            <div className="text-base font-bold font-mono mt-1">{fmt(s.cy,D,locale)}</div>
            {hasPY && s.py !== null && <div className="text-xs font-mono opacity-60 mt-0.5">PY: {fmt(s.py,D,locale)}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
 
// ── CFS ───────────────────────────────────────────────────────────────────────
function CFSStatement({ bsLines, plLines, method, cfsMethod, onMethodChange, divisor, currSymbol, hasPY, pyBsLines, pyPlLines, cyDate, pyDate, locale = 'en-IN' }) {
  const D          = divisor;
  const incomeLines  = plLines.filter(l=>l.assetLiability==='Income');
  const expenseLines = plLines.filter(l=>l.assetLiability==='Expenses'&&l.sheet==='PL');
  const totalIncome  = incomeLines.reduce((s,l)=>s+Number(l.totalFinalNet||0),0);
  const totalExpense = expenseLines.reduce((s,l)=>s+Number(l.totalFinalNet||0),0);
  const pbt          = totalIncome - totalExpense;
  const cash         = bsLines.filter(l=>['cash','bank'].some(k=>l.groupName?.toLowerCase().includes(k))).reduce((s,l)=>s+Number(l.totalFinalNet||0),0);
  const depr         = expenseLines.filter(l=>['depreciation','amortis'].some(k=>l.groupName?.toLowerCase().includes(k))).reduce((s,l)=>s+Number(l.totalFinalNet||0),0);
  const finCost      = expenseLines.filter(l=>['finance cost','interest expense','bank charge'].some(k=>l.groupName?.toLowerCase().includes(k))).reduce((s,l)=>s+Number(l.totalFinalNet||0),0);
  const isIFRS       = method==='IFRS'||method==='IFRS_SME';
 
  // PY cash = opening cash for CFS (prior year closing = current year opening)
  const pyIncome  = hasPY ? incomeLines.reduce((s,l)=>s+Number(l.pyAmount||0),0) : null;
  const pyExpense = hasPY ? expenseLines.reduce((s,l)=>s+Number(l.pyAmount||0),0) : null;
  const pyPBT     = hasPY ? (pyIncome - pyExpense) : null;
  const openingCash = hasPY
    ? bsLines.filter(l=>['cash','bank'].some(k=>l.groupName?.toLowerCase().includes(k))).reduce((s,l)=>s+Number(l.pyAmount||0),0)
    : 0;
  const pyDepr    = hasPY ? expenseLines.filter(l=>['depreciation','amortis'].some(k=>l.groupName?.toLowerCase().includes(k))).reduce((s,l)=>s+Number(l.pyAmount||0),0) : null;
  const pyFinCost = hasPY ? expenseLines.filter(l=>['finance cost','interest expense','bank charge'].some(k=>l.groupName?.toLowerCase().includes(k))).reduce((s,l)=>s+Number(l.pyAmount||0),0) : null;
 
  const CRow = ({label, amount, bold, indent}) => (
    <tr className={`${bold?'border-t-2 border-slate-500 bg-slate-50 font-bold':'border-b border-slate-100 hover:bg-blue-50'}`}>
      <td className={`py-2 text-sm ${indent===2?'pl-10':indent?'pl-6':'pl-3'} ${bold?'font-bold text-slate-900':'text-slate-700'}`}>{label}</td>
      <td className={`py-2 pr-3 text-right font-mono text-sm ${bold?'font-bold text-slate-900':'text-slate-800'}`}>{amount!==undefined?fmt(amount,D,locale):''}</td>
    </tr>
  );
  const SH = ({label}) => <tr className="bg-slate-100"><td colSpan={2} className="px-3 py-2 font-bold text-slate-700 text-xs uppercase">{label}</td></tr>;
 
  return (
    <div>
      <div className="text-center mb-4">
        <h2 className="text-lg font-bold uppercase">{isIFRS?'Statement of Cash Flows':'Cash Flow Statement'}</h2>
        <p className="text-sm text-slate-500">for the year ended {cyDate}</p>
        <p className="text-xs text-slate-400">{isIFRS?'IAS 7':method==='IND_AS'?'Ind AS 7':'AS 3'}</p>
        {hasPY && <p className="text-xs text-emerald-600 mt-1">✓ Opening cash from prior year TB</p>}
      </div>
      <div className="flex gap-3 mb-4 justify-center items-center">
        {['indirect','direct'].map(m=>(
          <button key={m} onClick={()=>onMethodChange(m)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${cfsMethod===m?'bg-indigo-600 text-white border-indigo-600':'bg-white text-slate-600 border-slate-300 hover:border-indigo-400'}`}>
            {m==='indirect'?'Indirect Method':'Direct Method'}
          </button>
        ))}
      </div>
      <table className="w-full text-sm border border-slate-300 rounded-lg overflow-hidden">
        <thead><tr className="bg-slate-800 text-white"><th className="text-left px-3 py-3">Particulars</th><th className="text-right px-3 py-3 w-44">Amount ({currSymbol})</th></tr></thead>
        <tbody>
          <SH label="A. Cash Flow from Operating Activities" />
          {cfsMethod==='indirect'?<>
            <CRow label="Net Profit / (Loss) Before Tax" amount={pbt} indent />
            <CRow label="Add: Depreciation and Amortisation" amount={depr} indent={2} />
            <CRow label="Add: Finance Costs" amount={finCost} indent={2} />
            {hasPY
              ? <CRow label="Working Capital Changes" amount={0} indent={2} />
              : <CRow label="Working Capital Changes (Upload prior year TB for details)" amount={0} indent={2} />}
          </>:<>
            <CRow label="Cash receipts from customers" amount={totalIncome} indent />
            <CRow label="Cash paid to suppliers and employees" amount={-Math.abs(totalExpense)} indent />
          </>}
          <CRow label="Net Cash from Operating Activities (A)" amount={pbt+depr} bold />
          <SH label="B. Cash Flow from Investing Activities" />
          <CRow label="Purchase of Fixed Assets / Capital Expenditure" amount={0} indent />
          <CRow label="Net Cash from Investing Activities (B)" amount={0} bold />
          <SH label="C. Cash Flow from Financing Activities" />
          <CRow label="Proceeds from / (Repayment of) Borrowings" amount={0} indent />
          <CRow label="Finance Costs Paid" amount={-finCost} indent />
          <CRow label="Net Cash from Financing Activities (C)" amount={-finCost} bold />
          <tr className="border-t-2 border-slate-700 bg-slate-50">
            <td className="px-3 py-3 font-bold text-slate-900 text-sm">Net Change in Cash (A+B+C)</td>
            <td className="px-3 py-3 text-right font-mono font-bold">{fmt(pbt+depr-finCost,D,locale)}</td>
          </tr>
          <CRow label={hasPY ? 'Cash at Beginning of Year (from Prior Year BS)' : 'Cash at Beginning of Year'} amount={openingCash} indent />
          <tr className="border-t-2 border-slate-700 bg-indigo-50">
            <td className="px-3 py-3 font-bold text-indigo-900 text-sm">Cash at End of Year (from Balance Sheet)</td>
            <td className="px-3 py-3 text-right font-mono font-bold text-indigo-900">{fmt(cash,D,locale)}</td>
          </tr>
        </tbody>
      </table>
      {!hasPY && <p className="text-xs text-slate-400 mt-2 italic">* Upload prior year TB for complete working capital changes and opening cash balance.</p>}
    </div>
  );
}
 
// ── OCI ───────────────────────────────────────────────────────────────────────
function OCIStatement({ lines, divisor, currSymbol, hasPY, locale = 'en-IN' }) {
  const D      = divisor;
  const ociLines = lines.filter(l=>l.sheet==='OCI');
  const total    = ociLines.reduce((s,l)=>s+Number(l.totalFinalNet||0),0);
  const pyTotal  = hasPY ? ociLines.reduce((s,l)=>s+Number(l.pyAmount||0),0) : null;
  return (
    <div>
      <div className="text-center mb-5">
        <h2 className="text-lg font-bold uppercase">Other Comprehensive Income</h2>
        <p className="text-xs text-slate-400 mt-1">All amounts in {currSymbol} · IAS 1 Para 82A</p>
      </div>
      <table className="w-full text-sm border border-slate-300 rounded-lg overflow-hidden">
        <thead>
          <tr className="bg-slate-800 text-white">
            <th className="text-left px-3 py-3">Particulars</th>
            <th className="text-right px-3 py-3 w-44">Current Year</th>
            {hasPY && <th className="text-right px-3 py-3 w-44 text-slate-300">Previous Year</th>}
          </tr>
        </thead>
        <tbody>
          <tr className="bg-slate-100"><td colSpan={hasPY?3:2} className="px-3 py-2 text-xs font-bold text-slate-600 uppercase">A. Items not reclassified to P&L</td></tr>
          {ociLines.filter(l=>['actuarial','remeasurement','defined benefit'].some(k=>l.groupName?.toLowerCase().includes(k))).map((l,i)=>(
            <tr key={i} className="border-b hover:bg-blue-50">
              <td className="py-2 pl-8">{l.groupName}</td>
              <td className="py-2 pr-3 text-right font-mono">{fmt(l.totalFinalNet,D,locale)}</td>
              {hasPY && <td className="py-2 pr-3 text-right font-mono text-slate-400">{fmt(l.pyAmount??0,D,locale)}</td>}
            </tr>
          ))}
          <tr className="bg-slate-100"><td colSpan={hasPY?3:2} className="px-3 py-2 text-xs font-bold text-slate-600 uppercase">B. Items that may be reclassified to P&L</td></tr>
          {ociLines.filter(l=>!['actuarial','remeasurement','defined benefit'].some(k=>l.groupName?.toLowerCase().includes(k))).map((l,i)=>(
            <tr key={i} className="border-b hover:bg-blue-50">
              <td className="py-2 pl-8">{l.groupName}</td>
              <td className="py-2 pr-3 text-right font-mono">{fmt(l.totalFinalNet,D,locale)}</td>
              {hasPY && <td className="py-2 pr-3 text-right font-mono text-slate-400">{fmt(l.pyAmount??0,D,locale)}</td>}
            </tr>
          ))}
          {ociLines.length===0 && <tr><td colSpan={hasPY?3:2} className="py-8 text-center text-slate-400 italic text-sm">No OCI items mapped. Map OCI items in Mapping page.</td></tr>}
          <tr className="border-t-2 border-slate-600 font-bold bg-slate-50">
            <td className="px-3 py-2.5">Total Other Comprehensive Income</td>
            <td className="px-3 py-2.5 text-right font-mono">{fmt(total,D,locale)}</td>
            {hasPY && <td className="px-3 py-2.5 text-right font-mono text-slate-400">{fmt(pyTotal??0,D,locale)}</td>}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
 
// ── SOCE ─────────────────────────────────────────────────────────────────────
function SOCEStatement({ bsLines, plLines, divisor, currSymbol, hasPY, locale = 'en-IN' }) {
  const D      = divisor;
  const equity = bsLines.filter(l=>l.assetLiability==='Equity');
  const pat    = plLines.filter(l=>l.assetLiability==='Income').reduce((s,l)=>s+Number(l.totalFinalNet||0),0)
               - plLines.filter(l=>l.assetLiability==='Expenses'&&l.sheet==='PL').reduce((s,l)=>s+Number(l.totalFinalNet||0),0);
  const total  = equity.reduce((s,l)=>s+Number(l.totalFinalNet||0),0);
 
  // PY closing = CY opening
  const pyEquity  = hasPY ? equity.reduce((s,l)=>s+Number(l.pyAmount||0),0) : null;
 
  return (
    <div>
      <div className="text-center mb-5">
        <h2 className="text-lg font-bold uppercase">Statement of Changes in Equity</h2>
        <p className="text-xs text-slate-400 mt-1">All amounts in {currSymbol} · IAS 1 Para 106</p>
        {hasPY && <p className="text-xs text-emerald-600 mt-0.5">✓ Opening balances from prior year TB</p>}
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
                <td className="px-3 py-2.5 text-right font-mono">{hasPY ? fmt(l.pyAmount??0,D,locale) : <span className="text-slate-400">—</span>}</td>
                <td className="px-3 py-2.5 text-right font-mono text-slate-400">—</td>
                <td className="px-3 py-2.5 text-right font-mono text-slate-400">—</td>
                <td className="px-3 py-2.5 text-right font-mono text-slate-400">—</td>
                <td className="px-3 py-2.5 text-right font-mono font-semibold">{fmt(l.totalFinalNet,D,locale)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-slate-600 font-bold bg-indigo-50">
              <td className="px-3 py-2.5 text-indigo-900">Total Equity</td>
              <td className="px-3 py-2.5 text-right font-mono text-indigo-700">{hasPY ? fmt(pyEquity??0,D,locale) : <span className="text-slate-400">—</span>}</td>
              <td className="px-3 py-2.5 text-right font-mono text-indigo-700">{fmt(pat,D,locale)}</td>
              <td className="px-3 py-2.5 text-right font-mono text-slate-400">—</td>
              <td className="px-3 py-2.5 text-right font-mono text-slate-400">—</td>
              <td className="px-3 py-2.5 text-right font-mono text-indigo-900 font-bold">{fmt(total,D,locale)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {!hasPY && <p className="text-xs text-slate-400 mt-2 italic">* Upload prior year TB to populate opening balances.</p>}
    </div>
  );
}
 
// ── Main ──────────────────────────────────────────────────────────────────────
export default function FinancialStatements() {
  const { engagementId }          = useParams();
  const { currentEngagement, currentClient, firm } = useStore();
  const [data, setData]             = useState(null);
  const [hasPY, setHasPY]           = useState(false);
  const [loading, setLoading]       = useState(true);
  const [generating, setGenerating] = useState(false);
  const [tab, setTab]               = useState('BS');
  const [hidden, setHidden]         = useState({});
  const [unit, setUnit]             = useState(UNITS[0]);
  const [cfsMethod, setCfsMethod]   = useState('indirect');
  const [fsErrors, setFsErrors]     = useState([]);
 
  const method     = currentEngagement?.method || 'AS';
  const currency   = (method==='IFRS'||method==='IFRS_SME') ? 'AED' : 'INR';
  const currSymbol = currency;
  const cfg        = METHOD_CONFIG[method] || METHOD_CONFIG.AS;
 
  // Region: UAE if IFRS method or client is UAE
  const region  = (method==='IFRS'||method==='IFRS_SME') ? 'UAE'
    : (currentClient?.region==='UAE'||currentClient?.country==='UAE') ? 'UAE'
    : 'India';
  const isUAE   = region === 'UAE';
  // Number format: Indian comma style for India, standard for UAE
  const locale  = isUAE ? 'en-US' : 'en-IN';
 
  // ── Derive FY year labels and date headers from engagement financialYear ──
  // India FY format: "2024-25"  → BS date "as at 31 March 2025"
  //                               PL date "for the year ended 31 March 2025"
  //                               PY BS   "as at 31 March 2024"
  // UAE  FY format: "2024"      → BS date "as at 31 December 2024"
  //                               PL date "for the year ended 31 December 2024"
  //                               PY BS   "as at 31 December 2023"
  const fy = currentEngagement?.financialYear || '';
 
  function deriveDates(fyStr) {
    if (!fyStr) return { cyDate: '', pyDate: '', cyYear: 'Current Year', pyYear: 'Previous Year' };
 
    // India format: "2024-25" — year ending is the second part → 2025 → 31 March 2025
    const m1 = fyStr.match(/^(\d{4})-(\d{2,4})$/);
    if (m1) {
      const endYear  = m1[2].length === 2 ? parseInt(m1[1].slice(0,2) + m1[2]) : parseInt(m1[2]);
      const startYear = endYear - 1;
      return {
        cyDate:  `31 March ${endYear}`,
        pyDate:  `31 March ${startYear}`,
        cyYear:  fyStr,
        pyYear:  `${startYear}-${String(startYear+1).slice(-2)}`,
      };
    }
 
    // UAE format: "2024" — calendar year → 31 December 2024
    const m2 = fyStr.match(/^(\d{4})$/);
    if (m2) {
      const yr = parseInt(m2[1]);
      return {
        cyDate:  `31 December ${yr}`,
        pyDate:  `31 December ${yr - 1}`,
        cyYear:  fyStr,
        pyYear:  String(yr - 1),
      };
    }
 
    return { cyDate: fyStr, pyDate: '', cyYear: fyStr, pyYear: 'Previous Year' };
  }
 
  const { cyDate, pyDate, cyYear, pyYear } = deriveDates(fy);
 
  useEffect(() => { load(); }, [engagementId]);
 
  async function load() {
    setLoading(true);
    try {
      const res = await fsAPI.get(engagementId);
      setData(res.sheets || res);
      setHasPY(res.hasPY || false);
    } catch { setData(null); setHasPY(false); }
    finally { setLoading(false); }
  }
 
  async function generate() {
    setGenerating(true);
    try {
      const res     = await fsAPI.generate(engagementId);
      const sheets  = res.sheets || res;
      setData(sheets);
      setHasPY(res.hasPY || false);
      if (res.errors?.length > 0) {
        setFsErrors(res.errors);
        toast.error(`Generated with ${res.errors.length} issue(s) — check validation`);
      } else {
        setFsErrors([]);
        const msg = res.hasPY
          ? 'Financial statements generated with comparative figures ✓'
          : 'Financial statements generated — upload prior year TB for comparative column';
        toast.success(msg);
      }
    } catch (err) { toast.error(err?.error || 'Generation failed'); }
    finally { setGenerating(false); }
  }
 
  const allLines   = Object.values(data || {}).flat();
  const getLines   = sheet => (data?.[sheet] || []).filter(l => !hidden[l.groupName]);
  const toggleHide = key   => setHidden(h => ({ ...h, [key]: !h[key] }));
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
          <p className="text-slate-500 text-sm mt-0.5">
            {method} · {cyYear} · {currency}
            {hasPY && <span className="ml-2 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-semibold rounded-full">✓ Comparative: {pyYear}</span>}
            {!hasPY && <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full">No prior year TB</span>}
          </p>
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
          {tab==='BS'   && <BSStatement   lines={allLines.filter(l=>l.sheet==='BS')} method={method} hidden={hidden} onHide={toggleHide} divisor={unit.value} currSymbol={currSymbol} hasPY={hasPY} cyYear={cyYear} pyYear={pyYear} cyDate={cyDate} pyDate={pyDate} locale={locale} />}
          {tab==='PL'   && <PLStatement   lines={allLines} method={method} divisor={unit.value} currSymbol={currSymbol} hasPY={hasPY} cyYear={cyYear} pyYear={pyYear} cyDate={cyDate} pyDate={pyDate} locale={locale} />}
          {tab==='CFS'  && <CFSStatement  bsLines={allLines.filter(l=>l.sheet==='BS')} plLines={allLines} method={method} cfsMethod={cfsMethod} onMethodChange={setCfsMethod} divisor={unit.value} currSymbol={currSymbol} hasPY={hasPY} cyDate={cyDate} pyDate={pyDate} locale={locale} />}
          {tab==='OCI'  && <OCIStatement  lines={allLines} divisor={unit.value} currSymbol={currSymbol} hasPY={hasPY} locale={locale} />}
          {tab==='SOCE' && <SOCEStatement bsLines={allLines.filter(l=>l.sheet==='BS')} plLines={allLines} divisor={unit.value} currSymbol={currSymbol} hasPY={hasPY} locale={locale} />}
        </>
      )}
    </div>
  );
}
 