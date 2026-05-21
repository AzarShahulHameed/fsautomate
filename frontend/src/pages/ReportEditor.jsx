import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { reportAPI, exportAPI } from '../api/client';
import { useStore } from '../store';
import toast from 'react-hot-toast';

// ── Section metadata ──────────────────────────────────────────────────────────
const SECTION_META = {
  FIRST_PAGE:           { icon: '🏠', color: 'indigo', editorType: 'front_page',  desc: 'Company details, CIN, address, auditor name' },
  TABLE_OF_CONTENTS:    { icon: '📋', color: 'slate',  editorType: 'auto',        desc: 'Auto-generated from visible sections' },
  DIRECTOR_REPORT:      { icon: '👔', color: 'blue',   editorType: 'richtext',    desc: "Directors' Report — Companies Act 2013" },
  AUDITOR_REPORT:       { icon: '🔍', color: 'green',  editorType: 'richtext',    desc: "Independent Auditor's Report" },
  FINANCIAL_STATEMENTS: { icon: '📊', color: 'purple', editorType: 'auto',        desc: 'Auto-generated from TB data' },
  ACCOUNTING_POLICY:    { icon: '📜', color: 'amber',  editorType: 'richtext',    desc: 'Significant Accounting Policies' },
  SUGGESTIONS:          { icon: 'ℹ️',  color: 'cyan',   editorType: 'richtext',    desc: 'General Information about the company' },
  NOTES:                { icon: '📝', color: 'rose',   editorType: 'auto',        desc: 'Auto-generated from mapped TB data' },
  THANK_YOU:            { icon: '🙏', color: 'pink',   editorType: 'richtext',    desc: 'Closing page message' },
};

// ── Method-specific templates ─────────────────────────────────────────────────
const TEMPLATES = {
  DIRECTOR_REPORT: {
    AS: `<h1>Directors' Report</h1>
<p>To the Members of [Company Name],</p>
<p>Your Directors have pleasure in presenting the [XX]th Annual Report on the business and operations of the Company together with the Audited Financial Statements for the Financial Year ended 31st March [YEAR].</p>
<h2>1. Financial Summary / Highlights</h2>
<p>[Insert financial highlights table here]</p>
<h2>2. Dividend</h2>
<p>Your Directors do not recommend any dividend for the year under review.</p>
<h2>3. Reserves</h2>
<p>The Company proposes to transfer [amount] to General Reserve.</p>
<h2>4. Directors and Key Managerial Personnel</h2>
<p>[Details of Directors]</p>
<h2>5. Auditors</h2>
<p>M/s [Auditor Firm Name], Chartered Accountants, were appointed as Statutory Auditors of the Company at the [XX]th Annual General Meeting.</p>
<h2>6. Acknowledgements</h2>
<p>Your Directors place on record their sincere appreciation for the assistance and co-operation received from all stakeholders.</p>
<p>For and on behalf of the Board of Directors</p>
<p>[Director Name]<br/>Director<br/>DIN: [XXXXXXXX]</p>
<p>Place: [City]<br/>Date: [Date]</p>`,
    IND_AS: `<h1>Directors' Report</h1>
<p>To the Members of [Company Name],</p>
<p>Your Directors present the [XX]th Annual Report together with the Audited Financial Statements prepared in accordance with Indian Accounting Standards (Ind AS) for the Financial Year ended 31st March [YEAR].</p>
<h2>1. Financial Summary</h2>
<p>[Insert financial highlights]</p>
<h2>2. Ind AS Transition</h2>
<p>The Company has prepared these financial statements in accordance with the Companies (Indian Accounting Standards) Rules, 2015.</p>
<h2>3. Dividend</h2>
<p>[Dividend details]</p>
<h2>4. Directors and KMP</h2>
<p>[Director details]</p>
<h2>5. Statutory Auditors</h2>
<p>[Auditor details]</p>`,
    IFRS: `<h1>Board of Directors' Report</h1>
<p>To the Shareholders of [Company Name],</p>
<p>The Board of Directors presents the Annual Report and Audited Financial Statements prepared in accordance with International Financial Reporting Standards (IFRS) for the year ended 31st March [YEAR].</p>
<h2>1. Business Overview</h2>
<p>[Business description]</p>
<h2>2. Financial Performance</h2>
<p>[Financial highlights]</p>
<h2>3. Dividends</h2>
<p>[Dividend policy and declaration]</p>`,
    IFRS_SME: `<h1>Directors' Report</h1>
<p>To the Members of [Company Name],</p>
<p>The Directors present the Annual Report and Financial Statements prepared in accordance with IFRS for SMEs for the year ended 31st March [YEAR].</p>
<h2>1. Principal Activities</h2>
<p>[Company activities]</p>
<h2>2. Financial Results</h2>
<p>[Results summary]</p>`,
  },
  AUDITOR_REPORT: {
    AS: `<h1>Independent Auditor's Report</h1>
<p><strong>To the Members of [Company Name]</strong></p>
<h2>Report on the Audit of the Financial Statements</h2>
<h3>Opinion</h3>
<p>We have audited the accompanying financial statements of [Company Name] ("the Company"), which comprise the Balance Sheet as at 31st March [YEAR], the Statement of Profit and Loss, and notes to the financial statements, including a summary of significant accounting policies.</p>
<p>In our opinion and to the best of our information and according to the explanations given to us, the aforesaid financial statements give the information required by the Companies Act, 2013 in the manner so required and give a true and fair view in conformity with the accounting principles generally accepted in India.</p>
<h3>Basis for Opinion</h3>
<p>We conducted our audit in accordance with the Standards on Auditing (SAs) specified under section 143(10) of the Companies Act, 2013. Our responsibilities under those Standards are further described in the Auditor's Responsibilities section of our report.</p>
<h3>Key Audit Matters</h3>
<p>[Describe key audit matters]</p>
<h3>Management's Responsibility for the Financial Statements</h3>
<p>The Company's Board of Directors is responsible for the matters stated in section 134(5) of the Companies Act, 2013 with respect to the preparation of these financial statements.</p>
<h3>Auditor's Responsibilities for the Audit of the Financial Statements</h3>
<p>Our objectives are to obtain reasonable assurance about whether the financial statements as a whole are free from material misstatement, whether due to fraud or error.</p>
<h3>Report on Other Legal and Regulatory Requirements</h3>
<p>As required by the Companies (Auditor's Report) Order, 2020 ("the Order"), issued by the Central Government of India in terms of sub-section (11) of section 143 of the Act, we give in the "Annexure A" a statement on the matters specified in paragraphs 3 and 4 of the Order.</p>
<p>For [Audit Firm Name]<br/>Chartered Accountants<br/>Firm Registration No.: [XXXXXX]</p>
<p>[Partner Name]<br/>Partner<br/>Membership No.: [XXXXXX]</p>
<p>Place: [City]<br/>Date: [Date]</p>`,
    IND_AS: `<h1>Independent Auditor's Report</h1>
<p><strong>To the Members of [Company Name]</strong></p>
<h2>Opinion</h2>
<p>We have audited the financial statements of [Company Name] prepared in accordance with Indian Accounting Standards (Ind AS) prescribed under Section 133 of the Companies Act, 2013.</p>
<p>In our opinion, the financial statements give a true and fair view of the state of affairs, profit/loss and cash flows in conformity with Ind AS.</p>
<h2>Basis for Opinion</h2>
<p>We conducted our audit in accordance with Standards on Auditing (SAs). We are independent of the Company in accordance with the ICAI Code of Ethics.</p>
<h2>Key Audit Matters</h2>
<p>[Describe KAMs]</p>
<h2>Other Information</h2>
<p>[Management's responsibilities for other information]</p>`,
    IFRS: `<h1>Independent Auditor's Report</h1>
<p><strong>To the Shareholders of [Company Name]</strong></p>
<h2>Opinion</h2>
<p>We have audited the financial statements of [Company Name] which comprise the Statement of Financial Position as at 31st March [YEAR], and the Statement of Profit or Loss and Other Comprehensive Income, Statement of Changes in Equity and Statement of Cash Flows for the year then ended, and notes to the financial statements prepared in accordance with International Financial Reporting Standards (IFRS).</p>
<p>In our opinion, the financial statements present fairly, in all material respects, the financial position of the Company in accordance with IFRS.</p>
<h2>Basis for Opinion</h2>
<p>We conducted our audit in accordance with International Standards on Auditing (ISA).</p>`,
    IFRS_SME: `<h1>Auditor's Report</h1>
<p><strong>To the Members of [Company Name]</strong></p>
<h2>Opinion</h2>
<p>We have audited the financial statements of [Company Name] prepared in accordance with the International Financial Reporting Standard for Small and Medium-sized Entities (IFRS for SMEs).</p>
<p>In our opinion, the financial statements present fairly the financial position and performance of the Company.</p>`,
  },
  ACCOUNTING_POLICY: {
    AS: `<h1>Significant Accounting Policies</h1>
<h2>1. Basis of Preparation</h2>
<p>The financial statements have been prepared in accordance with Generally Accepted Accounting Principles in India (Indian GAAP) under the historical cost convention on the accrual basis of accounting and in compliance with the provisions of the Companies Act, 2013 and the Accounting Standards specified under Section 133 of the Companies Act, 2013.</p>
<h2>2. Use of Estimates</h2>
<p>The preparation of financial statements requires management to make estimates and assumptions that affect the reported amounts of assets, liabilities, revenues and expenses.</p>
<h2>3. Fixed Assets</h2>
<p>Fixed assets are stated at cost less accumulated depreciation. Cost includes purchase price, taxes, duties, freight and other directly attributable costs.</p>
<h2>4. Depreciation</h2>
<p>Depreciation is provided on the Written Down Value (WDV) method at the rates prescribed under Schedule II of the Companies Act, 2013.</p>
<h2>5. Inventories</h2>
<p>Inventories are valued at lower of cost and net realisable value. Cost is determined on First-in First-out (FIFO) basis.</p>
<h2>6. Revenue Recognition</h2>
<p>Revenue is recognised on accrual basis. Revenue from sale of goods is recognised when significant risks and rewards of ownership are transferred.</p>
<h2>7. Foreign Currency Transactions</h2>
<p>Foreign currency transactions are recorded at exchange rates prevailing on the date of transactions. Monetary items are restated at year-end rates.</p>
<h2>8. Taxes on Income</h2>
<p>Current tax is determined as the tax payable on taxable income for the year. Deferred tax is recognised on timing differences using enacted tax rates.</p>
<h2>9. Provisions and Contingencies</h2>
<p>Provisions are recognised when the Company has a present obligation as a result of past events and it is probable that an outflow will be required to settle the obligation.</p>
<h2>10. Employee Benefits</h2>
<p>Short-term employee benefits are recognised as an expense at the undiscounted amount. Defined benefit plans are accounted for on actuarial valuation basis.</p>`,
    IND_AS: `<h1>Significant Accounting Policies</h1>
<h2>1. Basis of Preparation</h2>
<p>These financial statements have been prepared in accordance with Indian Accounting Standards (Ind AS) as notified under the Companies (Indian Accounting Standards) Rules, 2015 on a historical cost basis, except for certain financial instruments which are measured at fair value.</p>
<h2>2. Property, Plant and Equipment</h2>
<p>PPE is measured at cost less accumulated depreciation and accumulated impairment losses. Depreciation is provided on a straight-line basis over the useful lives as prescribed in Schedule II of the Companies Act, 2013.</p>
<h2>3. Financial Instruments (Ind AS 109)</h2>
<p>Financial assets are classified and measured at amortised cost, Fair Value through Other Comprehensive Income (FVOCI), or Fair Value through Profit or Loss (FVTPL), based on the business model and contractual cash flow characteristics.</p>
<h2>4. Leases (Ind AS 116)</h2>
<p>The Company recognises a right-of-use asset and a corresponding lease liability at the lease commencement date.</p>
<h2>5. Revenue Recognition (Ind AS 115)</h2>
<p>Revenue is recognised when performance obligations are satisfied. The five-step model under Ind AS 115 is applied.</p>
<h2>6. Employee Benefits (Ind AS 19)</h2>
<p>Defined benefit plans: The liability is measured using the projected unit credit method. Actuarial gains and losses are recognised in OCI.</p>
<h2>7. Income Taxes (Ind AS 12)</h2>
<p>Deferred tax assets and liabilities are measured at tax rates expected to apply when realised, using enacted rates.</p>
<h2>8. Impairment (Ind AS 36 / Ind AS 109)</h2>
<p>Non-financial assets are tested for impairment annually. Financial assets use the Expected Credit Loss (ECL) model.</p>`,
    IFRS: `<h1>Notes to the Financial Statements</h1>
<h2>1. Corporate Information</h2>
<p>[Company Name] is incorporated under [jurisdiction] laws. The principal activities are [describe activities].</p>
<h2>2. Basis of Preparation</h2>
<p>These financial statements have been prepared in accordance with International Financial Reporting Standards (IFRS) as issued by the IASB, on a historical cost basis except for financial instruments measured at fair value.</p>
<h2>3. IFRS 15 — Revenue from Contracts with Customers</h2>
<p>Revenue is recognised when (or as) performance obligations are satisfied by transferring promised goods or services to customers.</p>
<h2>4. IFRS 16 — Leases</h2>
<p>Right-of-use assets and lease liabilities are recognised at the commencement date of the lease.</p>
<h2>5. IFRS 9 — Financial Instruments</h2>
<p>Financial assets are classified at amortised cost, FVOCI or FVTPL. Impairment uses the expected credit loss model.</p>
<h2>6. IAS 19 — Employee Benefits</h2>
<p>Defined benefit obligations are measured using the projected unit credit method. Remeasurements are recognised in OCI.</p>
<h2>7. IAS 12 — Income Taxes</h2>
<p>Deferred tax is provided using the liability method on temporary differences between carrying amounts and tax bases.</p>
<h2>8. IAS 36 — Impairment of Assets</h2>
<p>Assets are tested for impairment when there is an indication of impairment. Goodwill is tested annually.</p>`,
    IFRS_SME: `<h1>Accounting Policies</h1>
<h2>1. Basis of Preparation</h2>
<p>These financial statements are prepared in accordance with the International Financial Reporting Standard for Small and Medium-sized Entities (IFRS for SMEs) issued by the IASB.</p>
<h2>2. Revenue</h2>
<p>Revenue is measured at the fair value of the consideration received or receivable.</p>
<h2>3. Property, Plant and Equipment</h2>
<p>PPE is measured using the cost model. Depreciation is provided over the useful economic life of each asset.</p>
<h2>4. Financial Instruments</h2>
<p>Basic financial instruments are accounted for at amortised cost. Other financial instruments are measured at fair value through profit or loss.</p>
<h2>5. Employee Benefits</h2>
<p>Short-term employee benefits are measured on an undiscounted basis. Post-employment obligations use the projected unit credit method.</p>`,
  },
  SUGGESTIONS: {
    AS: `<h1>General Information</h1>
<h2>Company Overview</h2>
<p><strong>Name of Company:</strong> [Company Name]</p>
<p><strong>CIN:</strong> [UXXXXXXXX]</p>
<p><strong>Registered Office:</strong> [Address]</p>
<p><strong>Corporate Office:</strong> [Address]</p>
<p><strong>PAN:</strong> [XXXXXXXXXXX]</p>
<p><strong>GST Number:</strong> [XXXXXXXXXXXXXXXXX]</p>
<h2>Board of Directors</h2>
<p>[Director Name] — Managing Director<br/>DIN: [XXXXXXXX]</p>
<p>[Director Name] — Non-Executive Director<br/>DIN: [XXXXXXXX]</p>
<h2>Key Managerial Personnel</h2>
<p>[CFO Name] — Chief Financial Officer</p>
<p>[CS Name] — Company Secretary</p>
<h2>Statutory Auditors</h2>
<p>M/s [Firm Name], Chartered Accountants</p>
<h2>Bankers</h2>
<p>[Bank Name], [Branch]</p>
<h2>Registrar and Transfer Agent</h2>
<p>[RTA Name and Address]</p>`,
    IFRS: `<h1>General Information</h1>
<h2>Corporate Details</h2>
<p><strong>Company Name:</strong> [Name]</p>
<p><strong>Country of Incorporation:</strong> [Country]</p>
<p><strong>Registered Address:</strong> [Address]</p>
<p><strong>Principal Business:</strong> [Description]</p>
<h2>Directors</h2>
<p>[Names and roles of directors]</p>
<h2>External Auditors</h2>
<p>[Audit firm details]</p>`,
  },
  THANK_YOU: {
    AS: `<p>We extend our sincere gratitude to all our stakeholders — shareholders, customers, employees, bankers, and regulatory authorities — for their continued trust and support.</p>`,
    IFRS: `<p>We thank all our stakeholders for their continued confidence and support in our growth journey.</p>`,
  },
};

function getTemplate(sectionType, method) {
  const methodTemplates = TEMPLATES[sectionType];
  if (!methodTemplates) return '';
  return methodTemplates[method] || methodTemplates['AS'] || '';
}

// ── Toolbar button ────────────────────────────────────────────────────────────
function ToolBtn({ onClick, active, title, children }) {
  return (
    <button
      onMouseDown={e => { e.preventDefault(); onClick(); }}
      title={title}
      className={`px-2 py-1 text-sm rounded border transition-colors ${active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'}`}
    >
      {children}
    </button>
  );
}

// ── Rich Text Editor (ContentEditable) ───────────────────────────────────────
function RichEditor({ value, onChange }) {
  const ref = useRef(null);
  const lastHtml = useRef(value);

  // Only update DOM if external change (avoid cursor jumping)
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value || '';
      lastHtml.current = value;
    }
  }, [value]);

  const exec = (cmd, val) => {
    ref.current?.focus();
    document.execCommand(cmd, false, val);
    handleChange();
  };

  const handleChange = () => {
    const html = ref.current?.innerHTML || '';
    if (html !== lastHtml.current) {
      lastHtml.current = html;
      onChange(html);
    }
  };

  const isActive = (cmd) => {
    try { return document.queryCommandState(cmd); } catch { return false; }
  };

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden flex flex-col" style={{ minHeight: '500px' }}>
      {/* Toolbar */}
      <div className="flex flex-wrap gap-1 p-2 bg-slate-50 border-b border-slate-200">
        <ToolBtn onClick={() => exec('bold')} active={isActive('bold')} title="Bold (Ctrl+B)"><b>B</b></ToolBtn>
        <ToolBtn onClick={() => exec('italic')} active={isActive('italic')} title="Italic (Ctrl+I)"><i>I</i></ToolBtn>
        <ToolBtn onClick={() => exec('underline')} active={isActive('underline')} title="Underline (Ctrl+U)"><u>U</u></ToolBtn>
        <div className="w-px bg-slate-300 mx-1" />
        <ToolBtn onClick={() => exec('formatBlock', 'h1')} title="Heading 1">H1</ToolBtn>
        <ToolBtn onClick={() => exec('formatBlock', 'h2')} title="Heading 2">H2</ToolBtn>
        <ToolBtn onClick={() => exec('formatBlock', 'h3')} title="Heading 3">H3</ToolBtn>
        <ToolBtn onClick={() => exec('formatBlock', 'p')} title="Paragraph">¶</ToolBtn>
        <div className="w-px bg-slate-300 mx-1" />
        <ToolBtn onClick={() => exec('insertUnorderedList')} title="Bullet List">• List</ToolBtn>
        <ToolBtn onClick={() => exec('insertOrderedList')} title="Numbered List">1. List</ToolBtn>
        <div className="w-px bg-slate-300 mx-1" />
        <ToolBtn onClick={() => exec('justifyLeft')} title="Left">⬅</ToolBtn>
        <ToolBtn onClick={() => exec('justifyCenter')} title="Center">↔</ToolBtn>
        <ToolBtn onClick={() => exec('justifyRight')} title="Right">➡</ToolBtn>
        <div className="w-px bg-slate-300 mx-1" />
        <ToolBtn onClick={() => exec('undo')} title="Undo">↩</ToolBtn>
        <ToolBtn onClick={() => exec('redo')} title="Redo">↪</ToolBtn>
        <div className="w-px bg-slate-300 mx-1" />
        <select
          onChange={e => exec('fontSize', e.target.value)}
          className="text-sm border border-slate-300 rounded px-1 py-0.5 bg-white"
          defaultValue=""
        >
          <option value="" disabled>Font Size</option>
          {[1,2,3,4,5,6,7].map(s => <option key={s} value={s}>{[8,10,12,14,18,24,36][s-1]}pt</option>)}
        </select>
        <select
          onChange={e => exec('foreColor', e.target.value)}
          className="text-sm border border-slate-300 rounded px-1 py-0.5 bg-white"
          defaultValue=""
        >
          <option value="" disabled>Color</option>
          {[['Black','#000000'],['Dark Blue','#1e3a5f'],['Blue','#2563eb'],['Red','#dc2626'],['Green','#16a34a'],['Gray','#6b7280']].map(([l,v])=>(
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>

      {/* Editor area */}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={handleChange}
        onKeyUp={handleChange}
        onBlur={handleChange}
        className="flex-1 p-5 focus:outline-none prose prose-sm max-w-none overflow-y-auto"
        style={{ minHeight: '460px', fontFamily: 'Calibri, Georgia, serif', fontSize: '14px', lineHeight: '1.7' }}
      />
    </div>
  );
}

// ── Front Page Form ───────────────────────────────────────────────────────────
function FrontPageEditor({ value, onChange }) {
  const [form, setForm] = useState(() => {
    try { return JSON.parse(value || '{}'); } catch { return {}; }
  });

  const update = (field, val) => {
    const next = { ...form, [field]: val };
    setForm(next);
    onChange(JSON.stringify(next));
  };

  const fields = [
    { key: 'companyName', label: 'Company Name', placeholder: 'Acme Private Limited' },
    { key: 'cin', label: 'CIN', placeholder: 'U12345MH2020PTC123456' },
    { key: 'pan', label: 'PAN', placeholder: 'AAAAA0000A' },
    { key: 'gstin', label: 'GSTIN', placeholder: '29AAAAA0000A1Z5' },
    { key: 'address', label: 'Registered Office Address', placeholder: '123, Main Street, Mumbai - 400001' },
    { key: 'auditorName', label: 'Statutory Auditors', placeholder: 'M/s XYZ & Associates, Chartered Accountants' },
    { key: 'auditorReg', label: 'Auditor Firm Reg. No.', placeholder: '012345N' },
    { key: 'bankers', label: 'Bankers', placeholder: 'State Bank of India, Mumbai' },
    { key: 'rta', label: 'Registrar & Transfer Agent', placeholder: 'Link Intime India Pvt Ltd' },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-sm text-indigo-700">
        Fill in company details. These appear on the Front Page and are referenced throughout the report.
      </div>
      <div className="grid grid-cols-2 gap-4">
        {fields.map(f => (
          <div key={f.key} className={f.key === 'address' ? 'col-span-2' : ''}>
            <label className="block text-sm font-medium text-slate-700 mb-1">{f.label}</label>
            {f.key === 'address' ? (
              <textarea
                value={form[f.key] || ''}
                onChange={e => update(f.key, e.target.value)}
                placeholder={f.placeholder}
                rows={3}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
              />
            ) : (
              <input
                value={form[f.key] || ''}
                onChange={e => update(f.key, e.target.value)}
                placeholder={f.placeholder}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Auto Section Preview ──────────────────────────────────────────────────────
function AutoSectionPreview({ sectionType }) {
  return (
    <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl p-8 text-center">
      <div className="text-4xl mb-3">{SECTION_META[sectionType]?.icon}</div>
      <p className="font-semibold text-slate-700">This section is auto-generated</p>
      <p className="text-slate-500 text-sm mt-1">{SECTION_META[sectionType]?.desc}</p>
      {sectionType === 'NOTES' && (
        <p className="text-slate-400 text-xs mt-2">Go to the Notes page to toggle which notes appear in the export</p>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function ReportEditor() {
  const { engagementId } = useParams();
  const navigate = useNavigate();
  const { currentEngagement } = useStore();
  const method = currentEngagement?.method || 'AS';

  const [sections, setSections]     = useState([]);
  const [activeId, setActiveId]     = useState(null);
  const [content, setContent]       = useState('');
  const [saving, setSaving]         = useState(false);
  const [exporting, setExporting]   = useState('');
  const [loading, setLoading]       = useState(true);
  const autoSaveTimer               = useRef(null);

  useEffect(() => { load(); }, [engagementId]);

  async function load() {
    setLoading(true);
    try {
      const data = await reportAPI.sections(engagementId);
      setSections(data);
      if (data.length > 0) {
        setActiveId(data[0].id);
        setContent(data[0].content || '');
      }
    } catch { toast.error('Failed to load report sections'); }
    finally { setLoading(false); }
  }

  const activeSection = sections.find(s => s.id === activeId);

  // Switch section
  function selectSection(s) {
    if (activeId === s.id) return;
    // Save current before switching
    if (activeSection) saveSection(activeSection.id, content);
    setActiveId(s.id);
    setContent(s.content || '');
  }

  // Auto-save on content change
  function handleContentChange(html) {
    setContent(html);
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      if (activeId) saveSection(activeId, html, true);
    }, 2000);
  }

  async function saveSection(sectionId, html, silent = false) {
    if (!sectionId) return;
    if (!silent) setSaving(true);
    try {
      await reportAPI.saveSection(engagementId, sectionId, { content: html });
      // Update local state
      setSections(prev => prev.map(s => s.id === sectionId ? { ...s, content: html } : s));
      if (!silent) toast.success('Saved');
    } catch { if (!silent) toast.error('Save failed'); }
    finally { if (!silent) setSaving(false); }
  }

  async function toggleVisibility(section) {
    const next = !section.isVisible;
    setSections(prev => prev.map(s => s.id === section.id ? { ...s, isVisible: next } : s));
    try {
      await reportAPI.saveSection(engagementId, section.id, { isVisible: next });
    } catch { toast.error('Failed to update visibility'); }
  }

  function loadTemplate() {
    if (!activeSection) return;
    const tpl = getTemplate(activeSection.sectionType, method);
    if (!tpl) { toast('No template available for this section'); return; }
    if (content && !window.confirm('This will replace your current content with the template. Continue?')) return;
    setContent(tpl);
    handleContentChange(tpl);
  }

  async function downloadWord() {
    // Save current section first
    if (activeId) await saveSection(activeId, content, true);
    setExporting('word');
    try {
      const blob = await exportAPI.word(engagementId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `financial-report-${currentEngagement?.financialYear || 'report'}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Word document downloaded');
    } catch (err) { toast.error(err?.error || 'Export failed'); }
    finally { setExporting(''); }
  }

  async function downloadExcel() {
    setExporting('excel');
    try {
      const blob = await exportAPI.excel(engagementId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `financial-statements-${currentEngagement?.financialYear || 'report'}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Excel workbook downloaded');
    } catch (err) { toast.error(err?.error || 'Export failed'); }
    finally { setExporting(''); }
  }

  const sectionColor = (s) => {
    const meta = SECTION_META[s.sectionType];
    if (!s.isVisible) return 'opacity-50';
    if (s.id === activeId) return 'bg-indigo-600 text-white border-indigo-600';
    return 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50';
  };

  if (loading) return <div className="p-8 text-slate-400">Loading report sections...</div>;

  return (
    <div className="flex h-full" style={{ height: 'calc(100vh - 64px)' }}>

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <div className="w-72 flex-shrink-0 bg-slate-50 border-r border-slate-200 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-200">
          <h2 className="font-bold text-slate-800 text-sm">Report Builder</h2>
          <p className="text-xs text-slate-500 mt-0.5">{method} · {currentEngagement?.financialYear}</p>
        </div>

        {/* Section list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {sections.map((s, i) => (
            <div key={s.id} className="relative group">
              <button
                onClick={() => selectSection(s)}
                className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-all ${sectionColor(s)}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">{SECTION_META[s.sectionType]?.icon || '📄'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{s.title}</div>
                    <div className={`text-xs mt-0.5 truncate ${s.id === activeId ? 'text-indigo-200' : 'text-slate-400'}`}>
                      {SECTION_META[s.sectionType]?.editorType === 'auto' ? 'Auto-generated' : 'Editable'}
                    </div>
                  </div>
                  {/* Visibility toggle */}
                  <button
                    onClick={e => { e.stopPropagation(); toggleVisibility(s); }}
                    className={`text-xs px-1.5 py-0.5 rounded ${s.isVisible ? 'text-green-600 hover:text-red-500' : 'text-red-400 hover:text-green-600'}`}
                    title={s.isVisible ? 'Hide from export' : 'Include in export'}
                  >
                    {s.isVisible ? '👁' : '🙈'}
                  </button>
                </div>
              </button>
            </div>
          ))}
        </div>

        {/* Export buttons */}
        <div className="p-3 border-t border-slate-200 space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Export</p>
          <button onClick={downloadWord} disabled={!!exporting}
            className="w-full py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
            {exporting === 'word' ? '⏳ Generating...' : '📄 Download Word (.docx)'}
          </button>
          <button onClick={downloadExcel} disabled={!!exporting}
            className="w-full py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2">
            {exporting === 'excel' ? '⏳ Generating...' : '📊 Download Excel (.xlsx)'}
          </button>
        </div>
      </div>

      {/* ── Editor Area ──────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-white">
        {activeSection ? (
          <>
            {/* Editor header */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 bg-white flex-shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{SECTION_META[activeSection.sectionType]?.icon}</span>
                <div>
                  <h1 className="font-bold text-slate-800">{activeSection.title}</h1>
                  <p className="text-xs text-slate-400">{SECTION_META[activeSection.sectionType]?.desc}</p>
                </div>
              </div>
              <div className="flex gap-2">
                {SECTION_META[activeSection.sectionType]?.editorType === 'richtext' && (
                  <button onClick={loadTemplate}
                    className="px-3 py-1.5 border border-amber-400 text-amber-700 text-sm rounded-lg hover:bg-amber-50">
                    📋 Load {method} Template
                  </button>
                )}
                {SECTION_META[activeSection.sectionType]?.editorType !== 'auto' && (
                  <button onClick={() => saveSection(activeSection.id, content)} disabled={saving}
                    className="px-4 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                    {saving ? 'Saving...' : '💾 Save'}
                  </button>
                )}
                {/* Visibility badge */}
                <span className={`px-2.5 py-1.5 text-xs rounded-lg font-medium ${activeSection.isVisible ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                  {activeSection.isVisible ? '✓ In Export' : '✗ Hidden'}
                </span>
              </div>
            </div>

            {/* Editor content */}
            <div className="flex-1 overflow-y-auto p-6">
              {SECTION_META[activeSection.sectionType]?.editorType === 'auto' ? (
                <AutoSectionPreview sectionType={activeSection.sectionType} />
              ) : activeSection.sectionType === 'FIRST_PAGE' ? (
                <FrontPageEditor value={content} onChange={handleContentChange} />
              ) : (
                <RichEditor value={content} onChange={handleContentChange} />
              )}
            </div>

            {/* Auto-save indicator */}
            <div className="px-6 py-2 border-t border-slate-100 bg-slate-50 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
              <span className="text-xs text-slate-400">Auto-saves every 2 seconds · Last saved: {new Date().toLocaleTimeString()}</span>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400">
            <div className="text-center">
              <div className="text-5xl mb-3">📄</div>
              <p>Select a section from the sidebar to start editing</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
