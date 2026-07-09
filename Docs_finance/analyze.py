# -*- coding: utf-8 -*-
import csv, json, re
from collections import defaultdict

BASE = r"C:\Users\Public\POS\Inasalan_POS\Docs_finance"

# ---------- Expenses ----------
exp_rows = []
with open(BASE + r"\Expense.txt", encoding="utf-8-sig") as f:
    for line in f:
        parts = line.rstrip("\n").split("\t")
        if len(parts) < 3:
            continue
        date, desc, amt = parts[0].strip(), parts[1].strip(), parts[2].strip()
        idx = ""
        if not amt:
            continue
        try:
            val = float(amt.replace(",", ""))
        except ValueError:
            continue
        if not desc:  # bare subtotal rows
            print("SKIP (no desc):", idx, date, amt)
            continue
        if "total expense" in desc.lower():
            print("SKIP (subtotal):", idx, date, desc, amt)
            continue
        exp_rows.append((date, desc, val))

def categorize(desc):
    d = desc.lower()
    if any(k in d for k in ["salary", "payroll", "allowance", "utang"]) or re.search(r"\bca\b", d):
        return "Labor (salaries & cash advances)"
    if any(k in d for k in ["chicken", "kasim", "liempo", "cut charge", "wings powder"]) and "powder soap" not in d:
        return "Meat (chicken & pork)"
    if any(k in d for k in ["rice", "bigas", "alsa", "royal sheep"]):
        return "Rice"
    if any(k in d for k in ["rent"]):
        return "Rent"
    if any(k in d for k in ["loan", "homecredit", "atome"]):
        return "Loans / debt payments"
    if any(k in d for k in ["gasul", "lpg", "gas", "butane", "charcoal", "uling", "prycegas", "thai elephant"]):
        return "Fuel & energy (LPG, charcoal, gasoline)"
    if any(k in d for k in ["coke", "sprite", "nestea", "mismo", "softdrink", "soda", "royal", "lipton", "tea", "coffee", "water", "mineral", "vanilla", "condensada", "condense", "evap", "cream", "fmilk", "fruit", "saging", "smores", "patcakes", "chuckie", "dutch", "flat tops", "sktt"]):
        return "Beverages & dessert supplies"
    if any(k in d for k in ["soy", "sauce", "sinigang", "ginisa", "knorr", "knor", "aji", "vetsin", "vetcin", "betsin", "vetchin", "sugar", "salt", "asin", "pepper", "paminta", "lemon", "kalamansi", "garlic", "bawang", "sili", "luya", "ketchup", "catsup", "ketchuo", "patis", "atsueta", "seasoning", "egg", "hotdog", "spam", "vermicelli", "pumpkin", "sitaw", "mongo", "fish", "oil", "ice", "toothpick", "bbq stick", "spoon"]):
        return "Food ingredients & kitchen supplies"
    if any(k in d for k in ["bir", "booklet", "photocopy", "certificate", "ballpen", "receipt"]):
        return "Admin / permits"
    return "Other supplies & misc"

cat = defaultdict(float)
total_exp = 0.0
for date, desc, val in exp_rows:
    cat[categorize(desc)] += val
    total_exp += val

print("\n=== EXPENSES (June 2026) ===")
print("Line items:", len(exp_rows))
print("TOTAL: %.2f" % total_exp)
for k, v in sorted(cat.items(), key=lambda x: -x[1]):
    print("  %-45s %12.2f  (%.1f%%)" % (k, v, v/total_exp*100))

# top individual expense lines
print("\nTop 15 expense lines:")
for date, desc, val in sorted(exp_rows, key=lambda x: -x[2])[:15]:
    print("  %s  %-45s %10.2f" % (date, desc[:45], val))

# labor detail
print("\nLabor detail (by person-ish):")
labor = defaultdict(float)
for date, desc, val in exp_rows:
    if categorize(desc) == "Labor (salaries & cash advances)":
        labor[desc] += val
for k, v in sorted(labor.items(), key=lambda x: -x[1])[:25]:
    print("  %-50s %10.2f" % (k[:50], v))

# ---------- Sales ----------
months = defaultdict(float)
days = defaultdict(float)
item_rev = defaultdict(float)
item_qty = defaultdict(int)
otype_rev = defaultdict(float)
otype_cnt = defaultdict(int)
pay = defaultdict(float)
n_orders = 0
june_total = 0.0
june_orders = 0

with open(BASE + r"\inasalan_transactions_2026-07-07.csv", encoding="utf-8-sig", newline="") as f:
    for row in csv.DictReader(f):
        total = float(row["total"])
        dt = row["completed_at"][:10]
        month = dt[:7]
        months[month] += total
        days[dt] += total
        n_orders += 1
        od = json.loads(row["order_detail"])
        otype_rev[od.get("order_type", "?")] += total
        otype_cnt[od.get("order_type", "?")] += 1
        pay[row.get("payment_method") or "?"] += total
        if month == "2026-06":
            june_total += total
            june_orders += 1
        for it in od.get("items_json", []):
            name = it["name"]
            qty = it.get("quantity", 1)
            price = it.get("price", 0)
            disc = it.get("discount", 0) or 0
            rev = price * qty * (1 - disc / 100.0)
            item_rev[name] += rev
            item_qty[name] += qty
            if month == "2026-06":
                item_rev["JUNE::" + name] += rev
                item_qty["JUNE::" + name] += qty

print("\n=== SALES ===")
print("Total orders in file:", n_orders)
for m in sorted(months):
    print("  %s : %12.2f" % (m, months[m]))
print("June 2026: %.2f over %d orders" % (june_total, june_orders))

jd = sorted(d for d in days if d.startswith("2026-06"))
if jd:
    vals = [days[d] for d in jd]
    print("June days with sales: %d, avg/day %.2f, best day %s (%.2f), worst %s (%.2f)" % (
        len(jd), sum(vals)/len(vals),
        max(jd, key=lambda d: days[d]), max(vals),
        min(jd, key=lambda d: days[d]), min(vals)))

print("\nOrder types (all time): ")
for k in otype_rev:
    print("  %-10s %8d orders %12.2f" % (k, otype_cnt[k], otype_rev[k]))
print("\nPayment methods (all time):")
for k, v in sorted(pay.items(), key=lambda x: -x[1]):
    print("  %-8s %12.2f" % (k, v))

print("\nTop items ALL TIME (by revenue):")
allt = [(k, v) for k, v in item_rev.items() if not k.startswith("JUNE::")]
for k, v in sorted(allt, key=lambda x: -x[1])[:20]:
    print("  %-30s qty %5d  rev %12.2f" % (k, item_qty[k], v))

print("\nTop items JUNE 2026 (by revenue):")
june = [(k[6:], v) for k, v in item_rev.items() if k.startswith("JUNE::")]
for k, v in sorted(june, key=lambda x: -x[1])[:20]:
    print("  %-30s qty %5d  rev %12.2f" % (k, item_qty["JUNE::" + k], v))
