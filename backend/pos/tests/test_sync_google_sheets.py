from datetime import datetime
from types import SimpleNamespace
from zoneinfo import ZoneInfo

from django.test import SimpleTestCase

from pos.management.commands.sync_google_sheets import Command


class MissingPaymentRowsTests(SimpleTestCase):
    def transaction(self, method, day=3):
        return SimpleNamespace(
            completed_at=datetime(2026, 8, day, 12, tzinfo=ZoneInfo("Asia/Manila")),
            payment_method=method,
            order=SimpleNamespace(payment_method=method),
        )

    def test_adds_zero_gcash_row_when_day_only_has_cash(self):
        rows = Command()._missing_payment_rows([self.transaction("CASH")], set())

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0][1], "2026-08-03")
        self.assertEqual(rows[0][5], 0)
        self.assertEqual(rows[0][6], "GCASH")

    def test_adds_no_rows_when_both_methods_exist(self):
        transactions = [self.transaction("CASH"), self.transaction("GCASH")]

        self.assertEqual(Command()._missing_payment_rows(transactions, set()), [])

    def test_does_not_repeat_existing_placeholder(self):
        command = Command()
        placeholder_id = command._placeholder_id(
            self.transaction("CASH").completed_at.date(), "GCASH"
        )

        rows = command._missing_payment_rows(
            [self.transaction("CASH")], {placeholder_id}
        )

        self.assertEqual(rows, [])


class TransactionRowsTests(SimpleTestCase):
    def test_creates_one_row_per_item_with_line_totals_and_customer(self):
        order = SimpleNamespace(
            id=2486,
            slip_number="",
            payment_method="CASH",
            order_type="DINE_IN",
            customer_name="Juan Dela Cruz",
            status="COMPLETED",
            items_json=[
                {"name": "Leg - Unli", "price": 159, "quantity": 1},
                {"name": "Pechopak - Unli", "price": 179, "quantity": 1},
                {"name": "Icetea - Icetea Glass", "price": 39, "quantity": 2},
            ],
        )
        transaction = SimpleNamespace(
            id=2380,
            completed_at=datetime(2026, 8, 4, 19, 17, tzinfo=ZoneInfo("Asia/Manila")),
            payment_method="CASH",
            total=416,
            order=order,
        )

        rows = Command()._rows(transaction)

        self.assertEqual(len(rows), 3)
        self.assertEqual([row[5] for row in rows], [159.0, 179.0, 78.0])
        self.assertEqual(
            [row[8] for row in rows],
            ["1x Leg - Unli", "1x Pechopak - Unli", "2x Icetea - Icetea Glass"],
        )
        self.assertEqual([row[10] for row in rows], ["Juan Dela Cruz"] * 3)
