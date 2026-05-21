// seeds/seed.js
// ─────────────────────────────────────────────────────────────────────────────
// SEEDS the MasterGrouping table from the Excel data you provided.
// Run: node seeds/seed.js
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ── BS GROUPING (from your Excel: grouping_for_As_Method.xlsx)
// Format: [groupName, assetLiability, subGroupNo, subGroupName, noteGroupId, methodApplicability]
const BS_DATA = [
  ['Share capital','Liabilities','BS-SC1','Share capital','NG-SHARE-CAPITAL','ALL'],
  ['Share capital','Liabilities','BS-SC2','Equity share capital','NG-SHARE-CAPITAL','ALL'],
  ['Share capital','Liabilities','BS-SC3','Preference share capital','NG-SHARE-CAPITAL','ALL'],
  ['Share capital','Liabilities','BS-SC4','Calls in arrears','NG-SHARE-CAPITAL','ALL'],
  ['Share capital','Liabilities','BS-SC5','Forfeited shares','NG-SHARE-CAPITAL','ALL'],
  ['Share capital','Liabilities','BS-SC6','Other share capital','NG-SHARE-CAPITAL','ALL'],
  ['Share application money pending allotment','Liabilities','BS-Share application','Share application money pending allotment','NG-SHARE-APPLICATION','ALL'],
  ['R&S - Capital Reserves','Liabilities','BS1','Balance as at the end of the year','NG-RESERVES','ALL'],
  ['R&S - Capital Redemption Reserve','Liabilities','BS2','Balance as at the end of the year','NG-RESERVES','ALL'],
  ['R&S - Securities Premium','Liabilities','BS3','Balance as at the end of the year','NG-RESERVES','ALL'],
  ['R&S - Debenture Redemption Reserve','Liabilities','BS4','Balance as at the end of the year','NG-RESERVES','ALL'],
  ['R&S - Revaluation Reserve','Liabilities','BS5','Balance as at the end of the year','NG-RESERVES','ALL'],
  ['R&S - Share Options Outstanding Account','Liabilities','BS6','Balance as at the end of the year','NG-RESERVES','ALL'],
  ['R&S - Other Reserves','Liabilities','BS7','Balance as at the end of the year','NG-RESERVES','ALL'],
  ['R&S - Surplus in Statement of Profit and Loss','Liabilities','BS8','Balance as at the end of the year','NG-RESERVES','ALL'],
  ['Money received against share warrants','Liabilities','BS9','Money received against share warrants','NG-WARRANTS','ALL'],
  ['Minority Interest','Liabilities','BSMI','Minority Interest','NG-MINORITY','ALL'],
  ['Long Term Borrowings','Liabilities','BS10','Bonds','NG-LT-BORROWINGS','ALL'],
  ['Long Term Borrowings','Liabilities','BS11','Debentures','NG-LT-BORROWINGS','ALL'],
  ['Long Term Borrowings','Liabilities','BS12','Term loans (i) From banks','NG-LT-BORROWINGS','ALL'],
  ['Long Term Borrowings','Liabilities','BS13','Term loans (ii) From other parties','NG-LT-BORROWINGS','ALL'],
  ['Long Term Borrowings','Liabilities','BS14','Deferred payment liabilities','NG-LT-BORROWINGS','ALL'],
  ['Long Term Borrowings','Liabilities','BS15','Deposits','NG-LT-BORROWINGS','ALL'],
  ['Long Term Borrowings','Liabilities','BS16','Loans and advances from directors','NG-LT-BORROWINGS','ALL'],
  ['Long Term Borrowings','Liabilities','BS17','Loans and advances from other related parties','NG-LT-BORROWINGS','ALL'],
  ['Long Term Borrowings','Liabilities','BS18','Long term maturities of finance lease obligations','NG-LT-BORROWINGS','ALL'],
  ['Deferred Tax Liability (Net)','Liabilities','BS44','Property, Plant and Equipment and Intangible assets','NG-DTL','ALL'],
  ['Deferred Tax Liability (Net)','Liabilities','BS55','Provision for Gratuity','NG-DTL','ALL'],
  ['Deferred Tax Liability (Net)','Liabilities','BS56','Provision for Leave encashment','NG-DTL','ALL'],
  ['Deferred Tax Liability (Net)','Liabilities','BS57','Unused tax losses','NG-DTL','ALL'],
  ['Other Long term liabilities','Liabilities','BS67','Trade payables','NG-OTHER-LT-LIAB','ALL'],
  ['Other Long term liabilities','Liabilities','BS68','Deferred Income','NG-OTHER-LT-LIAB','ALL'],
  ['Other Long term liabilities','Liabilities','BS69','Deferred rent','NG-OTHER-LT-LIAB','ALL'],
  ['Long Term Provisions','Liabilities','BS76','Provision for Expenses','NG-LT-PROVISIONS','ALL'],
  ['Long Term Provisions','Liabilities','BS77','Provision for Gratuity','NG-LT-PROVISIONS','ALL'],
  ['Long Term Provisions','Liabilities','BS78','Provision for Leave encashment','NG-LT-PROVISIONS','ALL'],
  ['Short-term Borrowings','Liabilities','BS88','Loans repayable on demand','NG-ST-BORROWINGS','ALL'],
  ['Short-term Borrowings','Liabilities','BS89','Loans and advances from Directors','NG-ST-BORROWINGS','ALL'],
  ['Short-term Borrowings','Liabilities','BS90','Loans and advances from other related parties','NG-ST-BORROWINGS','ALL'],
  ['Short-term Borrowings','Liabilities','BS91','Current maturities of Long term borrowings','NG-ST-BORROWINGS','ALL'],
  ['Short-term Borrowings','Liabilities','BS92','Deposits','NG-ST-BORROWINGS','ALL'],
  ['Trade Payables','Liabilities','BS114','Outstanding dues of micro enterprises and small enterprises','NG-TRADE-PAYABLES','ALL'],
  ['Trade Payables','Liabilities','BS115','Outstanding dues of other creditors','NG-TRADE-PAYABLES','ALL'],
  ['Other Current liabilities','Liabilities','BS120','Current maturities of finance lease obligations','NG-OTHER-CL','ALL'],
  ['Other Current liabilities','Liabilities','BS121','Interest accrued but not due on borrowings','NG-OTHER-CL','ALL'],
  ['Other Current liabilities','Liabilities','BS122','Interest accrued and due on borrowings','NG-OTHER-CL','ALL'],
  ['Other Current liabilities','Liabilities','BS123','Deferred Income','NG-OTHER-CL','ALL'],
  ['Other Current liabilities','Liabilities','BS124','Deferred rent','NG-OTHER-CL','ALL'],
  ['Other Current liabilities','Liabilities','BS125','Unpaid dividends','NG-OTHER-CL','ALL'],
  ['Other Current liabilities','Liabilities','BS129','Advances from customers','NG-OTHER-CL','ALL'],
  ['Other Current liabilities','Liabilities','BS132','Statutory dues payable','NG-OTHER-CL','ALL'],
  ['Other Current liabilities','Liabilities','BS133','Employees dues payable','NG-OTHER-CL','ALL'],
  ['Short Term Provisions','Liabilities','BS145','Provision for Expenses','NG-ST-PROVISIONS','ALL'],
  ['Short Term Provisions','Liabilities','BS146','Provision for Income tax','NG-ST-PROVISIONS','ALL'],
  ['Short Term Provisions','Liabilities','BS147','Provision for Gratuity','NG-ST-PROVISIONS','ALL'],
  ['Short Term Provisions','Liabilities','BS148','Provision for Leave encashment','NG-ST-PROVISIONS','ALL'],
  ['Short Term Provisions','Liabilities','BS149','Proposed Dividend','NG-ST-PROVISIONS','ALL'],
  ['Non Current Investments','Assets','BS158','Investment property','NG-NC-INVESTMENTS','ALL'],
  ['Non Current Investments','Assets','BS159','Investments in Equity Instruments','NG-NC-INVESTMENTS','ALL'],
  ['Non Current Investments','Assets','BS160','Investments in preference shares','NG-NC-INVESTMENTS','ALL'],
  ['Non Current Investments','Assets','BS161','Investments in Government or trust securities','NG-NC-INVESTMENTS','ALL'],
  ['Non Current Investments','Assets','BS162','Investments in debentures or bonds','NG-NC-INVESTMENTS','ALL'],
  ['Non Current Investments','Assets','BS163','Investments in Mutual Funds','NG-NC-INVESTMENTS','ALL'],
  ['Non Current Investments','Assets','BS164','Investments in partnership firms','NG-NC-INVESTMENTS','ALL'],
  ['Deferred Tax Asset (Net)','Assets','BS175','Property, Plant and Equipment and Intangible assets','NG-DTA','ALL'],
  ['Deferred Tax Asset (Net)','Assets','BS176','Provision for Gratuity','NG-DTA','ALL'],
  ['Deferred Tax Asset (Net)','Assets','BS177','Provision for Leave encashment','NG-DTA','ALL'],
  ['Deferred Tax Asset (Net)','Assets','BS178','Unused tax losses','NG-DTA','ALL'],
  ['Deferred Tax Asset (Net)','Assets','BS179','Unabsorbed Business Loss','NG-DTA','ALL'],
  ['Deferred Tax Asset (Net)','Assets','BS180','Income tax disallowances & others','NG-DTA','ALL'],
  // IND_AS specific
  ['Financial Assets - Investments at FVTPL','Assets','BS-IND-1','Investments at Fair Value Through P&L','NG-FVTPL','IND_AS'],
  ['Financial Assets - Investments at FVOCI','Assets','BS-IND-2','Investments at Fair Value Through OCI','NG-FVOCI','IND_AS'],
  ['Financial Assets - Investments at Amortised Cost','Assets','BS-IND-3','Investments at Amortised Cost','NG-AMORT-COST','IND_AS'],
  ['OCI - Items that will not be reclassified','Equity','BS-IND-OCI1','Remeasurement of defined benefit plans','NG-OCI-PERM','IND_AS'],
  ['OCI - Items that may be reclassified','Equity','BS-IND-OCI2','Effective portion of hedging','NG-OCI-TEMP','IND_AS'],
];

// ── P&L GROUPING
const PL_DATA = [
  ['Revenue from operations','Income','PL1','Manufactured goods','NG-REVENUE','ALL'],
  ['Revenue from operations','Income','PL18','Sales - Goods','NG-REVENUE','ALL'],
  ['Revenue from operations','Income','PL19','Sales - Local','NG-REVENUE','ALL'],
  ['Revenue from operations','Income','PL20','Sale of services','NG-REVENUE','ALL'],
  ['Revenue from operations','Income','PL30','Other operating revenues','NG-REVENUE','ALL'],
  ['Revenue from operations','Income','PL31','Export Incentives','NG-REVENUE','ALL'],
  ['Revenue from operations','Income','PL32','Scrap Sales','NG-REVENUE','ALL'],
  ['Other Income','Income','PL41','Interest - On deposits','NG-OTHER-INCOME','ALL'],
  ['Other Income','Income','PL48','Dividend - From subsidiaries','NG-OTHER-INCOME','ALL'],
  ['Other Income','Income','PL56','Realised gain on sale of investments (net)','NG-OTHER-INCOME','ALL'],
  ['Other Income','Income','PL60','Profit on sale of PPE (net)','NG-OTHER-INCOME','ALL'],
  ['Other Income','Income','PL61','Net gain on foreign currency transactions','NG-OTHER-INCOME','ALL'],
  ['Other Income','Income','PL62','Liability written back','NG-OTHER-INCOME','ALL'],
  ['Other Income','Income','PL66','Miscellaneous Income','NG-OTHER-INCOME','ALL'],
  ['Cost of Material Consumed','Expenses','PL79','Opening stock of raw material','NG-MATERIAL-COST','ALL'],
  ['Cost of Material Consumed','Expenses','PL80','Add: Purchases','NG-MATERIAL-COST','ALL'],
  ['Cost of Material Consumed','Expenses','PL85','Less: Closing stock of raw material','NG-MATERIAL-COST','ALL'],
  ['Purchase of stock-in-trade','Expenses','PL86','Purchase of stock-in-trade','NG-PURCHASES','ALL'],
  ['Changes in inventory of Finished goods','Expenses','PL91','Opening stock of finished goods','NG-INV-CHANGE','ALL'],
  ['Changes in inventory of Finished goods','Expenses','PL92','Closing stock of finished goods','NG-INV-CHANGE','ALL'],
  ['Changes in Work-in-progress and Stock-in-trade','Expenses','PL93','Opening Work-in-progress','NG-INV-CHANGE','ALL'],
  ['Changes in Work-in-progress and Stock-in-trade','Expenses','PL95','Closing Work-in-progress','NG-INV-CHANGE','ALL'],
  ['Employee Benefit Expenses','Expenses','PL133','Salaries and wages','NG-EMPLOYEE-COST','ALL'],
  ['Employee Benefit Expenses','Expenses','PL134','Contribution to provident and other funds','NG-EMPLOYEE-COST','ALL'],
  ['Employee Benefit Expenses','Expenses','PL135','ESOP expense','NG-EMPLOYEE-COST','ALL'],
  ['Employee Benefit Expenses','Expenses','PL136','Staff welfare expenses','NG-EMPLOYEE-COST','ALL'],
  ['Depreciation and amortization expenses','Expenses','PL142','Depreciation on Property, plant & equipment','NG-DEPRECIATION','ALL'],
  ['Depreciation and amortization expenses','Expenses','PL143','Amortisation of Intangible assets','NG-DEPRECIATION','ALL'],
  ['Finance Cost','Expenses','PL149','Interest on borrowings','NG-FINANCE-COST','ALL'],
  ['Finance Cost','Expenses','PL150','Interest on others','NG-FINANCE-COST','ALL'],
  ['Finance Cost','Expenses','PL151','Interest amortisation expense','NG-FINANCE-COST','ALL'],
  ['Finance Cost','Expenses','PL152','Bill discounting charges','NG-FINANCE-COST','ALL'],
  ['Other Expenses','Expenses','PL161','Consumption of stores and spares','NG-OTHER-EXPENSES','ALL'],
  ['Other Expenses','Expenses','PL162','Power and fuel','NG-OTHER-EXPENSES','ALL'],
  ['Other Expenses','Expenses','PL163','Electricity and Water Charges','NG-OTHER-EXPENSES','ALL'],
  ['Other Expenses','Expenses','PL164','Rent','NG-OTHER-EXPENSES','ALL'],
  ['Other Expenses','Expenses','PL169','Insurance','NG-OTHER-EXPENSES','ALL'],
  ['Other Expenses','Expenses','PL182','Professional charges','NG-OTHER-EXPENSES','ALL'],
  ['Other Expenses','Expenses','PL194','Freight outward','NG-OTHER-EXPENSES','ALL'],
  ['Other Expenses','Expenses','PL199','Legal and Professional charges','NG-OTHER-EXPENSES','ALL'],
  ['Other Expenses','Expenses','PL201','Travelling and conveyance expenses','NG-OTHER-EXPENSES','ALL'],
  ['Other Expenses','Expenses','PL217','Business promotion expenses','NG-OTHER-EXPENSES','ALL'],
  ['Other Expenses','Expenses','PL218','Bank charges','NG-OTHER-EXPENSES','ALL'],
  ['Other Expenses','Expenses','PL221','Advertisement','NG-OTHER-EXPENSES','ALL'],
  ['Other Expenses','Expenses','PL228','Corporate social responsibility expenses','NG-OTHER-EXPENSES','ALL'],
  ['Other Expenses','Expenses','PL263','Miscellaneous expenses','NG-OTHER-EXPENSES','ALL'],
  ['Exceptional items','Expenses','PL265','Exceptional item 1','NG-EXCEPTIONAL','ALL'],
  ['Tax expense:','Expenses','PL281','Provision for Current Year tax','NG-TAX','ALL'],
  ['Tax expense:','Expenses','PL282','Previous year tax','NG-TAX','ALL'],
  ['Tax expense','Expenses','PL285','Current Tax Expenses','NG-TAX','ALL'],
  ['Tax expense','Expenses','PL287','Deferred tax expense/(income)','NG-TAX','ALL'],
  // IND AS specific
  ['Revenue from Contracts with Customers','Income','PL-IND-1','Revenue - Goods transferred at a point in time','NG-REVENUE-IFRS15','IND_AS'],
  ['Revenue from Contracts with Customers','Income','PL-IND-2','Revenue - Services transferred over time','NG-REVENUE-IFRS15','IND_AS'],
  ['OCI - Remeasurement of defined benefit plans','Income','PL-IND-OCI1','Actuarial gains/(losses)','NG-OCI-DB','IND_AS'],
  ['OCI - Fair value changes on equity instruments','Income','PL-IND-OCI2','Unrealised gain/(loss) on equity at FVOCI','NG-OCI-FV','IND_AS'],
];

async function seed() {
  console.log('Seeding MasterGrouping table...');

  // Clear existing
  await prisma.masterGrouping.deleteMany();

  let order = 1;
  const createRows = [];

  for (const [groupName, assetLiability, subGroupNo, subGroupName, noteGroupId, method] of BS_DATA) {
    createRows.push({
      sheet: 'BS', groupName, assetLiability, subGroupNo, subGroupName,
      noteGroupId, displayOrder: order++, methodApplicability: method,
    });
  }

  for (const [groupName, assetLiability, subGroupNo, subGroupName, noteGroupId, method] of PL_DATA) {
    createRows.push({
      sheet: 'PL', groupName, assetLiability, subGroupNo, subGroupName,
      noteGroupId, displayOrder: order++, methodApplicability: method,
    });
  }

  await prisma.masterGrouping.createMany({ data: createRows });
  console.log(`✅ Seeded ${createRows.length} master grouping rows`);
  await prisma.$disconnect();
}

seed().catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
