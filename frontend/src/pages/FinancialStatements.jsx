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
  // No decimals — whole numbers only in financial statements
  const s   = Math.round(abs).toLocaleString('en-IN');
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
function BSStatement({ lines, method, hidden, onHide, divisor, currSymbol, unitLabel }) {
  const cfg    = METHOD_CONFIG[method] || METHOD_CONFIG.AS;
  const D      = divisor;
  const isIFRS = method === 'IFRS' || method === 'IFRS_SME';
  const isIndAS = method === 'IND_AS';

  const vis    = lines.filter(l => !hidden[l.groupName]);
  const eq     = vis.filter(l => l.assetLiability === 'Equity');
  const liab   = vis.filter(l => l.assetLiability === 'Liabilities');
  const assets = vis.filter(l => l.assetLiability === 'Assets');

  // Split assets into Non-Current and Current by keywords
  // ── Universal Asset Classification ─────────────────────────────────────────
  // Rule 1: "short term" / "short-term" = ALWAYS Current Asset
  // Rule 2: "long term" / "long-term" (without "short") = ALWAYS Non-Current Asset
  // Rule 3: Specific keywords per category

  const isShortTerm = n => n.includes('short term') || n.includes('short-term');
  const isLongTerm  = n => (n.includes('long term') || n.includes('long-term')) && !isShortTerm(n);

  // ── Non-Current Asset keywords (all 4 methods) ────────────────────────────
  const NCA_KEYWORDS = [
    // Fixed Assets / PPE
    'property, plant','property plant','plant and equipment','plant & equipment',
    'fixed asset','tangible asset','ppe','freehold','leasehold improvement',
    'land','building','furniture','fixture','vehicle','motor car','motor vehicle',
    'plant and machinery','machinery','equipment','computer','office equipment',
    'electrical installation','air condition',
    // Right of Use (Ind AS / IFRS)
    'right-of-use','right of use','rou asset','lease right',
    // Intangibles
    'intangible','goodwill','software','trademark','patent','brand','copyright',
    'customer relationship','license','franchise',
    // Capital WIP
    'capital work in progress','capital wip','cwip','capital work-in-progress',
    'construction in progress','asset under construction',
    // Non-Current Investments (ALL investment types except "current investment")
    // Both hyphenated and non-hyphenated forms
    'non-current investment','non current investment',
    'long term investment','long-term investment',
    'investment in subsidiary','investment in associate',
    'investment in joint venture','investment in partnership',
    'investment in equity','quoted investment','unquoted investment',
    'investment in mutual fund','investment in bond','investment in debenture',
    'investment in preference share','investment in share',
    'investment in llp','investment in trust',
    // Deferred Tax Asset
    'deferred tax asset',
    // Security Deposits & Other NCA
    'security deposit','earnest money','retention money',
    'capital advance','advance for capital','advance against capital',
    'other non-current asset','other non current asset',
    'non-current asset','non current asset',
    // Long Term Loans Given (AS Schedule III specific)
    'long term loans and advance','long-term loans and advance',
    'long term loan and advance','long-term loan and advance',
  ];

  // ── Current Asset keywords (all 4 methods) ────────────────────────────────
  const CA_KEYWORDS = [
    // Inventories
    'inventor','stock','raw material','work in progress','work-in-progress','wip stock',
    'finished good','packing material','stores and spare','consumable','merchandise',
    // Trade Receivables
    'trade receivable','trade and other receivable','account receivable',
    'sundry debtor','debtor','bill receivable','note receivable',
    // Cash & Bank
    'cash in hand','cash in bank','cash at bank','cash and bank','cash and cash equivalent',
    'bank balance','petty cash','cheque in hand','demand deposit',
    // Short Term Investments
    'current investment','short term investment','short-term investment',
    'liquid fund','treasury bill','commercial paper',
    // Loans & Advances (Short Term / Current)
    'short term loans and advance','short-term loans and advance',
    'short term loan and advance','short-term loan and advance',
    'loans and advance','loan and advance',
    'advance to supplier','advance to vendor','advance paid','advance given',
    'advance to employee','advance to staff','prepaid expense','prepayment',
    // Other Current Assets
    'other receivable','other current asset','other asset',
    'accrued income','income receivable','interest receivable','dividend receivable',
    'due from','receivable from',
    'vat receivable','gst receivable','input tax credit','input gst',
    'income tax receivable','tax refund receivable','advance tax','tds receivable',
    'provision for bad debt','provision for doubtful debt',
    'export incentive receivable','subsidy receivable',
  ];

  const ncAssets = assets.filter(l => {
    const n = l.groupName?.toLowerCase() || '';
    if (isShortTerm(n)) return false;                          // short term → never NCA
    if (isLongTerm(n))  return true;                           // long term → always NCA
    if (NCA_KEYWORDS.some(k => n.includes(k))) return true;   // keyword match → NCA
    // "investment" alone (without "current invest" or "short term invest") = Non-Current
    if (n.includes('investment') && 
        !n.includes('current invest') && 
        !n.includes('short term invest') && 
        !n.includes('short-term invest') &&
        !isShortTerm(n)) return true;
    return false;
  });

  const cAssets = assets.filter(l => {
    const n = l.groupName?.toLowerCase() || '';
    if (isShortTerm(n)) return true;                           // short term → always CA
    if (isLongTerm(n))  return false;                          // long term → never CA
    if (NCA_KEYWORDS.some(k => n.includes(k))) return false;  // NCA keyword → not CA
    if (n.includes('investment') && 
        !n.includes('current invest') && 
        !n.includes('short term invest') &&
        !n.includes('short-term invest') &&
        !isShortTerm(n)) return false;
    return CA_KEYWORDS.some(k => n.includes(k));
  });

  const otherAssets = assets.filter(l => {
    const n = l.groupName?.toLowerCase() || '';
    if (isShortTerm(n)) return false;
    if (isLongTerm(n))  return false;
    if (NCA_KEYWORDS.some(k => n.includes(k))) return false;
    if (CA_KEYWORDS.some(k => n.includes(k)))  return false;
    if (n.includes('investment') && !n.includes('current invest') && !isShortTerm(n)) return false;
    return true; // unclassified — show after NCAs
  });

  // Split liabilities into Non-Current and Current
  // ── Non-Current Liability keywords ───────────────────────────────────────
  const NCL_KEYWORDS = [
    // Long Term Borrowings
    'long term borrowing','long-term borrowing','non-current borrowing',
    'term loan','debenture','bond','note payable long',
    'loan from bank','loan from financial institution','loan from nbfc',
    'foreign currency loan','ecb','external commercial borrowing',
    // Lease Liabilities (Ind AS / IFRS)
    'lease liabilit','finance lease','right-of-use liab',
    // Employee Benefits
    'provision for gratuity','gratuity liabilit','pension liabilit',
    'post employment benefit','defined benefit','employee benefit liabilit',
    'compensated absence','leave encashment liabilit',
    // Deferred Tax
    'deferred tax liabilit','deferred tax liab',
    // Other NCL
    'other non-current liabilit','other long term liabilit',
    'non-current liabilit','security deposit received',
    'deferred revenue long','deferred income long',
    'loan from related party long','loan from director long',
  ];

  // ── Current Liability keywords ─────────────────────────────────────────────
  const CL_KEYWORDS = [
    // Trade Payables
    'trade payable','trade and other payable','account payable',
    'sundry creditor','creditor','bill payable','note payable',
    // Borrowings (Short Term)
    'short term borrowing','short-term borrowing','working capital loan',
    'cash credit','bank overdraft','overdraft','packing credit',
    'loan repayable','current maturit','installment due',
    // Other Current Liabilities
    'other payable','other current liabilit','accrued expense','accrual',
    'statutory due','statutory liabilit',
    'advance from customer','advance received','customer deposit',
    'deferred revenue','deferred income',
    'unclaimed dividend','unpaid dividend','dividend payable',
    // Tax Liabilities
    'vat payable','gst payable','tax payable','income tax payable',
    'tds payable','service tax payable','duties and tax',
    'provision for tax','provision for income tax',
    // Employee Related (Current)
    'salary payable','wages payable','employee payable',
    'pf payable','esic payable','pt payable',
    // Related Party / Directors (Current)
    'directors loan','director loan','due to director',
    'loan from shareholder','shareholder loan',
    'due to related','due to subsidiary','due to associate',
    // Short Term Provisions
    'short term provision','provision for expense','provision for audit',
    'provision for warranty','proposed dividend',
  ];

  const ncLiab = liab.filter(l => {
    const n = l.groupName?.toLowerCase() || '';
    if (isShortTerm(n)) return false;                           // short term → never NCL
    if (isLongTerm(n))  return true;                            // long term → always NCL
    return NCL_KEYWORDS.some(k => n.includes(k));
  });

  const cLiab = liab.filter(l => {
    const n = l.groupName?.toLowerCase() || '';
    if (isShortTerm(n)) return true;                            // short term → always CL
    if (isLongTerm(n))  return false;                           // long term → never CL
    if (NCL_KEYWORDS.some(k => n.includes(k))) return false;   // NCL keyword → not CL
    return CL_KEYWORDS.some(k => n.includes(k));
  });

  const otherLiab = liab.filter(l => {
    const n = l.groupName?.toLowerCase() || '';
    if (isShortTerm(n)) return false;
    if (isLongTerm(n))  return false;
    if (NCL_KEYWORDS.some(k => n.includes(k))) return false;
    if (CL_KEYWORDS.some(k => n.includes(k)))  return false;
    return true; // unclassified → show in current liabilities by default
  });

  const totalNCA   = [...ncAssets, ...otherAssets].reduce((s,l) => s + Number(l.totalFinalNet||0), 0);
  const totalCA    = cAssets.reduce((s,l) => s + Number(l.totalFinalNet||0), 0);
  const totalAssets = totalNCA + totalCA;
  const totalEq    = eq.reduce((s,l) => s + Number(l.totalFinalNet||0), 0);
  const totalNCL   = ncLiab.reduce((s,l) => s + Number(l.totalFinalNet||0), 0);
  const totalCL    = [...cLiab, ...otherLiab].reduce((s,l) => s + Number(l.totalFinalNet||0), 0);
  const totalLiab  = totalNCL + totalCL;
  const totalEqLiab = totalEq + totalLiab;
  const diff = totalAssets - totalEqLiab;

  const Lines = ({ arr }) => arr.map((l,i) => (
    <Row key={i} label={l.groupName} note={l.noteGroup?.noteNumber}
      amount={Number(l.totalFinalNet)} indent={2} divisor={D}
      hideable onHide={() => onHide(l.groupName)} />
  ));

  // For AS/Ind AS: Equity & Liabilities first, then Assets
  // For IFRS: Assets first, then Equity & Liabilities
  const renderIFRS = () => (
    <>
      {/* ASSETS */}
      <Row label="ASSETS" section />
      <Row label="Non-Current Assets" subheader />
      <Lines arr={[...ncAssets, ...otherAssets]} />
      <Row label="Total Non-Current Assets" amount={totalNCA} bold borderTop divisor={D} />
      <Row label="Current Assets" subheader />
      <Lines arr={cAssets} />
      <Row label="Total Current Assets" amount={totalCA} bold borderTop divisor={D} />
      <Row label="TOTAL ASSETS" amount={totalAssets} bold borderTop divisor={D} />

      {/* EQUITY AND LIABILITIES */}
      <Row label="EQUITY AND LIABILITIES" section />
      <Row label="Equity" subheader />
      <Lines arr={eq} />
      <Row label="Total Equity" amount={totalEq} bold borderTop divisor={D} />

      {ncLiab.length > 0 && <>
        <Row label="Non-Current Liabilities" subheader />
        <Lines arr={ncLiab} />
        <Row label="Total Non-Current Liabilities" amount={totalNCL} bold borderTop divisor={D} />
      </>}

      <Row label="Current Liabilities" subheader />
      <Lines arr={[...cLiab, ...otherLiab]} />
      <Row label="Total Current Liabilities" amount={totalCL} bold borderTop divisor={D} />

      <Row label="TOTAL EQUITY AND LIABILITIES" amount={totalEqLiab} bold borderTop divisor={D} />
    </>
  );

  const renderIndian = () => (
    <>
      {/* EQUITY AND LIABILITIES first for AS/Ind AS */}
      <Row label="I. EQUITY AND LIABILITIES" section />
      <Row label="(1) Shareholders' Funds / Equity" subheader />
      <Lines arr={eq} />
      <Row label="Total Equity" amount={totalEq} bold borderTop divisor={D} />

      {ncLiab.length > 0 && <>
        <Row label="(2) Non-Current Liabilities" subheader />
        <Lines arr={ncLiab} />
        <Row label="Total Non-Current Liabilities" amount={totalNCL} bold borderTop divisor={D} />
      </>}

      <Row label={`(${ncLiab.length > 0 ? '3' : '2'}) Current Liabilities`} subheader />
      <Lines arr={[...cLiab, ...otherLiab]} />
      <Row label="Total Current Liabilities" amount={totalCL} bold borderTop divisor={D} />
      <Row label="TOTAL — EQUITY AND LIABILITIES" amount={totalEqLiab} bold borderTop divisor={D} />

      {/* ASSETS */}
      <Row label="II. ASSETS" section />
      <Row label="(1) Non-Current Assets" subheader />
      <Lines arr={[...ncAssets, ...otherAssets]} />
      <Row label="Total Non-Current Assets" amount={totalNCA} bold borderTop divisor={D} />
      <Row label="(2) Current Assets" subheader />
      <Lines arr={cAssets} />
      <Row label="Total Current Assets" amount={totalCA} bold borderTop divisor={D} />
      <Row label="TOTAL — ASSETS" amount={totalAssets} bold borderTop divisor={D} />
    </>
  );

  return (
    <div>
      <div className="text-center mb-5">
        <h2 className="text-lg font-bold uppercase tracking-wide">{cfg.bsTitle}</h2>
        <p className="text-sm text-slate-500">as at 31st March</p>
        <p className="text-xs text-slate-400 mt-0.5">
          {unitLabel}
        </p>
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
          {isIFRS ? renderIFRS() : renderIndian()}
        </tbody>
      </table>

      <div className={`mt-3 p-3 rounded-xl text-sm font-semibold text-right ${Math.abs(diff) < 1 ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
        {Math.abs(diff) < 1
          ? '✓ Balance Sheet tallies — Assets = Equity + Liabilities'
          : <>
              ⚠ Difference: {fmt(Math.abs(diff), D)} — Balance Sheet does not balance
              <div className="text-xs font-normal mt-1">
                Assets: {fmt(totalAssets, D)} | Equity: {fmt(totalEq, D)} | Liabilities: {fmt(totalLiab, D)}
              </div>
            </>
        }
      </div>
    </div>
  );
}

// ── Profit & Loss ─────────────────────────────────────────────────────────────
function PLStatement({ lines, method, divisor, currSymbol, unitLabel }) {
  const cfg    = METHOD_CONFIG[method] || METHOD_CONFIG.AS;
  const D      = divisor;
  const isIFRS = method === 'IFRS' || method === 'IFRS_SME';

  const plLines  = lines.filter(l => l.sheet === 'PL');
  const ociLines = lines.filter(l => l.sheet === 'OCI');

  // ── Categorise by keywords ───────────────────────────────────────────────
  const isIncome  = l => l.assetLiability === 'Income';
  const isExpense = l => l.assetLiability === 'Expenses';

  const revenueLines = plLines.filter(l => isIncome(l) &&
    ['revenue from operations','revenue from contracts','revenue','turnover','sales'].some(k=>l.groupName?.toLowerCase().includes(k)));
  const otherIncomeLines = plLines.filter(l => isIncome(l) &&
    !['revenue from operations','revenue from contracts','revenue','turnover','sales'].some(k=>l.groupName?.toLowerCase().includes(k)));
  const cosLines = plLines.filter(l => isExpense(l) && (() => {
    const n = l.groupName?.toLowerCase() || '';
    return n.includes('cost of sale') || n.includes('cost of good') ||
           n.includes('cost of material') || n.includes('cost of revenue') ||
           n.includes('cost of service') || n.includes('cost of product') ||
           n.includes('purchase of stock') || n.includes('purchase of good') ||
           n.includes('direct cost') || n.includes('direct expense') ||
           n.includes('cost of operation') || n.includes('project cost') ||
           n.includes('changes in inventor') || n.includes('change in inventor') ||
           n.includes('opening stock') || n.includes('closing stock') ||
           n.includes('material consumed') || n.includes('raw material consumed') ||
           n.includes('consumption of material') || n.includes('stores consumed') ||
           n.includes('subcontract') || n.includes('sub-contract') ||
           n.includes('job work') || n.includes('labour cost') || n.includes('labor cost') ||
           n.includes('cost of construction') || n.includes('erection cost') ||
           // If AS method, "purchases" alone typically = COGS
           (n === 'purchases' || n === 'purchase');
  })());
  const finCostLines = plLines.filter(l => isExpense(l) &&
    ['finance cost','interest expense','bank charge','bank interest','borrowing cost'].some(k=>l.groupName?.toLowerCase().includes(k)));
  const deprLines = plLines.filter(l => isExpense(l) &&
    ['depreciation','amortis','amortiz'].some(k=>l.groupName?.toLowerCase().includes(k)));
  const taxLines = plLines.filter(l => isExpense(l) &&
    ['tax expense','income tax expense','current tax','deferred tax expense'].some(k=>l.groupName?.toLowerCase().includes(k)));
  const sellingLines = plLines.filter(l => isExpense(l) &&
    ['selling','distribution','marketing','advertising'].some(k=>l.groupName?.toLowerCase().includes(k)) &&
    !taxLines.includes(l) && !finCostLines.includes(l) && !cosLines.includes(l));
  const adminLines = plLines.filter(l => isExpense(l) &&
    !cosLines.includes(l) && !finCostLines.includes(l) && !deprLines.includes(l) &&
    !taxLines.includes(l) && !sellingLines.includes(l));

  const sum = arr => arr.reduce((s,l) => s + Number(l.totalFinalNet||0), 0);

  const totalRevenue      = sum(revenueLines);
  const totalOtherIncome  = sum(otherIncomeLines);
  const totalCOS          = sum(cosLines);
  const grossProfit       = totalRevenue - totalCOS;
  const totalSelling      = sum(sellingLines);
  const totalAdmin        = sum(adminLines);
  const totalDepr         = sum(deprLines);
  const totalOpex         = totalSelling + totalAdmin + totalDepr;
  const operatingProfit   = grossProfit + totalOtherIncome - totalOpex;
  const totalFinCost      = sum(finCostLines);
  const pbt               = operatingProfit - totalFinCost;
  const totalTax          = sum(taxLines);
  const pat               = pbt - totalTax;
  const ociTotal          = sum(ociLines);
  const totalCI           = pat + ociTotal;

  const Blank = () => <tr><td colSpan={4} className="py-1.5 border-0"></td></tr>;

  return (
    <div>
      <div className="text-center mb-5">
        <h2 className="text-lg font-bold uppercase tracking-wide">{cfg.plTitle}</h2>
        <p className="text-sm text-slate-500">for the year ended 31st March</p>
        <p className="text-xs text-slate-400 mt-0.5">
          {unitLabel}
        </p>
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
          {/* 1. REVENUE */}
          <Row label="REVENUE" section />
          {revenueLines.map((l,i)=><Row key={i} label={l.groupName} note={l.noteGroup?.noteNumber} amount={Number(l.totalFinalNet)} indent={2} divisor={D} hideable/>)}
          <Row label="Total Revenue" amount={totalRevenue} bold borderTop divisor={D} />
          <Blank/>

          {/* 2. COST OF SALES — only show if company has COGS (not service companies) */}
          {cosLines.length > 0 && <>
            <Row label="Cost of Sales" subheader />
            {cosLines.map((l,i)=><Row key={i} label={l.groupName} note={l.noteGroup?.noteNumber} amount={Number(l.totalFinalNet)} indent={2} divisor={D} hideable/>)}
            <Row label="Total Cost of Sales" amount={totalCOS} bold borderTop divisor={D} />
            <Blank/>
          </>}

          {/* 3. GROSS PROFIT — only show if there are actual COGS lines */}
          {cosLines.length > 0 && <>
            <Row label="GROSS PROFIT / (LOSS)" amount={grossProfit} bold borderTop divisor={D} />
            <Blank/>
          </>}

          {/* OTHER INCOME — IFRS only: shown after Gross Profit */}
          {isIFRS && <>
            <Row label="Other Income" subheader />
            {otherIncomeLines.length > 0
              ? otherIncomeLines.map((l,i)=><Row key={i} label={l.groupName} note={l.noteGroup?.noteNumber} amount={Number(l.totalFinalNet)} indent={2} divisor={D} hideable/>)
              : <Row label="Other Income" amount={0} indent={2} divisor={D} />}
            <Blank/>
          </>}

          {/* 4. OTHER INCOME — for IFRS shown after GP, for AS shown in revenue section */}
          {!isIFRS && otherIncomeLines.length > 0 && <>
            <Row label="II. OTHER INCOME" subheader />
            {otherIncomeLines.map((l,i)=><Row key={i} label={l.groupName} note={l.noteGroup?.noteNumber} amount={Number(l.totalFinalNet)} indent={2} divisor={D} hideable/>)}
            <Row label="Total Income" amount={totalRevenue + totalOtherIncome} bold borderTop divisor={D} />
            <Blank/>
          </>}

          {/* 5. OPERATING EXPENSES */}
          <Row label="OPERATING EXPENSES" section />
          {sellingLines.length > 0 && <>
            <Row label="Distribution / Selling Expenses" subheader />
            {sellingLines.map((l,i)=><Row key={i} label={l.groupName} note={l.noteGroup?.noteNumber} amount={Number(l.totalFinalNet)} indent={2} divisor={D} hideable/>)}
          </>}
          {adminLines.length > 0 && <>
            <Row label="Administrative Expenses" subheader />
            {adminLines.map((l,i)=><Row key={i} label={l.groupName} note={l.noteGroup?.noteNumber} amount={Number(l.totalFinalNet)} indent={2} divisor={D} hideable/>)}
          </>}
          {deprLines.length > 0 && <>
            <Row label="Depreciation and Amortisation" subheader />
            {deprLines.map((l,i)=><Row key={i} label={l.groupName} note={l.noteGroup?.noteNumber} amount={Number(l.totalFinalNet)} indent={2} divisor={D} hideable/>)}
          </>}
          <Row label="Total Operating Expenses" amount={totalOpex} bold borderTop divisor={D} />
          <Blank/>

          {/* 6. OPERATING PROFIT */}
          <Row label="OPERATING PROFIT / (LOSS)" amount={operatingProfit} bold borderTop divisor={D} />
          <Blank/>

          {/* 7. FINANCE COSTS (always show) */}
          <Row label="Finance Costs" subheader />
          {finCostLines.length > 0
            ? finCostLines.map((l,i)=><Row key={i} label={l.groupName} note={l.noteGroup?.noteNumber} amount={Number(l.totalFinalNet)} indent={2} divisor={D} hideable/>)
            : <Row label="Finance Costs" amount={0} indent={2} divisor={D} />}
          <Blank/>

          {/* 8. PROFIT BEFORE TAX */}
          <Row label="PROFIT / (LOSS) BEFORE TAX" amount={pbt} bold borderTop divisor={D} />
          <Blank/>

          {/* 9. TAX EXPENSE */}
          <Row label="Tax Expense" subheader />
          {taxLines.length > 0
            ? taxLines.map((l,i)=><Row key={i} label={l.groupName} note={l.noteGroup?.noteNumber} amount={Number(l.totalFinalNet)} indent={2} divisor={D}/>)
            : <Row label="Income Tax Expense" amount={0} indent={2} divisor={D} />}
          <Blank/>

          {/* 10. PROFIT FOR THE YEAR */}
          <Row label="PROFIT / (LOSS) FOR THE YEAR" amount={pat} bold borderTop divisor={D} />

          {/* 11. OCI (IFRS / Ind AS) */}
          {cfg.hasOCI && <>
            <Blank/>
            <Row label="OTHER COMPREHENSIVE INCOME" section />
            <Row label="Items not reclassified to profit or loss" subheader />
            {ociLines.filter(l=>['actuarial','remeasurement','defined benefit'].some(k=>l.groupName?.toLowerCase().includes(k))).map((l,i)=>(
              <Row key={i} label={l.groupName} note={l.noteGroup?.noteNumber} amount={Number(l.totalFinalNet)} indent={2} divisor={D}/>
            ))}
            <Row label="Items that may be reclassified to profit or loss" subheader />
            {ociLines.filter(l=>!['actuarial','remeasurement','defined benefit'].some(k=>l.groupName?.toLowerCase().includes(k))).map((l,i)=>(
              <Row key={i} label={l.groupName} note={l.noteGroup?.noteNumber} amount={Number(l.totalFinalNet)} indent={2} divisor={D}/>
            ))}
            {ociLines.length === 0 && (
              <tr><td colSpan={4} className="px-10 py-1.5 text-xs text-slate-400 italic">No OCI items — map to OCI sheet in Mapping page if applicable</td></tr>
            )}
            <Row label="Total Other Comprehensive Income / (Loss)" amount={ociTotal} bold borderTop divisor={D} />
            <Blank/>
            <Row label="TOTAL COMPREHENSIVE INCOME FOR THE YEAR" amount={totalCI} bold borderTop divisor={D} />
          </>}

          <Blank/>
          {/* 12. EPS */}
          <Row label="Earnings Per Share (Face Value — see Note)" bold borderTop divisor={D} />
          <Row label="Basic EPS" amount={null} indent={2} divisor={D} />
          <Row label="Diluted EPS" amount={null} indent={2} divisor={D} />
        </tbody>
      </table>

      {/* Summary cards */}
      <div className="mt-4 grid grid-cols-4 gap-3">
        {[
          { label: 'Gross Profit',      value: grossProfit,     color: 'bg-blue-50 border-blue-200 text-blue-800' },
          { label: 'Operating Profit',  value: operatingProfit, color: 'bg-indigo-50 border-indigo-200 text-indigo-800' },
          { label: 'Profit Before Tax', value: pbt,             color: 'bg-amber-50 border-amber-200 text-amber-800' },
          { label: 'Profit After Tax',  value: pat,             color: pat >= 0 ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800' },
        ].map(s => (
          <div key={s.label} className={`border rounded-xl p-3 ${s.color}`}>
            <div className="text-xs font-medium opacity-70">{s.label}</div>
            <div className="text-base font-bold font-mono mt-1">{fmt(s.value, D)}</div>
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
  // Method is always authoritative for currency
  const currency = (method === 'IFRS' || method === 'IFRS_SME') ? 'AED'
    : (method === 'AS' || method === 'IND_AS') ? 'INR'
    : (currentClient?.region === 'UAE' || firm?.region === 'UAE') ? 'AED'
    : 'INR';
  const currSymbol  = currency;
  const cfg         = METHOD_CONFIG[method] || METHOD_CONFIG.AS;
  // Dynamic amount header — updates when unit changes
  const unitSuffix  = unit.value === 1 ? '' : ` in ${unit.label}`;
  const unitLabel   = currency === 'INR'
    ? `All amounts in ₹${unitSuffix}`
    : `All amounts in ${currency}${unitSuffix}`;
  // Financial closing date from engagement
  const closingDate = currentEngagement?.financialYear
    ? `As at 31 March ${currentEngagement.financialYear.split('-')[1] || currentEngagement.financialYear}`
    : '';

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
          <p className="text-slate-500 text-sm mt-0.5">{method} · {currentEngagement?.financialYear} · {closingDate && `Closing: ${closingDate}`}</p>
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
          {tab==='BS'   && <BSStatement   lines={allLines.filter(l=>l.sheet==='BS')} method={method} hidden={hidden} onHide={toggleHide} divisor={unit.value} currSymbol={currSymbol} unitLabel={unitLabel} />}
          {tab==='PL'   && <PLStatement   lines={allLines} method={method} divisor={unit.value} currSymbol={currSymbol} unitLabel={unitLabel} />}
          {tab==='CFS'  && <CFSStatement  bsLines={allLines.filter(l=>l.sheet==='BS')} plLines={allLines} method={method} cfsMethod={cfsMethod} onMethodChange={setCfsMethod} divisor={unit.value} currSymbol={currSymbol} />}
          {tab==='OCI'  && <OCIStatement  lines={allLines} divisor={unit.value} currSymbol={currSymbol} />}
          {tab==='SOCE' && <SOCEStatement bsLines={allLines.filter(l=>l.sheet==='BS')} plLines={allLines} divisor={unit.value} currSymbol={currSymbol} />}
        </>
      )}
    </div>
  );
}
