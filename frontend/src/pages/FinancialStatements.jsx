import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
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

  // BS sub-section classification — reads currentNonCurrent from FSLine (set by MasterGrouping)
  // Zero keyword matching. If currentNonCurrent is null (custom item), defaults to noncurrent.
  const isNC = l => l.currentNonCurrent === 'noncurrent' || l.currentNonCurrent === null;
  const isCA = l => l.currentNonCurrent === 'current';

  const ncAssets    = assets.filter(l => isNC(l));
  const cAssets     = assets.filter(l => isCA(l));
  const otherAssets = []; // all assets now classified explicitly

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
// Renders in the correct format for each method:
//   AS / Ind AS : Schedule III — Revenue → Other Income → Total Income →
//                 Expenses by nature (all listed) → PBT → Tax → PAT
//                 NO gross profit line.
//   IFRS / IFRS SME : Function-based — Revenue → COS → Gross Profit →
//                 Distribution → Admin → Other Income → Opex → Finance → PBT → Tax → PAT → OCI
function PLStatement({ lines, method, divisor, currSymbol, hasPY, cyYear, pyYear, cyDate, pyDate, locale = 'en-IN' }) {
  const cfg     = METHOD_CONFIG[method] || METHOD_CONFIG.AS;
  const D       = divisor;
  const isIFRS  = method === 'IFRS' || method === 'IFRS_SME';
  const isAS    = method === 'AS';
  const isIndAS = method === 'IND_AS';

  const plLines  = lines.filter(l => l.sheet === 'PL');
  const ociLines = lines.filter(l => l.sheet === 'OCI');

  const isIncome  = l => l.assetLiability === 'Income';
  const isExpense = l => l.assetLiability === 'Expenses';

  // ── Revenue classification ────────────────────────────────────────────────
  // P&L classification — reads plCategory from FSLine (set by MasterGrouping)
  // Zero keyword matching anywhere.
  const revenueLines     = plLines.filter(l => l.plCategory === 'revenue');
  const otherIncomeLines = plLines.filter(l => l.plCategory === 'otherIncome');

  // ── Expense classification ────────────────────────────────────────────────
  const cosKW      = ['cost of sale','cost of good','cost of material','cost of revenue',
                      'cost of service','direct cost','purchase of stock','changes in inventor',
                      'material consumed','subcontract','job work','labour cost','labor cost'];
  const cosLines   = plLines.filter(l => isExpense(l) && (() => {
    const n = l.groupName?.toLowerCase()||'';
    return cosKW.some(k=>n.includes(k)) || n==='purchases' || n==='purchase';
  })());

  const finCostLines  = plLines.filter(l => l.plCategory === 'financeCost');

  const deprLines     = plLines.filter(l => l.plCategory === 'depreciation');

  const taxKW    = ['tax expense','income tax expense','current tax','deferred tax expense','provision for tax','tax expense:'];
  const taxLines      = plLines.filter(l => l.plCategory === 'tax');se(l) && exceptKW.some(k=>l.groupName?.toLowerCase().includes(k));

  // AS/Ind AS: all non-cos, non-finance, non-depr, non-tax expenses are "other expenses by nature"
  // IFRS: split into selling/admin
  const sellingKW    = ['selling','distribution','marketing','advertising'];
  const sellingLines = plLines.filter(l => isExpense(l)
    && sellingKW.some(k=>l.groupName?.toLowerCase().includes(k))
    && !cosLines.includes(l) && !taxLines.includes(l) && !finCostLines.includes(l));

  // Everything else = employee costs + other expenses (for AS: all by nature)
  const otherExpLines = plLines.filter(l => isExpense(l)
    && !cosLines.includes(l) && !finCostLines.includes(l) && !deprLines.includes(l)
    && !taxLines.includes(l) && !sellingLines.includes(l) && !exceptLines.includes(l));

  // ── Compute totals ────────────────────────────────────────────────────────
  const sum   = arr => arr.reduce((s,l)=>s+Number(l.totalFinalNet||0),0);
  const sumPY = arr => hasPY ? arr.reduce((s,l)=>s+Number(l.pyAmount||0),0) : null;

  const totalRevenue      = sum(revenueLines);
  const totalOtherIncome  = sum(otherIncomeLines);
  const totalCOS          = sum(cosLines);
  const grossProfit       = totalRevenue - totalCOS;
  const totalSelling      = sum(sellingLines);
  const totalOtherExp     = sum(otherExpLines);
  const totalDepr         = sum(deprLines);
  const totalFinCost      = sum(finCostLines);
  const totalExcept       = sum(exceptLines);
  const totalTax          = sum(taxLines);

  // AS/Ind AS: Total Expenses = all expense lines except tax
  const totalExpenses = totalCOS + totalSelling + totalOtherExp + totalDepr + totalFinCost + totalExcept;
  // Total income for AS
  const totalIncome   = totalRevenue + totalOtherIncome;

  // PBT computation differs by method
  // AS/Ind AS: Total Income - Total Expenses (before tax)
  // IFRS: Gross Profit + OtherIncome - Selling - OtherExp - Depr - FinCost
  const pbt = isIFRS
    ? grossProfit + totalOtherIncome - totalSelling - totalOtherExp - totalDepr - totalFinCost + totalExcept
    : totalIncome - (totalExpenses - totalTax); // totalExpenses already excludes tax? No — recalc cleanly:
  // Recalc cleanly for both:
  const allExpensesBeforeTax = totalCOS + totalSelling + totalOtherExp + totalDepr + totalFinCost + totalExcept;
  const pbtClean = totalIncome - allExpensesBeforeTax;
  const pat      = pbtClean - totalTax;
  const ociTotal = sum(ociLines);
  const totalCI  = pat + ociTotal;

  // PY
  const pyRevenue      = sumPY(revenueLines);
  const pyOtherIncome  = sumPY(otherIncomeLines);
  const pyCOS          = sumPY(cosLines);
  const pyGross        = hasPY ? (pyRevenue - pyCOS) : null;
  const pySelling      = sumPY(sellingLines);
  const pyOtherExp     = sumPY(otherExpLines);
  const pyDepr         = sumPY(deprLines);
  const pyFinCost      = sumPY(finCostLines);
  const pyExcept       = sumPY(exceptLines);
  const pyTax          = sumPY(taxLines);
  const pyTotalIncome  = hasPY ? (pyRevenue + pyOtherIncome) : null;
  const pyAllExpBT     = hasPY ? (pyCOS + pySelling + pyOtherExp + pyDepr + pyFinCost + pyExcept) : null;
  const pyPBT          = hasPY ? (pyTotalIncome - pyAllExpBT) : null;
  const pyPAT          = hasPY ? (pyPBT - pyTax) : null;
  const pyOCI          = sumPY(ociLines);
  const pyCI           = hasPY ? (pyPAT + pyOCI) : null;

  // ── Dynamic profit/loss label helper ─────────────────────────────────────
  function plLabel(amount, pyAmt, positiveWord, negativeWord) {
    // Use current year amount to decide wording; if zero use positive word
    const word = amount < 0 ? negativeWord : positiveWord;
    return word;
  }

  const grossLabel  = plLabel(grossProfit,   pyGross,  'GROSS PROFIT',    'GROSS LOSS');
  const patLabel    = plLabel(pat,            pyPAT,    'PROFIT FOR THE YEAR', 'LOSS FOR THE YEAR');
  const pbtLabel    = plLabel(pbtClean,       pyPBT,    'PROFIT BEFORE TAX',   'LOSS BEFORE TAX');
  const ciLabel     = plLabel(totalCI,        pyCI,     'TOTAL COMPREHENSIVE INCOME FOR THE YEAR', 'TOTAL COMPREHENSIVE LOSS FOR THE YEAR');

  const Blank = () => <tr><td colSpan={hasPY ? 5 : 4} className="py-1.5 border-0"></td></tr>;
  const R = ({label, note, amount, pyAmt, bold, indent, section, subheader, borderTop}) => (
    <Row label={label} note={note} amount={amount} pyAmount={pyAmt} hasPY={hasPY}
      bold={bold} indent={indent} section={section} subheader={subheader} borderTop={borderTop} divisor={D} locale={locale} />
  );
  const Lines = ({arr}) => arr.map((l,i)=>(
    <R key={i} label={l.groupName} note={l.noteGroup?.noteNumber}
      amount={Number(l.totalFinalNet)} pyAmt={hasPY?Number(l.pyAmount??0):null} indent={2} />
  ));

  // ── AS / Ind AS format — Schedule III ─────────────────────────────────────
  // I. Revenue from Operations
  // II. Other Income
  // III. Total Revenue (I + II)
  // IV. Expenses (all by nature, including finance costs and depreciation)
  //     - Cost of materials / purchases / changes in inventory
  //     - Employee benefit expenses
  //     - Finance costs
  //     - Depreciation and amortisation
  //     - Other expenses
  //     Total Expenses
  // V.  Profit/(Loss) before exceptional items and tax (III - IV)
  // VI. Exceptional items
  // VII. Profit/(Loss) before tax (V + VI)
  // VIII. Tax expense
  // IX.  Profit/(Loss) for the year (VII - VIII)
  const renderAS = () => (
    <>
      <R label="I. REVENUE FROM OPERATIONS" section />
      <Lines arr={revenueLines} />
      <R label="Total Revenue from Operations (I)" amount={totalRevenue} pyAmt={pyRevenue} bold borderTop />
      <Blank/>
      {otherIncomeLines.length > 0 && <>
        <R label="II. OTHER INCOME" section />
        <Lines arr={otherIncomeLines} />
        <R label="Total Other Income (II)" amount={totalOtherIncome} pyAmt={pyOtherIncome} bold borderTop />
        <Blank/>
      </>}
      <R label={`III. TOTAL REVENUE ${otherIncomeLines.length>0?'(I + II)':'(I)'}`} amount={totalIncome} pyAmt={pyTotalIncome} bold borderTop />
      <Blank/>
      <R label="IV. EXPENSES" section />
      {cosLines.length > 0 && <><Lines arr={cosLines}/></>}
      {otherExpLines.length > 0 && <><Lines arr={otherExpLines}/></>}
      {deprLines.length > 0 && <><Lines arr={deprLines}/></>}
      {finCostLines.length > 0 && <><Lines arr={finCostLines}/></>}
      <R label="Total Expenses (IV)" amount={allExpensesBeforeTax} pyAmt={pyAllExpBT} bold borderTop />
      <Blank/>
      {exceptLines.length > 0 ? <>
        <R label={`V. ${plLabel(totalIncome - allExpensesBeforeTax, null, 'PROFIT', 'LOSS')} BEFORE EXCEPTIONAL ITEMS AND TAX (III - IV)`} amount={totalIncome - allExpensesBeforeTax} pyAmt={hasPY?(pyTotalIncome-pyAllExpBT):null} bold borderTop />
        <Blank/>
        <R label="VI. EXCEPTIONAL ITEMS" section />
        <Lines arr={exceptLines} />
        <R label={`VII. ${pbtLabel} (V + VI)`} amount={pbtClean} pyAmt={pyPBT} bold borderTop />
      </> : <>
        <R label={`V. ${pbtLabel} (III - IV)`} amount={pbtClean} pyAmt={pyPBT} bold borderTop />
      </>}
      <Blank/>
      <R label={`${exceptLines.length>0?'VIII':'VI'}. TAX EXPENSE`} section />
      {taxLines.length > 0
        ? <Lines arr={taxLines}/>
        : <R label="Current tax" amount={0} pyAmt={hasPY?0:null} indent={2}/>}
      <Blank/>
      <R label={`${exceptLines.length>0?'IX':'VII'}. ${patLabel}`} amount={pat} pyAmt={pyPAT} bold borderTop />
      {cfg.hasOCI && <>
        <Blank/>
        <R label="OTHER COMPREHENSIVE INCOME" section />
        <R label="A. Items that will not be reclassified to profit or loss" subheader />
        {ociLines.filter(l=>['actuarial','remeasurement','defined benefit'].some(k=>l.groupName?.toLowerCase().includes(k))).map((l,i)=>(
          <R key={i} label={l.groupName} note={l.noteGroup?.noteNumber} amount={Number(l.totalFinalNet)} pyAmt={hasPY?Number(l.pyAmount??0):null} indent={2}/>
        ))}
        <R label="B. Items that will be reclassified to profit or loss" subheader />
        {ociLines.filter(l=>!['actuarial','remeasurement','defined benefit'].some(k=>l.groupName?.toLowerCase().includes(k))).map((l,i)=>(
          <R key={i} label={l.groupName} note={l.noteGroup?.noteNumber} amount={Number(l.totalFinalNet)} pyAmt={hasPY?Number(l.pyAmount??0):null} indent={2}/>
        ))}
        {ociLines.length===0 && <tr><td colSpan={hasPY?5:4} className="px-10 py-1.5 text-xs text-slate-400 italic">No OCI items — map to OCI sheet in Mapping page if applicable</td></tr>}
        <R label="Total Other Comprehensive Income / (Loss) for the year, net of tax" amount={ociTotal} pyAmt={pyOCI} bold borderTop />
        <Blank/>
        <R label={ciLabel} amount={totalCI} pyAmt={pyCI} bold borderTop />
      </>}
      <Blank/>
      <R label="Earnings Per Share (see Note)" bold />
      <R label="Basic EPS (₹)" amount={null} indent={2} />
      <R label="Diluted EPS (₹)" amount={null} indent={2} />
    </>
  );

  // ── IFRS / IFRS SME format — function-based ────────────────────────────────
  // Revenue → Cost of Sales → Gross Profit → Distribution Costs →
  // Admin Expenses → Other Income → Operating Profit →
  // Finance Costs → PBT → Tax → PAT → OCI → Total CI
  const renderIFRS = () => (
    <>
      <R label="REVENUE" section />
      <Lines arr={revenueLines} />
      <R label="Revenue" amount={totalRevenue} pyAmt={pyRevenue} bold borderTop />
      <Blank/>
      {cosLines.length > 0 && <>
        <R label="Cost of sales" subheader />
        <Lines arr={cosLines} />
        <R label="Total cost of sales" amount={totalCOS} pyAmt={pyCOS} bold borderTop />
        <Blank/>
        <R label={grossLabel} amount={grossProfit} pyAmt={pyGross} bold borderTop />
        <Blank/>
      </>}
      {sellingLines.length > 0 && <>
        <R label="Distribution costs" subheader />
        <Lines arr={sellingLines} />
        <Blank/>
      </>}
      {otherExpLines.length > 0 && <>
        <R label="Administrative and other expenses" subheader />
        <Lines arr={otherExpLines} />
        <Blank/>
      </>}
      {deprLines.length > 0 && <>
        <R label="Depreciation and amortisation" subheader />
        <Lines arr={deprLines} />
        <Blank/>
      </>}
      {otherIncomeLines.length > 0 && <>
        <R label="Other income" subheader />
        <Lines arr={otherIncomeLines} />
        <Blank/>
      </>}
      {exceptLines.length > 0 && <>
        <R label="Exceptional items" subheader />
        <Lines arr={exceptLines} />
        <Blank/>
      </>}
      <R label={pbtLabel.replace('BEFORE TAX','BEFORE FINANCE COSTS AND TAX')} amount={pbtClean + totalFinCost} pyAmt={hasPY?(pyPBT+pyFinCost):null} bold borderTop />
      <Blank/>
      <R label="Finance costs" subheader />
      {finCostLines.length > 0
        ? <Lines arr={finCostLines}/>
        : <R label="Finance costs" amount={0} pyAmt={hasPY?0:null} indent={2}/>}
      <Blank/>
      <R label={pbtLabel} amount={pbtClean} pyAmt={pyPBT} bold borderTop />
      <Blank/>
      <R label="Income tax expense" subheader />
      {taxLines.length > 0
        ? <Lines arr={taxLines}/>
        : <R label="Current tax" amount={0} pyAmt={hasPY?0:null} indent={2}/>}
      <Blank/>
      <R label={patLabel} amount={pat} pyAmt={pyPAT} bold borderTop />
      {cfg.hasOCI && <>
        <Blank/>
        <R label="OTHER COMPREHENSIVE INCOME" section />
        <R label="Items that will not be reclassified to profit or loss" subheader />
        {ociLines.filter(l=>['actuarial','remeasurement','defined benefit'].some(k=>l.groupName?.toLowerCase().includes(k))).map((l,i)=>(
          <R key={i} label={l.groupName} note={l.noteGroup?.noteNumber} amount={Number(l.totalFinalNet)} pyAmt={hasPY?Number(l.pyAmount??0):null} indent={2}/>
        ))}
        <R label="Items that may be reclassified subsequently to profit or loss" subheader />
        {ociLines.filter(l=>!['actuarial','remeasurement','defined benefit'].some(k=>l.groupName?.toLowerCase().includes(k))).map((l,i)=>(
          <R key={i} label={l.groupName} note={l.noteGroup?.noteNumber} amount={Number(l.totalFinalNet)} pyAmt={hasPY?Number(l.pyAmount??0):null} indent={2}/>
        ))}
        {ociLines.length===0 && <tr><td colSpan={hasPY?5:4} className="px-10 py-1.5 text-xs text-slate-400 italic">No OCI items — map to OCI sheet in Mapping page if applicable</td></tr>}
        <R label="Other comprehensive income for the year, net of tax" amount={ociTotal} pyAmt={pyOCI} bold borderTop />
        <Blank/>
        <R label={ciLabel} amount={totalCI} pyAmt={pyCI} bold borderTop />
      </>}
      <Blank/>
      <R label="Earnings Per Share" bold />
      <R label="Basic EPS" amount={null} indent={2} />
      <R label="Diluted EPS" amount={null} indent={2} />
    </>
  );

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
          {isIFRS ? renderIFRS() : renderAS()}
        </tbody>
      </table>
      <div className="mt-4 grid grid-cols-4 gap-3">
        {[
          { label: grossProfit>=0 ? 'Gross Profit' : 'Gross Loss',         cy:grossProfit,  py:pyGross,  color: grossProfit>=0  ? 'bg-blue-50 border-blue-200 text-blue-800'   : 'bg-red-50 border-red-200 text-red-800' },
          { label: pbtClean>=0    ? 'Profit Before Tax' : 'Loss Before Tax', cy:pbtClean,    py:pyPBT,    color: pbtClean>=0     ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-red-50 border-red-200 text-red-800' },
          { label: pat>=0         ? 'Profit After Tax'  : 'Loss After Tax',  cy:pat,         py:pyPAT,    color: pat>=0          ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800' },
          { label: totalCI>=0     ? 'Total Comprehensive Income' : 'Total Comprehensive Loss', cy:totalCI, py:pyCI, color: totalCI>=0 ? 'bg-indigo-50 border-indigo-200 text-indigo-800' : 'bg-red-50 border-red-200 text-red-800' },
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

// ── CFS — Indirect method with proper working capital from PY/CY BS delta ─────
// Working capital changes = (PY current asset/liability) - (CY current asset/liability)
// This is the correct indirect method: uses actual BS movements, not estimates.
function CFSStatement({ bsLines, plLines, method, cfsMethod, onMethodChange, divisor, currSymbol, hasPY, cyDate, pyDate, locale = 'en-IN' }) {
  const D       = divisor;
  const isIFRS  = method==='IFRS'||method==='IFRS_SME';

  // ── P&L line classification ────────────────────────────────────────────────
  const incomeLines  = plLines.filter(l=>l.assetLiability==='Income'&&l.sheet==='PL');
  const expenseLines = plLines.filter(l=>l.assetLiability==='Expenses'&&l.sheet==='PL');
  const totalIncome  = incomeLines.reduce((s,l)=>s+Number(l.totalFinalNet||0),0);
  const totalExpense = expenseLines.reduce((s,l)=>s+Number(l.totalFinalNet||0),0);
  const pbt          = totalIncome - totalExpense;

  // CFS reads plCategory and isCashItem — zero keyword matching
  const depr     = expenseLines.filter(l=>l.plCategory==='depreciation').reduce((s,l)=>s+Number(l.totalFinalNet||0),0);
  const finCost  = expenseLines.filter(l=>l.plCategory==='financeCost').reduce((s,l)=>s+Number(l.totalFinalNet||0),0);
  const cash     = bsLines.filter(l=>l.isCashItem===true&&l.assetLiability==='Assets').reduce((s,l)=>s+Number(l.totalFinalNet||0),0);

  // ── Working capital changes (indirect method) ─────────────────────────────
  // Formula: (PY balance - CY balance) for current assets, (CY balance - PY balance) for current liabilities
  // Increase in CA = use of cash (negative); Decrease in CA = source of cash (positive)
  // Increase in CL = source of cash (positive); Decrease in CL = use of cash (negative)
  // Working capital: uses currentNonCurrent field — no keyword matching

  let workingCapitalChanges  = 0;
  const wcItems = [];

  if (hasPY) {
    for (const cyLine of bsLines) {
      const cyAmt = Number(cyLine.totalFinalNet||0);
      const pyAmt = Number(cyLine.pyAmount||0);

      if (cyLine.currentNonCurrent === 'current' && cyLine.assetLiability==='Assets' && !cyLine.isCashItem) {
        const change = pyAmt - cyAmt; // decrease in CA = positive cash flow
        workingCapitalChanges += change;
        if (Math.abs(change) > 0.01) wcItems.push({ label: `(Increase)/Decrease in ${cyLine.groupName}`, amount: change });
      } else if (cyLine.currentNonCurrent === 'current' && cyLine.assetLiability==='Liabilities') {
        const change = cyAmt - pyAmt; // increase in CL = positive cash flow
        workingCapitalChanges += change;
        if (Math.abs(change) > 0.01) wcItems.push({ label: `Increase/(Decrease) in ${cyLine.groupName}`, amount: change });
      }
    }
  }

  const operatingCashBeforeTax = pbt + depr + finCost + workingCapitalChanges;
  const openingCash = hasPY
    ? bsLines.filter(l=>l.isCashItem===true&&l.assetLiability==='Assets').reduce((s,l)=>s+Number(l.pyAmount||0),0)
    : 0;

  // ── Investing: PPE movements from BS (CY - PY = net capex) ────────────────
  // CFS investing: uses currentNonCurrent field — all noncurrent assets are capex candidates

  let netCapex    = 0;
  let netInvest   = 0;
  const capexItems = [];
  const investItems = [];

  if (hasPY) {
    for (const cyLine of bsLines) {
      const n = (cyLine.groupName||'').toLowerCase();
      const cyAmt = Number(cyLine.totalFinalNet||0);
      const pyAmt = Number(cyLine.pyAmount||0);
      if (cyLine.assetLiability === 'Assets') {
        if (cyLine.currentNonCurrent === 'noncurrent' && !cyLine.isCashItem) {
          const movement = -(cyAmt - pyAmt); // increase in asset = cash outflow
          netCapex += movement;
          if (Math.abs(movement) > 0.01) capexItems.push({ label: cyLine.groupName, amount: movement });
        } else if (false) { // merged into noncurrent branch above
          const movement = -(cyAmt - pyAmt);
          netInvest += movement;
          if (Math.abs(movement) > 0.01) investItems.push({ label: `Purchase/Sale of ${cyLine.groupName}`, amount: movement });
        }
      }
    }
  }
  const netInvesting = hasPY ? (netCapex + netInvest) : 0;

  // ── Financing: Borrowing movements + finance costs paid ───────────────────
  // CFS financing: uses currentNonCurrent — noncurrent liabilities are borrowings
  let netBorrowing = 0;
  const borrowItems = [];

  if (hasPY) {
    for (const cyLine of bsLines) {
      const n = (cyLine.groupName||'').toLowerCase();
      if (cyLine.assetLiability === 'Liabilities' && cyLine.currentNonCurrent === 'noncurrent') {
        const movement = Number(cyLine.totalFinalNet||0) - Number(cyLine.pyAmount||0);
        netBorrowing += movement;
        if (Math.abs(movement) > 0.01) borrowItems.push({ label: cyLine.groupName, amount: movement });
      }
    }
  }
  const netFinancing = netBorrowing - finCost;

  // Net change = Operating + Investing + Financing
  // Operating = operatingCashBeforeTax - taxPaid (we use pbt as before-tax approximation)
  const netOperating = operatingCashBeforeTax - finCost; // subtract finCost (paid in financing)
  const netChange    = netOperating + netInvesting + netFinancing;

  const CRow = ({label, amount, bold, indent, sub}) => (
    <tr className={`${bold?'border-t-2 border-slate-500 bg-slate-50':'border-b border-slate-100 hover:bg-blue-50'}`}>
      <td className={`py-2 text-sm ${indent===2?'pl-10':indent?'pl-6':'pl-3'} ${bold?'font-bold text-slate-900':sub?'text-slate-500 italic':'text-slate-700'}`}>{label}</td>
      <td className={`py-2 pr-3 text-right font-mono text-sm ${bold?'font-bold text-slate-900':sub?'text-slate-500':'text-slate-800'}`}>{amount!==undefined&&amount!==null?fmt(amount,D,locale):''}</td>
    </tr>
  );
  const SH = ({label}) => <tr className="bg-slate-100"><td colSpan={2} className="px-3 py-2 font-bold text-slate-700 text-xs uppercase">{label}</td></tr>;

  return (
    <div>
      <div className="text-center mb-4">
        <h2 className="text-lg font-bold uppercase">{isIFRS?'Statement of Cash Flows':'Cash Flow Statement'}</h2>
        <p className="text-sm text-slate-500">for the year ended {cyDate}</p>
        <p className="text-xs text-slate-400">{isIFRS?'IAS 7':method==='IND_AS'?'Ind AS 7':'AS 3'}</p>
        {hasPY && <p className="text-xs text-emerald-600 mt-1">✓ Working capital changes computed from BS movements</p>}
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
            <CRow label="Net Profit / (Loss) Before Tax and Finance Costs" amount={pbt} indent />
            <CRow label="Add: Depreciation and Amortisation" amount={depr} indent={2} />
            <CRow label="Add: Finance Costs" amount={finCost} indent={2} />
            {hasPY ? <>
              <tr className="bg-slate-50/60"><td colSpan={2} className="px-3 py-1.5 text-xs font-semibold text-slate-500 uppercase">Working Capital Changes</td></tr>
              {wcItems.map((item,i)=><CRow key={i} label={item.label} amount={item.amount} indent={2} sub />)}
              <CRow label="Total Working Capital Changes" amount={workingCapitalChanges} indent bold={false} />
            </> : <CRow label="Working Capital Changes — upload prior year TB for details" amount={0} indent={2} sub />}
            <CRow label="Cash Generated from Operations" amount={operatingCashBeforeTax} bold />
            <CRow label="Less: Finance Costs Paid" amount={-finCost} indent />
          </>:<>
            <CRow label="Cash receipts from customers" amount={totalIncome} indent />
            <CRow label="Cash paid to suppliers and employees" amount={-Math.abs(totalExpense-depr-finCost)} indent />
          </>}
          <CRow label="Net Cash from Operating Activities (A)" amount={netOperating - finCost} bold />
          <SH label="B. Cash Flow from Investing Activities" />
          {hasPY ? <>
            {capexItems.map((it,i)=><CRow key={i} label={it.label} amount={it.amount} indent={2} sub />)}
            {investItems.map((it,i)=><CRow key={i} label={it.label} amount={it.amount} indent={2} sub />)}
            {(capexItems.length===0&&investItems.length===0) && <CRow label="No movement in NCA" amount={0} indent sub />}
          </> : <CRow label="Upload prior year TB for investing activities" amount={0} indent sub />}
          <CRow label="Net Cash from Investing Activities (B)" amount={netInvesting} bold />
          <SH label="C. Cash Flow from Financing Activities" />
          {hasPY ? <>
            {borrowItems.map((it,i)=><CRow key={i} label={it.label} amount={it.amount} indent={2} sub />)}
          </> : <CRow label="Upload prior year TB for financing activities" amount={0} indent sub />}
          <CRow label="Finance Costs Paid" amount={-finCost} indent={2} sub />
          <CRow label="Net Cash from Financing Activities (C)" amount={netFinancing} bold />
          <tr className="border-t-2 border-slate-700 bg-slate-50">
            <td className="px-3 py-3 font-bold text-slate-900 text-sm">Net Change in Cash and Cash Equivalents (A+B+C)</td>
            <td className="px-3 py-3 text-right font-mono font-bold">{fmt(netChange,D,locale)}</td>
          </tr>
          <CRow label={hasPY?'Cash and Cash Equivalents at Beginning of Year':'Cash and Cash Equivalents at Beginning of Year'} amount={openingCash} indent />
          <tr className="border-t-2 border-slate-700 bg-indigo-50">
            <td className="px-3 py-3 font-bold text-indigo-900 text-sm">Cash and Cash Equivalents at End of Year</td>
            <td className="px-3 py-3 text-right font-mono font-bold text-indigo-900">{fmt(cash,D,locale)}</td>
          </tr>
          {hasPY && Math.abs(cash - openingCash - netChange) > 1 && (
            <tr className="bg-red-50">
              <td className="px-3 py-2 text-xs text-red-600 italic" colSpan={2}>
                ⚠ CFS closing cash ({fmt(openingCash+netChange,D,locale)}) differs from BS cash ({fmt(cash,D,locale)}) by {fmt(Math.abs(cash-openingCash-netChange),D,locale)} — check investing/financing activities
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {!hasPY && <p className="text-xs text-slate-400 mt-2 italic">* Upload prior year TB to compute working capital changes and opening cash balance.</p>}
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
  const [searchParams]            = useSearchParams();
  const isPrintMode               = searchParams.get('print') === '1';
  const { currentEngagement, currentClient, firm } = useStore();
  const [data, setData]             = useState(null);
  const [hasPY, setHasPY]           = useState(false);
  const [loading, setLoading]       = useState(true);
  const [generating, setGenerating] = useState(false);
  const [tab, setTab]               = useState('BS');

  // Print mode: inject CSS to hide navigation and format for A4
  React.useEffect(() => {
    if (!isPrintMode) return;
    const style = document.createElement('style');
    style.id    = 'fs-print-styles';
    style.textContent = `
      @media screen {
        nav, aside, header, [data-print-hide], .no-print, button:not([data-print-show]) { display: none !important; }
        body, html { background: white !important; }
        .p-8, .px-8 { padding: 16px !important; }
      }
      @media print {
        nav, aside, header, [data-print-hide], .no-print, button:not([data-print-show]) { display: none !important; }
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: white; }
        .print-break { page-break-before: always; }
      }
    `;
    document.head.appendChild(style);
    document.title = 'Financial Statements — Print';
    return () => { const s = document.getElementById('fs-print-styles'); if (s) s.remove(); };
  }, [isPrintMode]);
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
