import json
import time
from pathlib import Path

from django.conf import settings
from django.db import close_old_connections
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from google.auth.transport.requests import Request
from google.auth.exceptions import RefreshError
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from pos.models import Transaction


SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]
HEADERS = [
    "Transaction ID",
    "Date",
    "Time",
    "Slip Number",
    "Order ID",
    "Total Sale",
    "Payment Method",
    "Order Type",
    "Items",
    "Status",
    "Customer Name",
]
PAYMENT_METHODS = ("CASH", "GCASH")


class Command(BaseCommand):
    help = "Append completed POS transactions to a Google Spreadsheet."

    def add_arguments(self, parser):
        parser.add_argument("spreadsheet_id", help="ID from the Google Sheets URL")
        parser.add_argument("--sheet", default="Transactions", help="Tab name (default: Transactions)")
        parser.add_argument("--watch", action="store_true", help="Keep syncing new transactions")
        parser.add_argument("--interval", type=int, default=60, help="Watch interval in seconds (default: 60)")

    def handle(self, *args, **options):
        spreadsheet_id = options["spreadsheet_id"].strip()
        sheet_name = options["sheet"].strip()
        watch = options["watch"]
        interval = options["interval"]
        if interval < 10:
            raise CommandError("The sync interval must be at least 10 seconds.")
        backend_dir = Path(settings.BASE_DIR)
        credentials_path = backend_dir / "credentials.json"
        token_path = backend_dir / "token.json"

        if not credentials_path.exists():
            raise CommandError(f"Google OAuth file not found: {credentials_path}")

        try:
            credentials = self._credentials(credentials_path, token_path)
            service = build("sheets", "v4", credentials=credentials)
            self._ensure_sheet(service, spreadsheet_id, sheet_name)
            sheet_rows = self._sheet_rows(service, spreadsheet_id, sheet_name)
            synced, updated = self._sync_once(service, spreadsheet_id, sheet_name, sheet_rows)
            if synced or updated:
                self.stdout.write(
                    self.style.SUCCESS(f"Synced {synced} new and updated {updated} transaction(s) in {sheet_name}.")
                )
            else:
                self.stdout.write(self.style.SUCCESS("Google Sheets is already up to date."))

            if not watch:
                return

            self.stdout.write(self.style.SUCCESS(f"Automatic sync active (every {interval} seconds)."))
            while True:
                time.sleep(interval)
                close_old_connections()
                try:
                    synced, updated = self._sync_once(service, spreadsheet_id, sheet_name, sheet_rows)
                    if synced or updated:
                        self.stdout.write(
                            self.style.SUCCESS(
                                f"Synced {synced} new and updated {updated} transaction(s) in {sheet_name}."
                            )
                        )
                except HttpError as error:
                    self.stderr.write(f"Google sync failed; will retry: {error}")
                except OSError as error:
                    self.stderr.write(f"Network error; will retry: {error}")
        except KeyboardInterrupt:
            self.stdout.write("Automatic Google Sheets sync stopped.")
        except HttpError as error:
            raise CommandError(f"Google Sheets API error: {error}") from error

    def _sync_once(self, service, spreadsheet_id, sheet_name, sheet_rows):
        existing_ids = set(sheet_rows)
        current = {
            transaction.id: transaction
            for transaction in Transaction.objects.select_related("order").filter(id__in=existing_ids)
        }
        cell_updates = []
        updated_transaction_ids = set()
        for transaction_id, transaction_rows in sheet_rows.items():
            if transaction_id < 0:
                continue
            transaction = current.get(transaction_id)
            desired_status = self._status(transaction) if transaction else "DELETED"
            desired_payment_method = None
            if transaction:
                desired_payment_method = (
                    transaction.payment_method or transaction.order.payment_method
                ).strip().upper()

            for sheet_row in transaction_rows:
                if sheet_row["status"] != desired_status:
                    cell_updates.append(
                        {
                            "range": f"'{sheet_name}'!J{sheet_row['row']}",
                            "values": [[desired_status]],
                        }
                    )
                    updated_transaction_ids.add(transaction_id)
                if transaction and sheet_row["payment_method"] != desired_payment_method:
                    cell_updates.append(
                        {
                            "range": f"'{sheet_name}'!G{sheet_row['row']}",
                            "values": [[desired_payment_method]],
                        }
                    )
                    updated_transaction_ids.add(transaction_id)

        if cell_updates:
            service.spreadsheets().values().batchUpdate(
                spreadsheetId=spreadsheet_id,
                body={"valueInputOption": "RAW", "data": cell_updates},
            ).execute()
            for transaction_id, transaction_rows in sheet_rows.items():
                if transaction_id < 0:
                    continue
                transaction = current.get(transaction_id)
                for sheet_row in transaction_rows:
                    sheet_row["status"] = self._status(transaction) if transaction else "DELETED"
                    if transaction:
                        sheet_row["payment_method"] = (
                            transaction.payment_method or transaction.order.payment_method
                        ).strip().upper()

        transactions = list(
            Transaction.objects.select_related("order")
            .exclude(id__in=existing_ids)
            .order_by("completed_at", "id")
        )
        all_transactions = list(
            Transaction.objects.select_related("order").order_by("completed_at", "id")
        )
        zero_rows = self._missing_payment_rows(all_transactions, existing_ids)
        transaction_rows = [
            (transaction, row)
            for transaction in transactions
            for row in self._rows(transaction)
        ]
        rows_to_append = [row for _, row in transaction_rows] + zero_rows
        if rows_to_append:
            service.spreadsheets().values().append(
                spreadsheetId=spreadsheet_id,
                range=f"'{sheet_name}'!A:K",
                valueInputOption="USER_ENTERED",
                insertDataOption="INSERT_ROWS",
                body={"values": rows_to_append},
            ).execute()
            first_row = max(
                (row["row"] for rows in sheet_rows.values() for row in rows),
                default=1,
            ) + 1
            for offset, (transaction, _) in enumerate(transaction_rows):
                sheet_rows.setdefault(transaction.id, []).append({
                    "row": first_row + offset,
                    "status": self._status(transaction),
                    "payment_method": (
                        transaction.payment_method or transaction.order.payment_method
                    ).strip().upper(),
                })
            for offset, row in enumerate(zero_rows, start=len(transaction_rows)):
                sheet_rows[row[0]] = [{
                    "row": first_row + offset,
                    "status": row[9],
                    "payment_method": row[6],
                }]
        return len(transactions) + len(zero_rows), len(updated_transaction_ids)

    def _missing_payment_rows(self, transactions, existing_ids):
        methods_by_date = {}
        for transaction in transactions:
            date = timezone.localtime(transaction.completed_at).date()
            method = (transaction.payment_method or transaction.order.payment_method).strip().upper()
            methods_by_date.setdefault(date, set()).add(method)

        rows = []
        for date in sorted(methods_by_date):
            for method in PAYMENT_METHODS:
                placeholder_id = self._placeholder_id(date, method)
                if method not in methods_by_date[date] and placeholder_id not in existing_ids:
                    rows.append([
                        placeholder_id, date.isoformat(), "", "", "", 0,
                        method, "", "", "PLACEHOLDER", "",
                    ])
        return rows

    def _placeholder_id(self, date, method):
        method_number = PAYMENT_METHODS.index(method) + 1
        return -(int(date.strftime("%Y%m%d")) * 10 + method_number)

    def _credentials(self, credentials_path, token_path):
        credentials = None
        if token_path.exists():
            credentials = Credentials.from_authorized_user_file(token_path, SCOPES)

        if not credentials or not credentials.valid:
            if credentials and credentials.expired and credentials.refresh_token:
                try:
                    credentials.refresh(Request())
                except RefreshError:
                    self.stderr.write(
                        self.style.WARNING(
                            "The saved Google authorization has expired or was revoked; "
                            "reauthorization is required."
                        )
                    )
                    credentials = None
            if not credentials or not credentials.valid:
                flow = InstalledAppFlow.from_client_secrets_file(credentials_path, SCOPES)
                credentials = flow.run_local_server(port=0)
            token_path.write_text(credentials.to_json(), encoding="utf-8")
        return credentials

    def _ensure_sheet(self, service, spreadsheet_id, sheet_name):
        metadata = service.spreadsheets().get(
            spreadsheetId=spreadsheet_id,
            fields="sheets.properties.title",
        ).execute()
        titles = {sheet["properties"]["title"] for sheet in metadata.get("sheets", [])}
        if sheet_name not in titles:
            service.spreadsheets().batchUpdate(
                spreadsheetId=spreadsheet_id,
                body={"requests": [{"addSheet": {"properties": {"title": sheet_name}}}]},
            ).execute()

        service.spreadsheets().values().update(
            spreadsheetId=spreadsheet_id,
            range=f"'{sheet_name}'!A1:K1",
            valueInputOption="RAW",
            body={"values": [HEADERS]},
        ).execute()

    def _sheet_rows(self, service, spreadsheet_id, sheet_name):
        result = service.spreadsheets().values().get(
            spreadsheetId=spreadsheet_id,
            range=f"'{sheet_name}'!A2:K",
        ).execute()
        rows = {}
        for row_number, row in enumerate(result.get("values", []), start=2):
            if row:
                try:
                    transaction_id = int(row[0])
                except (TypeError, ValueError):
                    continue
                rows.setdefault(transaction_id, []).append({
                    "row": row_number,
                    "status": row[9].strip().upper() if len(row) > 9 else "",
                    "payment_method": row[6].strip().upper() if len(row) > 6 else "",
                })
        return rows

    def _rows(self, transaction):
        order = transaction.order
        completed = timezone.localtime(transaction.completed_at)
        payment_method = transaction.payment_method or order.payment_method
        items = order.items_json if isinstance(order.items_json, list) else [order.items_json]
        if not items:
            items = [None]

        rows = []
        for item in items:
            rows.append([
                transaction.id,
                completed.strftime("%Y-%m-%d"),
                completed.strftime("%I:%M %p"),
                order.slip_number or "",
                order.id,
                self._item_total(item, transaction.total),
                payment_method,
                order.order_type,
                self._item_label(item),
                self._status(transaction),
                order.customer_name or "",
            ])
        return rows

    def _item_total(self, item, fallback_total):
        if not isinstance(item, dict) or "price" not in item:
            return float(fallback_total)
        try:
            price = float(item["price"])
            quantity = float(item.get("quantity", item.get("qty", 1)))
            discount = float(item.get("discount", 0) or 0)
            return round(price * quantity * (1 - discount / 100), 2)
        except (TypeError, ValueError):
            return float(fallback_total)

    def _status(self, transaction):
        return "VOIDED" if transaction.order.status == "VOIDED" else "COMPLETED"

    def _items(self, items):
        if not isinstance(items, list):
            return json.dumps(items, ensure_ascii=False)

        labels = []
        for item in items:
            if not isinstance(item, dict):
                labels.append(str(item))
                continue
            name = item.get("name") or item.get("product_name") or item.get("productName") or "Item"
            quantity = item.get("quantity", item.get("qty", 1))
            variation = item.get("variation_name") or item.get("variationName") or ""
            label = f"{quantity}x {name}"
            if variation:
                label += f" ({variation})"
            labels.append(label)
        return ", ".join(labels)

    def _item_label(self, item):
        return self._items([item]) if isinstance(item, dict) else str(item or "")
