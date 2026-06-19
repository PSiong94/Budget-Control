import { useState, useEffect, useMemo, useRef } from "react";

// =====================================================================
// STORAGE SHIM
// This app was originally built for the Claude.ai artifact environment,
// which provides `window.storage.get/set` baked in. For a standalone
// deployment (Vercel, Netlify, your own server) we back the same API
// shape onto the browser's localStorage instead, so none of the rest
// of the app's code needs to change.
// =====================================================================
const localStore = {
  async get(key) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return null;
      return { key, value: raw };
    } catch (e) {
      return null;
    }
  },
  async set(key, value) {
    try {
      localStorage.setItem(key, value);
      return { key, value };
    } catch (e) {
      return null;
    }
  },
};

// =====================================================================
// DATA MODEL
// - Saving / Monthly Payment: fixed recurring categories, no end date.
//   Amounts are editable per item (since they won't appear as loans).
// - Loan: has startMonth + numMonths + monthlyAmount. The system
//   generates one instalment bill per month for each loan and merges
//   it into the Home page list for that month. Loans page shows a
//   read-only total (months left x monthly amount) PLUS an edit form
//   per loan; editing immediately changes what shows on Home.
// =====================================================================

const TODAY = new Date();
const CURRENT_MONTH_KEY = `${TODAY.getFullYear()}-${String(TODAY.getMonth() + 1).padStart(2, "0")}`;

function monthKeyFromParts(year, monthIndex0) {
  return `${year}-${String(monthIndex0 + 1).padStart(2, "0")}`;
}
function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}
function addMonths(key, n) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return monthKeyFromParts(d.getFullYear(), d.getMonth());
}
function monthsBetween(startKey, endKey) {
  const [sy, sm] = startKey.split("-").map(Number);
  const [ey, em] = endKey.split("-").map(Number);
  return (ey - sy) * 12 + (em - sm);
}

function uid() {
  return "x" + Math.random().toString(36).slice(2, 10);
}
function fmt(n) {
  return (Number.isFinite(n) ? n : 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function groupByBank(items) {
  const order = [];
  const map = {};
  items.forEach((item) => {
    const bank = item.bank || "Other";
    if (!map[bank]) {
      map[bank] = [];
      order.push(bank);
    }
    map[bank].push(item);
  });
  return order.map((bank) => ({ bank, items: map[bank] }));
}

// ---------- SAVING (fixed recurring, editable amount, no end date) ----------
const DEFAULT_SAVING_MYR = [
  { id: "sav_rm1", bank: "AmBank", label: "AM Bank Malaysia", currency: "RM", amount: 1000 },
  { id: "sav_rm2", bank: "KWSP", label: "KWSP Malaysia", currency: "RM", amount: 250 },
];
const DEFAULT_SAVING_SGD = [
  { id: "sav_sg1", bank: "Maybank", label: "Maybank Singapore", currency: "SGD", amount: 500 },
];

// ---------- MONTHLY PAYMENT (fixed recurring, editable amount, no end date) ----------
const DEFAULT_PAYMENT_MYR = [
  { id: "pay_rm1", bank: "UOB", label: "Batu Internet", currency: "RM", amount: 72.10 },
  { id: "pay_rm2", bank: "UOB", label: "Insurance", currency: "RM", amount: 350 },
];
const DEFAULT_PAYMENT_SGD = [
  { id: "pay_sg1", bank: "Family", label: "Mei Mei", currency: "SGD", amount: 100 },
  { id: "pay_sg2", bank: "Family", label: "Gor Gor", currency: "SGD", amount: 100 },
  { id: "pay_sg3", bank: "HSBC", label: "Insurance", currency: "SGD", amount: 91.89 },
];

// ---------- LOAN (has an end date — generates monthly instalments) ----------
const DEFAULT_LOANS = [
  { id: "loan_1", bank: "Alliance", label: "5th pay PL", currency: "RM", monthlyAmount: 2067.92, startMonth: "2026-07", numMonths: 54 },
  { id: "loan_2", bank: "UOB", label: "Hair removal", currency: "RM", monthlyAmount: 208.33, startMonth: "2026-07", numMonths: 5 },
  { id: "loan_3", bank: "UOB", label: "Instalment", currency: "RM", monthlyAmount: 294.35, startMonth: "2026-07", numMonths: 35 },
  { id: "loan_4", bank: "AmBank", label: "iPhone instalment", currency: "RM", monthlyAmount: 444, startMonth: "2026-07", numMonths: 6 },
  { id: "loan_5", bank: "AmBank", label: "Credit card loan", currency: "RM", monthlyAmount: 312.5, startMonth: "2026-07", numMonths: 19 },
  { id: "loan_6", bank: "Maybank", label: "Instalment (Future House)", currency: "RM", monthlyAmount: 318, startMonth: "2026-07", numMonths: 59 },
  { id: "loan_7", bank: "Maybank", label: "Bank Transfer instalment", currency: "RM", monthlyAmount: 344.18, startMonth: "2026-07", numMonths: 4 },
  { id: "loan_8", bank: "Maybank", label: "Bank Transfer instalment", currency: "RM", monthlyAmount: 317.75, startMonth: "2026-07", numMonths: 5 },
  { id: "loan_9", bank: "Maybank", label: "Bank Transfer instalment", currency: "RM", monthlyAmount: 121.58, startMonth: "2026-07", numMonths: 5 },
  { id: "loan_10", bank: "Maybank", label: "Bank Transfer instalment", currency: "RM", monthlyAmount: 301.18, startMonth: "2026-07", numMonths: 5 },
  { id: "loan_11", bank: "Maybank", label: "Bank Transfer instalment", currency: "RM", monthlyAmount: 205.33, startMonth: "2026-07", numMonths: 6 },
  { id: "loan_12", bank: "Maybank", label: "Bank Transfer instalment", currency: "RM", monthlyAmount: 193.63, startMonth: "2026-07", numMonths: 6 },
  { id: "loan_13", bank: "Maybank", label: "Bank Transfer instalment", currency: "RM", monthlyAmount: 365.20, startMonth: "2026-07", numMonths: 7 },
  { id: "loan_14", bank: "HSBC", label: "iPad mini", currency: "SGD", monthlyAmount: 49.08, startMonth: "2026-07", numMonths: 5 },
  { id: "loan_15", bank: "HSBC", label: "360", currency: "SGD", monthlyAmount: 138.16, startMonth: "2026-07", numMonths: 6 },
  { id: "loan_16", bank: "CITI", label: "Travel Deposit", currency: "SGD", monthlyAmount: 291.66, startMonth: "2026-07", numMonths: 4 },
  { id: "loan_17", bank: "CITI", label: "Instalment", currency: "SGD", monthlyAmount: 132.48, startMonth: "2026-07", numMonths: 12 },
  { id: "loan_18", bank: "CITI", label: "Instalment", currency: "SGD", monthlyAmount: 175.83, startMonth: "2026-07", numMonths: 12 },
  { id: "loan_19", bank: "SC", label: "Travel Balance", currency: "SGD", monthlyAmount: 126.33, startMonth: "2026-07", numMonths: 7 },
  { id: "loan_20", bank: "SC", label: "Instalment", currency: "SGD", monthlyAmount: 99.83, startMonth: "2026-07", numMonths: 4 },
  { id: "loan_21", bank: "SC", label: "Investment", currency: "SGD", monthlyAmount: 77.14, startMonth: "2026-07", numMonths: 12 },
  { id: "loan_22", bank: "SC", label: "Investment", currency: "SGD", monthlyAmount: 54.96, startMonth: "2026-07", numMonths: 12 },
];

const CHECKED_KEY = "budget-checked-v4"; // { "itemId:YYYY-MM": true }
const LOANS_KEY = "budget-loans-v4";
const SAVING_KEY = "budget-saving-v4";
const PAYMENT_KEY = "budget-payment-v4";
const EXTRA_KEY = "budget-extra-v4"; // { "category:currency:YYYY-MM": "12.50" }
const EXTRA_LOAN_ITEMS_KEY = "budget-extra-loan-items-v4"; // [{ id, bank, label, currency, amount, month }]
const SALARY_BUDGET_KEY = "budget-salary-budget-v4"; // { "YYYY-MM": { sgdSalary, sgdBudget, myrSalary, myrBudget } }

export default function BudgetTracker() {
  const [page, setPage] = useState("home");
  const [activeMonth, setActiveMonth] = useState(CURRENT_MONTH_KEY);
  const [checked, setChecked] = useState({});
  const [loans, setLoans] = useState(DEFAULT_LOANS);
  const [savingItems, setSavingItems] = useState([...DEFAULT_SAVING_SGD, ...DEFAULT_SAVING_MYR]);
  const [paymentItems, setPaymentItems] = useState([...DEFAULT_PAYMENT_SGD, ...DEFAULT_PAYMENT_MYR]);
  const [extraLoanItems, setExtraLoanItems] = useState([]);
  const [extraByKey, setExtraByKey] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState("idle");

  const [salaryBudgetByMonth, setSalaryBudgetByMonth] = useState({}); // { "YYYY-MM": { sgdSalary, sgdBudget, myrSalary, myrBudget } }

  // Ensure safe-area-inset-* values are populated (needed for the dynamic island / home indicator padding)
  useEffect(() => {
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "viewport";
      document.head.appendChild(meta);
    }
    const desired = "width=device-width, initial-scale=1, viewport-fit=cover";
    if (meta.content !== desired) meta.content = desired;
  }, []);

  // ---- load ----
  useEffect(() => {
    (async () => {
      try {
        const c = await localStore.get(CHECKED_KEY);
        if (c && c.value) setChecked(JSON.parse(c.value));
      } catch (e) {}
      try {
        const l = await localStore.get(LOANS_KEY);
        if (l && l.value) setLoans(JSON.parse(l.value));
      } catch (e) {}
      try {
        const s = await localStore.get(SAVING_KEY);
        if (s && s.value) setSavingItems(JSON.parse(s.value));
      } catch (e) {}
      try {
        const p = await localStore.get(PAYMENT_KEY);
        if (p && p.value) setPaymentItems(JSON.parse(p.value));
      } catch (e) {}
      try {
        const ex = await localStore.get(EXTRA_KEY);
        if (ex && ex.value) setExtraByKey(JSON.parse(ex.value));
      } catch (e) {}
      try {
        const eli = await localStore.get(EXTRA_LOAN_ITEMS_KEY);
        if (eli && eli.value) setExtraLoanItems(JSON.parse(eli.value));
      } catch (e) {}
      try {
        const sb = await localStore.get(SALARY_BUDGET_KEY);
        if (sb && sb.value) setSalaryBudgetByMonth(JSON.parse(sb.value));
      } catch (e) {}
      setLoaded(true);
    })();
  }, []);

  // ---- persist (debounced) ----
  function persist(key, value, onDone) {
    const t = setTimeout(async () => {
      try {
        await localStore.set(key, JSON.stringify(value));
        if (onDone) onDone();
      } catch (e) {}
    }, 250);
    return () => clearTimeout(t);
  }

  useEffect(() => {
    if (!loaded) return;
    setSaveState("saving");
    return persist(CHECKED_KEY, checked, () => setSaveState("saved"));
  }, [checked, loaded]);

  useEffect(() => {
    if (!loaded) return;
    return persist(LOANS_KEY, loans);
  }, [loans, loaded]);

  useEffect(() => {
    if (!loaded) return;
    return persist(SAVING_KEY, savingItems);
  }, [savingItems, loaded]);

  useEffect(() => {
    if (!loaded) return;
    return persist(PAYMENT_KEY, paymentItems);
  }, [paymentItems, loaded]);

  useEffect(() => {
    if (!loaded) return;
    return persist(SALARY_BUDGET_KEY, salaryBudgetByMonth);
  }, [salaryBudgetByMonth, loaded]);

  useEffect(() => {
    if (!loaded) return;
    return persist(EXTRA_LOAN_ITEMS_KEY, extraLoanItems);
  }, [extraLoanItems, loaded]);

  useEffect(() => {
    if (!loaded) return;
    return persist(EXTRA_KEY, extraByKey);
  }, [extraByKey, loaded]);

  const toggle = (itemId, mKey) => {
    const key = `${itemId}:${mKey}`;
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }));
  };
  const isPaid = (itemId, mKey) => !!checked[`${itemId}:${mKey}`];

  const updateItemField = (listSetter, id, field, value) => {
    listSetter((prev) => prev.map((it) => (it.id === id ? { ...it, [field]: value } : it)));
  };

  const addItem = (listSetter, currency, bank, label, amount) => {
    listSetter((prev) => [...prev, { id: uid(), bank: bank || "Other", label: label || "Untitled", currency, amount }]);
  };

  const removeItem = (listSetter, id) => {
    listSetter((prev) => prev.filter((it) => it.id !== id));
  };

  const addLoan = (loan) => setLoans((prev) => [...prev, { ...loan, id: uid() }]);
  const removeLoan = (id) => setLoans((prev) => prev.filter((l) => l.id !== id));
  const updateLoan = (id, patch) => setLoans((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const setExtra = (category, currency, mKey, value) => {
    setExtraByKey((prev) => ({ ...prev, [`${category}:${currency}:${mKey}`]: value }));
  };
  const getExtra = (category, currency, mKey) => extraByKey[`${category}:${currency}:${mKey}`] || "";

  const addExtraLoanItem = (currency, bank, label, amount, month) => {
    setExtraLoanItems((prev) => [...prev, { id: uid(), bank: bank || "Other", label: label || "Untitled", currency, amount, month }]);
  };
  const removeExtraLoanItem = (id) => {
    setExtraLoanItems((prev) => prev.filter((it) => it.id !== id));
  };

  // ---- generate this month's loan instalments ----
  function loanInstalmentForMonth(loan, mKey) {
    const offset = monthsBetween(loan.startMonth, mKey);
    if (offset < 0 || offset >= loan.numMonths) return null;
    return {
      id: loan.id,
      bank: loan.bank,
      label: loan.label,
      currency: loan.currency,
      amount: loan.monthlyAmount,
      monthNumber: offset + 1,
      totalMonths: loan.numMonths,
    };
  }

  function loanBillsForMonth(mKey, currency) {
    const fromLoans = loans
      .filter((l) => l.currency === currency)
      .map((l) => loanInstalmentForMonth(l, mKey))
      .filter(Boolean);
    const fromExtras = extraLoanItems
      .filter((it) => it.currency === currency && it.month === mKey)
      .map((it) => ({ id: it.id, bank: it.bank, label: it.label, currency: it.currency, amount: it.amount, isExtra: true }));
    return [...fromLoans, ...fromExtras];
  }

  const sgdSaving = savingItems.filter((i) => i.currency === "SGD");
  const myrSaving = savingItems.filter((i) => i.currency === "RM");
  const sgdPayment = paymentItems.filter((i) => i.currency === "SGD");
  const myrPayment = paymentItems.filter((i) => i.currency === "RM");

  const sgdLoanBills = useMemo(() => loanBillsForMonth(activeMonth, "SGD"), [activeMonth, loans, extraLoanItems]);
  const myrLoanBills = useMemo(() => loanBillsForMonth(activeMonth, "RM"), [activeMonth, loans, extraLoanItems]);

  function sumPaid(items, mKey) {
    return items.reduce((s, b) => (isPaid(b.id, mKey) ? s + b.amount : s), 0);
  }
  function sumTotal(items) {
    return items.reduce((s, b) => s + b.amount, 0);
  }

  const sgdAllBills = [...sgdSaving, ...sgdPayment, ...sgdLoanBills];
  const myrAllBills = [...myrSaving, ...myrPayment, ...myrLoanBills];

  // Saving/Payment items don't carry per-item extra; loan bills do.
  const sgdPaid = sumPaid(sgdAllBills, activeMonth);
  const sgdTotal = sumTotal(sgdAllBills);
  const sgdRemaining = Math.max(0, sgdTotal - sgdPaid);

  const myrPaid = sumPaid(myrAllBills, activeMonth);
  const myrTotal = sumTotal(myrAllBills);
  const myrRemaining = Math.max(0, myrTotal - myrPaid);

  const currentMonthSB = salaryBudgetByMonth[activeMonth] || {};
  const sgdSalary = currentMonthSB.sgdSalary || "";
  const sgdBudget = currentMonthSB.sgdBudget || "";
  const myrSalary = currentMonthSB.myrSalary || "";
  const myrBudget = currentMonthSB.myrBudget || "";

  const setSalaryBudgetField = (field, value) => {
    setSalaryBudgetByMonth((prev) => ({
      ...prev,
      [activeMonth]: { ...(prev[activeMonth] || {}), [field]: value },
    }));
  };
  const setSgdSalary = (v) => setSalaryBudgetField("sgdSalary", v);
  const setSgdBudget = (v) => setSalaryBudgetField("sgdBudget", v);
  const setMyrSalary = (v) => setSalaryBudgetField("myrSalary", v);
  const setMyrBudget = (v) => setSalaryBudgetField("myrBudget", v);

  const sgdSalaryNum = parseFloat(sgdSalary) || 0;
  const sgdBudgetNum = parseFloat(sgdBudget) || 0;
  const myrSalaryNum = parseFloat(myrSalary) || 0;
  const myrBudgetNum = parseFloat(myrBudget) || 0;

  const sgdExtraSavingNum = parseFloat(getExtra("saving", "SGD", activeMonth)) || 0;
  const myrExtraSavingNum = parseFloat(getExtra("saving", "RM", activeMonth)) || 0;
  const sgdExtraPaymentNum = parseFloat(getExtra("payment", "SGD", activeMonth)) || 0;
  const myrExtraPaymentNum = parseFloat(getExtra("payment", "RM", activeMonth)) || 0;

  // Loan extras are now just regular ad-hoc items already folded into sgdPaid / myrPaid above.
  const sgdExtraTotal = sgdExtraSavingNum + sgdExtraPaymentNum;
  const myrExtraTotal = myrExtraSavingNum + myrExtraPaymentNum;

  const sgdHolding = sgdSalaryNum - sgdBudgetNum - sgdPaid - sgdExtraTotal;
  const myrHolding = myrSalaryNum - myrBudgetNum - myrPaid - myrExtraTotal;

  // ---- Loans overview ----
  const loanOverviewRows = useMemo(() => {
    return loans.map((loan) => {
      let monthsPaid = 0;
      for (let i = 0; i < loan.numMonths; i++) {
        const mk = addMonths(loan.startMonth, i);
        if (isPaid(loan.id, mk)) monthsPaid++;
      }
      const monthsRemaining = Math.max(0, loan.numMonths - monthsPaid);
      const amountRemaining = monthsRemaining * loan.monthlyAmount;
      return { ...loan, monthsPaid, monthsRemaining, amountRemaining };
    });
  }, [loans, checked]);

  const loanTotalsByCurrency = useMemo(() => {
    const totals = { SGD: 0, RM: 0 };
    loanOverviewRows.forEach((l) => { totals[l.currency] += l.amountRemaining; });
    return totals;
  }, [loanOverviewRows]);

  return (
    <div style={styles.page}>
      <style>{fontImports}</style>
      <div style={styles.container}>
        <TopNav page={page} setPage={setPage} saveState={saveState} />

        {page === "home" ? (
          <HomePage
            activeMonth={activeMonth} setActiveMonth={setActiveMonth}
            sgdSalary={sgdSalary} setSgdSalary={setSgdSalary}
            sgdBudget={sgdBudget} setSgdBudget={setSgdBudget}
            myrSalary={myrSalary} setMyrSalary={setMyrSalary}
            myrBudget={myrBudget} setMyrBudget={setMyrBudget}
            sgdHolding={sgdHolding} myrHolding={myrHolding}
            sgdPaid={sgdPaid} sgdTotal={sgdTotal} sgdRemaining={sgdRemaining}
            myrPaid={myrPaid} myrTotal={myrTotal} myrRemaining={myrRemaining}
            sgdSaving={sgdSaving} myrSaving={myrSaving}
            sgdPayment={sgdPayment} myrPayment={myrPayment}
            sgdLoanBills={sgdLoanBills} myrLoanBills={myrLoanBills}
            isPaid={isPaid} toggle={toggle}
            updateSavingField={(id, field, value) => updateItemField(setSavingItems, id, field, value)}
            updatePaymentField={(id, field, value) => updateItemField(setPaymentItems, id, field, value)}
            addSavingItem={(currency, bank, label, amount) => addItem(setSavingItems, currency, bank, label, amount)}
            addPaymentItem={(currency, bank, label, amount) => addItem(setPaymentItems, currency, bank, label, amount)}
            removeSavingItem={(id) => removeItem(setSavingItems, id)}
            removePaymentItem={(id) => removeItem(setPaymentItems, id)}
            getExtra={getExtra} setExtra={setExtra}
            extraLoanItems={extraLoanItems}
            addExtraLoanItem={addExtraLoanItem} removeExtraLoanItem={removeExtraLoanItem}
          />
        ) : (
          <LoansPage
            loanRows={loanOverviewRows}
            totals={loanTotalsByCurrency}
            addLoan={addLoan}
            removeLoan={removeLoan}
            updateLoan={updateLoan}
          />
        )}

        <footer style={styles.footer}>
          <span>Tap a bill to mark it paid for that month. Edit a loan on the Loans page — Home updates right away.</span>
        </footer>
      </div>
    </div>
  );
}

// ============ NAV ============
function TopNav({ page, setPage, saveState }) {
  const label = saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "";
  return (
    <div style={styles.topNavWrap}>
      <div style={styles.tabRow}>
        <button onClick={() => setPage("home")} style={{ ...styles.tabButton, ...(page === "home" ? styles.tabButtonActive : {}) }}>Home</button>
        <button onClick={() => setPage("loans")} style={{ ...styles.tabButton, ...(page === "loans" ? styles.tabButtonActive : {}) }}>Loans</button>
      </div>
      <span style={styles.saveLabel}>{label}</span>
    </div>
  );
}

// ============ MONTH PICKER ============
function MonthPicker({ activeMonth, setActiveMonth }) {
  const isCurrent = activeMonth === CURRENT_MONTH_KEY;
  return (
    <div style={styles.monthPicker}>
      <button onClick={() => setActiveMonth(addMonths(activeMonth, -1))} style={styles.monthArrow} aria-label="Previous month">‹</button>
      <div style={styles.monthPickerCenter}>
        <span style={styles.monthPickerLabel}>{monthLabel(activeMonth)}</span>
        {!isCurrent && <button onClick={() => setActiveMonth(CURRENT_MONTH_KEY)} style={styles.monthJumpButton}>Jump to current month</button>}
      </div>
      <button onClick={() => setActiveMonth(addMonths(activeMonth, 1))} style={styles.monthArrow} aria-label="Next month">›</button>
    </div>
  );
}

// ============ HOME PAGE ============
function HomePage(props) {
  const {
    activeMonth, setActiveMonth,
    sgdSalary, setSgdSalary, sgdBudget, setSgdBudget,
    myrSalary, setMyrSalary, myrBudget, setMyrBudget,
    sgdHolding, myrHolding,
    sgdPaid, sgdTotal, sgdRemaining,
    myrPaid, myrTotal, myrRemaining,
    sgdSaving, myrSaving, sgdPayment, myrPayment,
    sgdLoanBills, myrLoanBills,
    isPaid, toggle, updateSavingField, updatePaymentField,
    addSavingItem, addPaymentItem, removeSavingItem, removePaymentItem,
    getExtra, setExtra, extraLoanItems, addExtraLoanItem, removeExtraLoanItem,
  } = props;

  return (
    <>
      <MonthPicker activeMonth={activeMonth} setActiveMonth={setActiveMonth} />

      <div style={styles.currencyGrid}>
        <CurrencyPanel title="SGD" accent={PALETTE.teal} salary={sgdSalary} setSalary={setSgdSalary} budget={sgdBudget} setBudget={setSgdBudget} holding={sgdHolding} paid={sgdPaid} remaining={sgdRemaining} />
        <CurrencyPanel title="MYR" accent={PALETTE.clay} salary={myrSalary} setSalary={setMyrSalary} budget={myrBudget} setBudget={setMyrBudget} holding={myrHolding} paid={myrPaid} remaining={myrRemaining} />
      </div>

      <main style={styles.main}>
        <CategorySection
          categoryTitle="Saving" currency="SGD" accent={PALETTE.teal}
          items={sgdSaving} activeMonth={activeMonth} isPaid={isPaid} toggle={toggle}
          editable onEditField={updateSavingField}
          addable onAddItem={(bank, label, amount) => addSavingItem("SGD", bank, label, amount)} onRemoveItem={removeSavingItem}
          extraLabel="Extra saving" extraValue={getExtra("saving", "SGD", activeMonth)} setExtraValue={(v) => setExtra("saving", "SGD", activeMonth, v)}
        />
        <CategorySection
          categoryTitle="Saving" currency="RM" accent={PALETTE.clay}
          items={myrSaving} activeMonth={activeMonth} isPaid={isPaid} toggle={toggle}
          editable onEditField={updateSavingField}
          addable onAddItem={(bank, label, amount) => addSavingItem("RM", bank, label, amount)} onRemoveItem={removeSavingItem}
          extraLabel="Extra saving" extraValue={getExtra("saving", "RM", activeMonth)} setExtraValue={(v) => setExtra("saving", "RM", activeMonth, v)}
        />
        <CategorySection
          categoryTitle="Monthly Payment" currency="SGD" accent={PALETTE.teal}
          items={sgdPayment} activeMonth={activeMonth} isPaid={isPaid} toggle={toggle}
          editable onEditField={updatePaymentField}
          addable onAddItem={(bank, label, amount) => addPaymentItem("SGD", bank, label, amount)} onRemoveItem={removePaymentItem}
          extraLabel="Extra spend" extraValue={getExtra("payment", "SGD", activeMonth)} setExtraValue={(v) => setExtra("payment", "SGD", activeMonth, v)}
        />
        <CategorySection
          categoryTitle="Monthly Payment" currency="RM" accent={PALETTE.clay}
          items={myrPayment} activeMonth={activeMonth} isPaid={isPaid} toggle={toggle}
          editable onEditField={updatePaymentField}
          addable onAddItem={(bank, label, amount) => addPaymentItem("RM", bank, label, amount)} onRemoveItem={removePaymentItem}
          extraLabel="Extra spend" extraValue={getExtra("payment", "RM", activeMonth)} setExtraValue={(v) => setExtra("payment", "RM", activeMonth, v)}
        />
        <CategorySection
          categoryTitle="Loan" currency="SGD" accent={PALETTE.teal}
          items={sgdLoanBills} activeMonth={activeMonth} isPaid={isPaid} toggle={toggle}
          showInstalmentTag
          addable
          onAddItem={(bank, label, amount) => addExtraLoanItem("SGD", bank, label, amount, activeMonth)}
          onRemoveItem={removeExtraLoanItem}
          removableIds={extraLoanItems.filter((i) => i.currency === "SGD" && i.month === activeMonth).map((i) => i.id)}
        />
        <CategorySection
          categoryTitle="Loan" currency="RM" accent={PALETTE.clay}
          items={myrLoanBills} activeMonth={activeMonth} isPaid={isPaid} toggle={toggle}
          showInstalmentTag
          addable
          onAddItem={(bank, label, amount) => addExtraLoanItem("RM", bank, label, amount, activeMonth)}
          onRemoveItem={removeExtraLoanItem}
          removableIds={extraLoanItems.filter((i) => i.currency === "RM" && i.month === activeMonth).map((i) => i.id)}
        />
      </main>
    </>
  );
}

function CurrencyPanel({ title, accent, salary, setSalary, budget, setBudget, holding, paid, remaining }) {
  return (
    <div style={styles.currencyPanel}>
      <div style={styles.currencyPanelHeader}>
        <span style={{ ...styles.currencyPanelTitle, color: accent }}>{title}</span>
      </div>
      <div style={styles.inputPair}>
        <div style={styles.inputCol}>
          <label style={styles.inputLabel}>Salary</label>
          <input type="number" inputMode="decimal" placeholder="0.00" value={salary} onChange={(e) => setSalary(e.target.value)} style={styles.input} />
        </div>
        <div style={styles.inputCol}>
          <label style={styles.inputLabel}>Budget set aside</label>
          <input type="number" inputMode="decimal" placeholder="0.00" value={budget} onChange={(e) => setBudget(e.target.value)} style={styles.input} />
        </div>
      </div>
      <div style={styles.holdingBlock}>
        <span style={styles.holdingLabel}>You hold now</span>
        <span style={{ ...styles.holdingNumber, color: holding < 0 ? PALETTE.coral : PALETTE.bone }}>{title} {fmt(holding)}</span>
        <span style={styles.holdingSub}>Salary − budget − bills paid − extra</span>
      </div>
      <div style={styles.smallStatsRow}>
        <SmallStat label="Paid this month" value={`${title} ${fmt(paid)}`} />
        <SmallStat label="Still need to pay" value={`${title} ${fmt(remaining)}`} accent={remaining > 0 ? PALETTE.coral : PALETTE.teal} />
      </div>
    </div>
  );
}

function SmallStat({ label, value, accent }) {
  return (
    <div style={styles.smallStat}>
      <span style={{ ...styles.smallStatValue, color: accent || PALETTE.bone }}>{value}</span>
      <span style={styles.smallStatLabel}>{label}</span>
    </div>
  );
}

function CategorySection({ categoryTitle, currency, accent, items, activeMonth, isPaid, toggle, editable, onEditField, addable, onAddItem, onRemoveItem, removableIds, showInstalmentTag, extraLabel, extraValue, setExtraValue }) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [newBank, setNewBank] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [editBank, setEditBank] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [editAmount, setEditAmount] = useState("");

  const total = items.reduce((s, i) => s + i.amount, 0);
  const paid = items.reduce((s, i) => (isPaid(i.id, activeMonth) ? s + i.amount : s), 0);
  const pct = total > 0 ? Math.min(100, (paid / total) * 100) : 0;
  const remaining = Math.max(0, total - paid);

  const canRemove = (item) => (removableIds ? removableIds.includes(item.id) : true);

  const submitAdd = () => {
    const amt = parseFloat(newAmount);
    if (!newLabel.trim() || !Number.isFinite(amt)) return;
    onAddItem(newBank.trim() || "Other", newLabel.trim(), amt);
    setNewBank("");
    setNewLabel("");
    setNewAmount("");
    setShowAddForm(false);
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditBank(item.bank);
    setEditLabel(item.label);
    setEditAmount(String(item.amount));
  };

  const submitEdit = () => {
    const amt = parseFloat(editAmount);
    if (!editLabel.trim() || !Number.isFinite(amt)) return;
    onEditField(editingId, "bank", editBank.trim() || "Other");
    onEditField(editingId, "label", editLabel.trim());
    onEditField(editingId, "amount", amt);
    setEditingId(null);
  };

  return (
    <section style={styles.card}>
      <div style={styles.cardHeader}>
        <div>
          <h2 style={styles.cardTitle}>{categoryTitle} · {currency}</h2>
          <span style={styles.cardSubtitle}>{items.length > 0 ? monthLabel(activeMonth) : "Nothing here yet"}</span>
        </div>
        {items.length > 0 && (
          <div style={styles.cardHeaderRight}>
            <span style={{ ...styles.cardAccentNumber, color: accent }}>{currency} {fmt(remaining)}</span>
            <span style={styles.cardAccentLabel}>still owing</span>
          </div>
        )}
      </div>

      {items.length > 0 && (
        <>
          <div style={styles.progressTrack}><div style={{ ...styles.progressFill, width: `${pct}%`, background: accent }} /></div>
          <div style={styles.progressCaption}><span>{currency} {fmt(paid)} paid</span><span>{Math.round(pct)}%</span></div>
        </>
      )}

      {(() => {
        const groups = groupByBank(items);
        return groups.map((group) => (
          <div key={group.bank} style={styles.bankGroup}>
            <div style={styles.bankGroupLabel}>{group.bank}</div>
            <ul style={styles.list}>
              {group.items.map((item) => {
                const paidNow = isPaid(item.id, activeMonth);
                const isEditing = editingId === item.id;

                if (isEditing) {
                  return (
                    <li key={item.id} style={styles.listItem}>
                      <div style={styles.addLoanForm}>
                        <input type="text" placeholder="Bank / category" value={editBank} onChange={(e) => setEditBank(e.target.value)} style={styles.input} />
                        <input type="text" placeholder="Name" value={editLabel} onChange={(e) => setEditLabel(e.target.value)} style={styles.input} />
                        <input type="number" inputMode="decimal" placeholder={`Amount (${currency})`} value={editAmount} onChange={(e) => setEditAmount(e.target.value)} style={styles.input} />
                        <div style={styles.inputPair}>
                          <button onClick={submitEdit} style={styles.confirmButton}>Save changes</button>
                          <button onClick={() => setEditingId(null)} style={styles.cancelButton}>Cancel</button>
                        </div>
                      </div>
                    </li>
                  );
                }

                return (
                  <li key={item.id} style={styles.listItem}>
                    <div style={styles.itemRow}>
                      <button onClick={() => toggle(item.id, activeMonth)} style={{ ...styles.itemButton, flex: 1, opacity: paidNow ? 0.55 : 1 }} aria-pressed={paidNow}>
                        <span style={{ ...styles.checkbox, background: paidNow ? accent : "transparent", borderColor: paidNow ? accent : PALETTE.line }}>
                          {paidNow && <CheckIcon />}
                        </span>
                        <span style={styles.itemTextBlock}>
                          <span style={{ ...styles.itemLabel, textDecoration: paidNow ? "line-through" : "none" }}>{item.label}</span>
                          {showInstalmentTag && item.totalMonths && <span style={styles.itemUntil}>instalment {item.monthNumber} of {item.totalMonths}</span>}
                          {item.isExtra && <span style={styles.itemUntil}>added this month</span>}
                        </span>
                        <span style={{ ...styles.itemAmount, color: paidNow ? PALETTE.slate : PALETTE.bone }}>{item.currency} {fmt(item.amount)}</span>
                      </button>
                      {editable && (
                        <button onClick={() => startEdit(item)} style={styles.editButton} aria-label="Edit item">Edit</button>
                      )}
                      {addable && canRemove(item) && (
                        <button onClick={() => onRemoveItem(item.id)} style={styles.removeButton} aria-label="Remove item">×</button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ));
      })()}

      {addable && (
        showAddForm ? (
          <div style={styles.addLoanForm}>
            <input type="text" placeholder="Bank / category (e.g. Maybank)" value={newBank} onChange={(e) => setNewBank(e.target.value)} style={styles.input} />
            <input type="text" placeholder="Name (e.g. Car loan)" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} style={styles.input} />
            <input type="number" inputMode="decimal" placeholder={`Amount (${currency})`} value={newAmount} onChange={(e) => setNewAmount(e.target.value)} style={styles.input} />
            <div style={styles.inputPair}>
              <button onClick={submitAdd} style={styles.confirmButton}>Add</button>
              <button onClick={() => setShowAddForm(false)} style={styles.cancelButton}>Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowAddForm(true)} style={styles.addLoanButton}>+ Add item</button>
        )
      )}

      {extraLabel && (
        <div style={styles.extraGroupRow}>
          <span style={styles.extraGroupLabel}>{extraLabel} ({currency})</span>
          <input type="number" inputMode="decimal" placeholder="0.00" value={extraValue} onChange={(e) => setExtraValue(e.target.value)} style={styles.extraGroupField} />
        </div>
      )}
    </section>
  );
}

// ============ LOANS PAGE (overview + edit + add) ============
function LoansPage({ loanRows, totals, addLoan, removeLoan, updateLoan }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm());

  function emptyForm() {
    return { label: "", bank: "", currency: "SGD", monthlyAmount: "", numMonths: "", startMonth: CURRENT_MONTH_KEY };
  }

  const groups = useMemo(() => groupByBank(loanRows), [loanRows]);

  const submitNew = () => {
    const amt = parseFloat(form.monthlyAmount);
    const months = parseInt(form.numMonths, 10);
    if (!form.label.trim() || !Number.isFinite(amt) || amt <= 0 || !Number.isFinite(months) || months <= 0) return;
    addLoan({ label: form.label.trim(), bank: form.bank.trim() || "Other", currency: form.currency, monthlyAmount: amt, numMonths: months, startMonth: form.startMonth || CURRENT_MONTH_KEY });
    setForm(emptyForm());
    setShowForm(false);
  };

  const startEdit = (loan) => {
    setEditingId(loan.id);
    setForm({ label: loan.label, bank: loan.bank, currency: loan.currency, monthlyAmount: String(loan.monthlyAmount), numMonths: String(loan.numMonths), startMonth: loan.startMonth });
  };

  const submitEdit = () => {
    const amt = parseFloat(form.monthlyAmount);
    const months = parseInt(form.numMonths, 10);
    if (!form.label.trim() || !Number.isFinite(amt) || amt <= 0 || !Number.isFinite(months) || months <= 0) return;
    updateLoan(editingId, { label: form.label.trim(), bank: form.bank.trim() || "Other", currency: form.currency, monthlyAmount: amt, numMonths: months, startMonth: form.startMonth });
    setEditingId(null);
    setForm(emptyForm());
  };

  return (
    <>
      <div style={styles.monthBadgeRow}><span style={styles.monthBadge}>All loans · total still owed</span></div>

      <div style={styles.currencyGrid}>
        <div style={styles.loanTotalCard}><span style={{ ...styles.loanTotalValue, color: PALETTE.teal }}>SGD {fmt(totals.SGD)}</span><span style={styles.loanTotalLabel}>still need to pay</span></div>
        <div style={styles.loanTotalCard}><span style={{ ...styles.loanTotalValue, color: PALETTE.clay }}>RM {fmt(totals.RM)}</span><span style={styles.loanTotalLabel}>still need to pay</span></div>
      </div>

      <main style={styles.main}>
        <section style={styles.card}>
          <div style={styles.cardHeader}>
            <div>
              <h2 style={styles.cardTitle}>Loans &amp; instalments</h2>
              <span style={styles.cardSubtitle}>Tick instalments on Home — edit details here</span>
            </div>
          </div>

          {groups.map((group) => (
            <div key={group.bank} style={styles.bankGroup}>
              <div style={styles.bankGroupLabel}>{group.bank}</div>
              <ul style={styles.list}>
                {group.items.map((loan) => {
                  const accent = loan.currency === "SGD" ? PALETTE.teal : PALETTE.clay;
                  const isEditing = editingId === loan.id;
                  return (
                    <li key={loan.id} style={styles.listItem}>
                      {!isEditing ? (
                        <div style={styles.loanReadRow}>
                          <span style={styles.itemTextBlock}>
                            <span style={styles.itemLabel}>{loan.label}</span>
                            <span style={styles.itemUntil}>{loan.monthsRemaining} of {loan.numMonths} months left · {loan.currency} {fmt(loan.monthlyAmount)}/mo · from {monthLabel(loan.startMonth)}</span>
                          </span>
                          <span style={{ ...styles.itemAmount, color: accent }}>{loan.currency} {fmt(loan.amountRemaining)}</span>
                          <button onClick={() => startEdit(loan)} style={styles.editButton} aria-label="Edit loan">Edit</button>
                          <button onClick={() => removeLoan(loan.id)} style={styles.removeButton} aria-label="Remove loan">×</button>
                        </div>
                      ) : (
                        <LoanForm form={form} setForm={setForm} onSubmit={submitEdit} onCancel={() => { setEditingId(null); setForm(emptyForm()); }} submitLabel="Save changes" />
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          {!showForm ? (
            <button onClick={() => setShowForm(true)} style={styles.addLoanButton}>+ Add a loan</button>
          ) : (
            <LoanForm form={form} setForm={setForm} onSubmit={submitNew} onCancel={() => { setShowForm(false); setForm(emptyForm()); }} submitLabel="Add loan" />
          )}
        </section>
      </main>
    </>
  );
}

function LoanForm({ form, setForm, onSubmit, onCancel, submitLabel }) {
  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));
  return (
    <div style={styles.addLoanForm}>
      <input type="text" placeholder="Loan name (e.g. Car loan)" value={form.label} onChange={set("label")} style={styles.input} />
      <input type="text" placeholder="Bank / category (e.g. OCBC)" value={form.bank} onChange={set("bank")} style={styles.input} />
      <div style={styles.inputPair}>
        <select value={form.currency} onChange={set("currency")} style={styles.select}>
          <option value="SGD">SGD</option>
          <option value="RM">RM</option>
        </select>
        <input type="number" inputMode="decimal" placeholder="Amount per month" value={form.monthlyAmount} onChange={set("monthlyAmount")} style={styles.input} />
      </div>
      <div style={styles.inputCol}>
        <label style={styles.inputLabel}>How many months</label>
        <input type="number" inputMode="numeric" placeholder="e.g. 12" value={form.numMonths} onChange={set("numMonths")} style={styles.input} />
      </div>
      <div style={styles.inputCol}>
        <label style={styles.inputLabel}>Start from</label>
        <MonthWheelPicker value={form.startMonth} onChange={(v) => setForm((prev) => ({ ...prev, startMonth: v }))} />
      </div>
      <div style={styles.inputPair}>
        <button onClick={onSubmit} style={styles.confirmButton}>{submitLabel}</button>
        <button onClick={onCancel} style={styles.cancelButton}>Cancel</button>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
      <path d="M1 4.5L4 7.5L10 1" stroke={PALETTE.ink} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ============ iOS-style scroll wheel month/year picker ============
const WHEEL_ITEM_HEIGHT = 36;
const WHEEL_VISIBLE_COUNT = 5; // odd number, middle is selected
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function WheelColumn({ options, selectedIndex, onSelect, renderLabel }) {
  const scrollRef = useRef(null);
  const isProgrammaticScroll = useRef(false);
  const scrollTimeout = useRef(null);

  // scroll to selected index on mount / when selectedIndex changes externally
  useEffect(() => {
    if (!scrollRef.current) return;
    isProgrammaticScroll.current = true;
    scrollRef.current.scrollTo({ top: selectedIndex * WHEEL_ITEM_HEIGHT, behavior: "auto" });
    const t = setTimeout(() => { isProgrammaticScroll.current = false; }, 50);
    return () => clearTimeout(t);
  }, [selectedIndex, options.length]);

  const handleScroll = () => {
    if (isProgrammaticScroll.current) return;
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    scrollTimeout.current = setTimeout(() => {
      if (!scrollRef.current) return;
      const idx = Math.round(scrollRef.current.scrollTop / WHEEL_ITEM_HEIGHT);
      const clamped = Math.max(0, Math.min(options.length - 1, idx));
      onSelect(clamped);
    }, 100);
  };

  const padCount = Math.floor(WHEEL_VISIBLE_COUNT / 2);

  return (
    <div style={styles.wheelColumnWrap}>
      <div ref={scrollRef} onScroll={handleScroll} style={styles.wheelScroll}>
        <div style={{ height: padCount * WHEEL_ITEM_HEIGHT }} />
        {options.map((opt, idx) => (
          <div
            key={idx}
            onClick={() => {
              if (scrollRef.current) {
                scrollRef.current.scrollTo({ top: idx * WHEEL_ITEM_HEIGHT, behavior: "smooth" });
              }
              onSelect(idx);
            }}
            style={{
              ...styles.wheelItem,
              opacity: idx === selectedIndex ? 1 : 0.35,
              fontWeight: idx === selectedIndex ? 700 : 500,
            }}
          >
            {renderLabel(opt)}
          </div>
        ))}
        <div style={{ height: padCount * WHEEL_ITEM_HEIGHT }} />
      </div>
      <div style={styles.wheelHighlight} />
    </div>
  );
}

function MonthWheelPicker({ value, onChange }) {
  // value is "YYYY-MM"
  const [y, m] = (value || CURRENT_MONTH_KEY).split("-").map(Number);
  const yearOptions = useMemo(() => {
    const arr = [];
    for (let yr = 2020; yr <= 2045; yr++) arr.push(yr);
    return arr;
  }, []);
  const yearIndex = Math.max(0, yearOptions.indexOf(y));
  const monthIndex = m - 1;

  const setYear = (idx) => {
    const newYear = yearOptions[idx];
    onChange(`${newYear}-${String(m).padStart(2, "0")}`);
  };
  const setMonth = (idx) => {
    onChange(`${y}-${String(idx + 1).padStart(2, "0")}`);
  };

  return (
    <div style={styles.wheelRow}>
      <WheelColumn options={MONTH_NAMES} selectedIndex={monthIndex} onSelect={setMonth} renderLabel={(opt) => opt} />
      <WheelColumn options={yearOptions} selectedIndex={yearIndex} onSelect={setYear} renderLabel={(opt) => opt} />
    </div>
  );
}

// ---------- Design tokens ----------
const PALETTE = {
  ink: "#14181F", inkSoft: "#1B212B", bone: "#EDEAE3", slate: "#7C8493",
  line: "#2B323E", teal: "#5FA8A0", clay: "#C77B4F", coral: "#D9776B",
};
const FONT_DISPLAY = "'Space Grotesk', sans-serif";
const FONT_BODY = "'Inter', sans-serif";
const fontImports = `@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&display=swap');`;

const styles = {
  page: {
    minHeight: "100vh",
    background: PALETTE.ink,
    color: PALETTE.bone,
    fontFamily: FONT_BODY,
    display: "flex",
    justifyContent: "center",
    paddingTop: "max(16px, env(safe-area-inset-top))",
    paddingBottom: "max(32px, env(safe-area-inset-bottom))",
    paddingLeft: "env(safe-area-inset-left)",
    paddingRight: "env(safe-area-inset-right)",
    boxSizing: "border-box",
  },
  container: { width: "100%", maxWidth: 560, padding: "0 16px" },
  topNavWrap: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  tabRow: { display: "flex", gap: 6, background: PALETTE.inkSoft, border: `1px solid ${PALETTE.line}`, borderRadius: 12, padding: 4 },
  tabButton: { fontFamily: FONT_DISPLAY, fontSize: 13, fontWeight: 600, padding: "7px 16px", borderRadius: 9, border: "none", background: "transparent", color: PALETTE.slate, cursor: "pointer" },
  tabButtonActive: { background: PALETTE.ink, color: PALETTE.bone },
  saveLabel: { fontSize: 11, color: PALETTE.slate },

  monthPicker: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, background: PALETTE.inkSoft, border: `1px solid ${PALETTE.line}`, borderRadius: 14, padding: "8px 6px" },
  monthArrow: { width: 36, height: 36, borderRadius: 10, border: `1px solid ${PALETTE.line}`, background: "transparent", color: PALETTE.bone, fontSize: 18, cursor: "pointer", lineHeight: 1 },
  monthPickerCenter: { display: "flex", flexDirection: "column", alignItems: "center", gap: 2 },
  monthPickerLabel: { fontFamily: FONT_DISPLAY, fontSize: 15, fontWeight: 700, letterSpacing: "0.01em" },
  monthJumpButton: { fontSize: 10.5, color: PALETTE.teal, background: "transparent", border: "none", cursor: "pointer", padding: 0 },

  monthBadgeRow: { marginBottom: 14 },
  monthBadge: { fontFamily: FONT_DISPLAY, fontSize: 13, fontWeight: 600, letterSpacing: "0.06em", color: PALETTE.slate, textTransform: "uppercase" },

  currencyGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 },
  currencyPanel: { background: PALETTE.inkSoft, border: `1px solid ${PALETTE.line}`, borderRadius: 16, padding: "14px 12px", display: "flex", flexDirection: "column", gap: 12 },
  currencyPanelHeader: { display: "flex", alignItems: "center" },
  currencyPanelTitle: { fontFamily: FONT_DISPLAY, fontSize: 14, fontWeight: 700, letterSpacing: "0.04em" },

  inputPair: { display: "flex", gap: 8 },
  inputCol: { flex: 1, display: "flex", flexDirection: "column", gap: 4, minWidth: 0 },
  inputLabel: { fontSize: 10.5, color: PALETTE.slate },
  input: { width: "100%", background: PALETTE.ink, border: `1px solid ${PALETTE.line}`, borderRadius: 8, padding: "8px 9px", color: PALETTE.bone, fontFamily: FONT_DISPLAY, fontSize: 14, outline: "none", boxSizing: "border-box" },
  select: { background: PALETTE.ink, border: `1px solid ${PALETTE.line}`, borderRadius: 8, padding: "8px 9px", color: PALETTE.bone, fontFamily: FONT_DISPLAY, fontSize: 14, outline: "none" },

  holdingBlock: { display: "flex", flexDirection: "column", gap: 1, paddingTop: 8, borderTop: `1px solid ${PALETTE.line}` },
  holdingLabel: { fontSize: 10.5, color: PALETTE.slate },
  holdingNumber: { fontFamily: FONT_DISPLAY, fontSize: 21, fontWeight: 700, letterSpacing: "-0.01em" },
  holdingSub: { fontSize: 10, color: PALETTE.slate },

  smallStatsRow: { display: "flex", gap: 8 },
  smallStat: { flex: 1, display: "flex", flexDirection: "column", gap: 1 },
  smallStatValue: { fontFamily: FONT_DISPLAY, fontSize: 13, fontWeight: 600 },
  smallStatLabel: { fontSize: 9.5, color: PALETTE.slate },

  main: { display: "flex", flexDirection: "column", gap: 18 },
  card: { background: PALETTE.inkSoft, border: `1px solid ${PALETTE.line}`, borderRadius: 18, padding: "18px 16px" },
  cardHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 },
  cardTitle: { fontFamily: FONT_DISPLAY, fontSize: 16, fontWeight: 600, margin: 0 },
  cardSubtitle: { fontSize: 12, color: PALETTE.slate },
  cardHeaderRight: { display: "flex", flexDirection: "column", alignItems: "flex-end" },
  cardAccentNumber: { fontFamily: FONT_DISPLAY, fontSize: 18, fontWeight: 600 },
  cardAccentLabel: { fontSize: 11, color: PALETTE.slate },

  progressTrack: { height: 6, borderRadius: 4, background: "rgba(255,255,255,0.06)", overflow: "hidden", marginBottom: 6 },
  progressFill: { height: "100%", borderRadius: 4, transition: "width 0.3s ease" },
  progressCaption: { display: "flex", justifyContent: "space-between", fontSize: 11, color: PALETTE.slate, marginBottom: 14 },

  bankGroup: { marginBottom: 14 },
  bankGroupLabel: { fontFamily: FONT_DISPLAY, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: PALETTE.slate, padding: "0 6px 6px" },

  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 },
  listItem: { margin: 0 },
  itemRow: { display: "flex", alignItems: "center", gap: 6 },
  itemButton: { width: "100%", display: "flex", alignItems: "center", gap: 10, background: "transparent", border: "none", padding: "9px 6px", borderRadius: 10, cursor: "pointer", textAlign: "left", transition: "opacity 0.15s ease" },
  checkbox: { flexShrink: 0, width: 19, height: 19, borderRadius: 6, border: `1.5px solid ${PALETTE.line}`, display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.15s ease, border-color 0.15s ease" },
  itemTextBlock: { display: "flex", flexDirection: "column", flex: 1, minWidth: 0 },
  itemLabel: { fontSize: 13.5, color: PALETTE.bone },
  itemUntil: { fontSize: 11, color: PALETTE.slate },
  itemAmount: { fontFamily: FONT_DISPLAY, fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0 },
  amountEditField: { width: 84, flexShrink: 0, background: PALETTE.ink, border: `1px solid ${PALETTE.line}`, borderRadius: 7, padding: "6px 8px", color: PALETTE.bone, fontFamily: FONT_DISPLAY, fontSize: 13, outline: "none", textAlign: "right", boxSizing: "border-box" },

  extraGroupRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 6, paddingTop: 12, borderTop: `1px solid ${PALETTE.line}` },
  extraGroupLabel: { fontSize: 11.5, color: PALETTE.slate },
  extraGroupField: { width: 90, background: PALETTE.ink, border: `1px solid ${PALETTE.line}`, borderRadius: 8, padding: "7px 9px", color: PALETTE.coral, fontFamily: FONT_DISPLAY, fontSize: 13, outline: "none", textAlign: "right", boxSizing: "border-box" },
  itemExtraRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "0 6px 6px 41px" },
  itemExtraLabel: { fontSize: 10.5, color: PALETTE.slate },
  itemExtraTag: { color: PALETTE.coral, fontSize: 11.5 },

  loanReadRow: { display: "flex", alignItems: "center", gap: 8, padding: "9px 6px" },
  editButton: { flexShrink: 0, padding: "6px 11px", borderRadius: 8, border: `1px solid ${PALETTE.line}`, background: "transparent", color: PALETTE.bone, fontFamily: FONT_DISPLAY, fontSize: 11.5, fontWeight: 600, cursor: "pointer" },
  removeButton: { flexShrink: 0, width: 26, height: 26, borderRadius: 8, border: `1px solid ${PALETTE.line}`, background: "transparent", color: PALETTE.slate, fontSize: 15, cursor: "pointer", lineHeight: 1 },

  loanTotalCard: { background: PALETTE.inkSoft, border: `1px solid ${PALETTE.line}`, borderRadius: 16, padding: "16px 14px", display: "flex", flexDirection: "column", gap: 4 },
  loanTotalValue: { fontFamily: FONT_DISPLAY, fontSize: 21, fontWeight: 700 },
  loanTotalLabel: { fontSize: 11, color: PALETTE.slate },

  addLoanButton: { width: "100%", marginTop: 6, padding: "11px 0", borderRadius: 10, border: `1.5px dashed ${PALETTE.line}`, background: "transparent", color: PALETTE.slate, fontFamily: FONT_DISPLAY, fontSize: 13, fontWeight: 600, cursor: "pointer" },
  addLoanForm: { marginTop: 14, paddingTop: 14, borderTop: `1px solid ${PALETTE.line}`, display: "flex", flexDirection: "column", gap: 8, width: "100%" },

  wheelRow: { display: "flex", gap: 6, position: "relative" },
  wheelColumnWrap: { flex: 1, position: "relative", height: WHEEL_ITEM_HEIGHT * WHEEL_VISIBLE_COUNT, overflow: "hidden", background: PALETTE.ink, border: `1px solid ${PALETTE.line}`, borderRadius: 8 },
  wheelScroll: { height: "100%", overflowY: "scroll", scrollSnapType: "y mandatory", WebkitOverflowScrolling: "touch" },
  wheelItem: { height: WHEEL_ITEM_HEIGHT, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_DISPLAY, fontSize: 16, color: PALETTE.bone, scrollSnapAlign: "start", cursor: "pointer", userSelect: "none" },
  wheelHighlight: { position: "absolute", top: "50%", left: 0, right: 0, height: WHEEL_ITEM_HEIGHT, marginTop: -WHEEL_ITEM_HEIGHT / 2, borderTop: `1px solid ${PALETTE.line}`, borderBottom: `1px solid ${PALETTE.line}`, pointerEvents: "none" },
  confirmButton: { flex: 1, padding: "9px 0", borderRadius: 8, border: "none", background: PALETTE.teal, color: PALETTE.ink, fontFamily: FONT_DISPLAY, fontSize: 13, fontWeight: 600, cursor: "pointer" },
  cancelButton: { flex: 1, padding: "9px 0", borderRadius: 8, border: `1px solid ${PALETTE.line}`, background: "transparent", color: PALETTE.slate, fontFamily: FONT_DISPLAY, fontSize: 13, fontWeight: 600, cursor: "pointer" },

  footer: { textAlign: "center", fontSize: 11, color: PALETTE.slate, marginTop: 24 },
};
