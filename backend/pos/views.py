import json as _json

from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.db.models import F
from django.db.models.functions import Greatest
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

from decimal import Decimal
from .models import Product, Order, Transaction, Table, RawMaterial, ProductIngredient, RawMaterialSnapshot, Expense, CashAccount
from .serializers import ProductSerializer, OrderSerializer, TransactionSerializer, TableSerializer, RawMaterialSerializer, ProductIngredientSerializer, RawMaterialSnapshotSerializer, ExpenseSerializer, CashAccountSerializer

_channel_layer = get_channel_layer()


def _broadcast(event_type: str, data: dict):
    async_to_sync(_channel_layer.group_send)(
        'pos_updates',
        {'type': 'pos.event', 'data': {'type': event_type, **data}},
    )


class ProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.all()
    serializer_class = ProductSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.query_params.get('available') == 'true':
            qs = qs.filter(is_available=True)
        return qs

    def perform_update(self, serializer):
        instance = serializer.save()
        _broadcast('PRODUCT_UPDATE', ProductSerializer(instance).data)


class OrderViewSet(viewsets.ModelViewSet):
    queryset = Order.objects.all()
    serializer_class = OrderSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.query_params.get('status') == 'active':
            qs = qs.exclude(status__in=[Order.Status.COMPLETED, Order.Status.VOIDED])
        return qs

    def _recalc_and_broadcast(self):
        """Recalculate every product's stock from current raw-material levels and broadcast updates."""
        from decimal import Decimal
        from collections import defaultdict

        all_ings = list(ProductIngredient.objects.select_related('raw_material').all())

        by_key = defaultdict(list)
        for ing in all_ings:
            by_key[(ing.product_id, ing.variation_name or '')].append(ing)

        plain_patches = {}   # product_id → stock (int)
        var_patches   = {}   # product_id → {variation_name → stock (int)}

        for (product_id, variation_name), ings in by_key.items():
            bottleneck = None
            for ing in ings:
                mat = ing.raw_material
                stock_qty       = float(mat.stock_qty or 0)
                yield_min       = float(mat.yield_min or 0)
                qty_per_serving = float(ing.qty_per_serving or 0)
                if not yield_min or not qty_per_serving:
                    continue
                servings = int((stock_qty * yield_min) / qty_per_serving)
                if bottleneck is None or servings < bottleneck:
                    bottleneck = servings
            if bottleneck is None:
                continue
            if variation_name == '':
                plain_patches[product_id] = bottleneck
            else:
                var_patches.setdefault(product_id, {})[variation_name] = bottleneck

        for product_id in set(plain_patches) | set(var_patches):
            try:
                product = Product.objects.get(id=product_id)
                if product_id in plain_patches:
                    product.stock = plain_patches[product_id]
                if product_id in var_patches:
                    vmap = var_patches[product_id]
                    product.variations = [
                        {**v, 'stock': vmap[v['name']]} if v.get('name') in vmap else v
                        for v in (product.variations or [])
                    ]
                product.save()
                _broadcast('PRODUCT_UPDATE', ProductSerializer(product).data)
            except Product.DoesNotExist:
                pass

    def _deduct_and_recalc(self, items_json):
        """Deduct raw-material stock for ordered items, then recalc product stocks."""
        from decimal import Decimal
        from collections import defaultdict

        mat_deductions  = defaultdict(Decimal)   # raw_material_id → qty to deduct
        direct_deducts  = defaultdict(int)        # product_id → qty (no recipe products)

        for item in items_json:
            product_id = item.get('productId')
            quantity   = item.get('quantity', 0)
            if not product_id or quantity <= 0:
                continue

            try:
                product = Product.objects.get(id=product_id)
            except Product.DoesNotExist:
                continue

            # Resolve variation name from item name  (e.g. "Leg Meal - Whole" → "Whole")
            item_name = item.get('name', '')
            if product.name and item_name.startswith(product.name + ' - '):
                variation_name = item_name[len(product.name) + 3:]
            else:
                variation_name = ''

            ings = list(ProductIngredient.objects.select_related('raw_material').filter(
                product_id=product_id, variation_name=variation_name
            ))
            # Fall back to product-level recipe if no variation-specific recipe found
            if not ings and variation_name:
                ings = list(ProductIngredient.objects.select_related('raw_material').filter(
                    product_id=product_id, variation_name=''
                ))

            if ings:
                for ing in ings:
                    yield_min = Decimal(str(ing.raw_material.yield_min))
                    if yield_min > 0:
                        # stock_qty is in purchase_unit; qty_per_serving is in serving_unit.
                        # Convert: purchase_units_used = qty_per_serving / yield_min
                        deduction = Decimal(str(ing.qty_per_serving)) / yield_min * quantity
                        mat_deductions[ing.raw_material_id] += deduction
            elif product.stock is not None:
                # No recipe at all — fall back to direct product.stock deduction
                direct_deducts[product_id] += quantity

        # Apply raw-material deductions
        for mat_id, qty in mat_deductions.items():
            RawMaterial.objects.filter(id=mat_id).update(
                stock_qty=Greatest(F('stock_qty') - qty, 0)
            )

        # Recalculate all product stocks from updated raw-material levels
        if mat_deductions:
            self._recalc_and_broadcast()

        # Direct product.stock deductions for products with no recipe
        for product_id, qty in direct_deducts.items():
            Product.objects.filter(
                id=product_id, stock__isnull=False
            ).update(stock=Greatest(F('stock') - qty, 0))
            try:
                product = Product.objects.get(id=product_id)
                _broadcast('PRODUCT_UPDATE', ProductSerializer(product).data)
            except Product.DoesNotExist:
                pass

    def perform_create(self, serializer):
        order = serializer.save()
        if order.status == Order.Status.COMPLETED:
            completed_at = timezone.now()
            raw_dt = self.request.data.get('completed_at')
            if raw_dt:
                parsed = parse_datetime(raw_dt)
                if parsed:
                    completed_at = parsed
            Transaction.objects.get_or_create(
                order=order,
                defaults={'total': order.total, 'completed_at': completed_at},
            )
            # Deduct stock for live internal records (employee meals, waste, bulk).
            # History imports set a past completed_at and have order_mode=REGULAR so they skip this.
            if order.order_mode in [Order.OrderMode.EMPLOYEE, Order.OrderMode.WASTE, Order.OrderMode.BULK]:
                self._deduct_and_recalc(order.items_json)
        else:
            self._deduct_and_recalc(order.items_json)
            _broadcast('NEW_ORDER', OrderSerializer(order).data)

    def perform_update(self, serializer):
        instance = serializer.instance
        new_status = serializer.validated_data.get('status', instance.status)
        new_is_unpaid = serializer.validated_data.get('is_unpaid', instance.is_unpaid)
        if new_status == Order.Status.COMPLETED and new_is_unpaid:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'detail': 'Cannot complete an unpaid order. Mark as paid first.'})

        # Capture old items before saving so we can diff and deduct net additions
        old_items = list(instance.items_json or []) if 'items_json' in serializer.validated_data else None

        order = serializer.save()
        if order.status == Order.Status.COMPLETED:
            Transaction.objects.get_or_create(
                order=order,
                defaults={'total': order.total, 'completed_at': timezone.now()},
            )

        # Deduct inventory for any net-new quantities added during the edit
        if old_items is not None:
            old_qty_map: dict = {}
            for item in old_items:
                name = item.get('name', '')
                old_qty_map[name] = old_qty_map.get(name, 0) + item.get('quantity', 0)
            delta = []
            for item in (order.items_json or []):
                name = item.get('name', '')
                net = item.get('quantity', 0) - old_qty_map.get(name, 0)
                if net > 0:
                    delta.append({**item, 'quantity': net})
            if delta:
                self._deduct_and_recalc(delta)

        _broadcast('ORDER_STATUS_UPDATE', OrderSerializer(order).data)


class TransactionViewSet(viewsets.ModelViewSet):
    queryset = Transaction.objects.select_related('order').all()
    serializer_class = TransactionSerializer
    http_method_names = ['get', 'patch', 'head', 'options']

    def get_queryset(self):
        qs = super().get_queryset()
        mode = self.request.query_params.get('order_mode')
        if mode:
            qs = qs.filter(order__order_mode=mode)
        date = self.request.query_params.get('date')
        if date:
            qs = qs.filter(completed_at__date=date)
        return qs


class TableViewSet(viewsets.ModelViewSet):
    queryset = Table.objects.all()
    serializer_class = TableSerializer


class RawMaterialViewSet(viewsets.ModelViewSet):
    queryset = RawMaterial.objects.all()
    serializer_class = RawMaterialSerializer


class RawMaterialSnapshotViewSet(viewsets.ModelViewSet):
    queryset = RawMaterialSnapshot.objects.all()
    serializer_class = RawMaterialSnapshotSerializer
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def perform_create(self, serializer):
        data = [
            {
                'id': m.id,
                'name': m.name,
                'stock_qty': str(m.stock_qty),
                'purchase_unit': m.purchase_unit,
            }
            for m in RawMaterial.objects.all()
        ]
        serializer.save(data=data)

    def partial_update(self, request, *args, **kwargs):
        instance = self.get_object()
        raw = request.data.get('saved_at')
        if raw:
            parsed = parse_datetime(raw)
            if parsed:
                instance.saved_at = parsed
                instance.save(update_fields=['saved_at'])
        return Response(self.get_serializer(instance).data)

    @action(detail=True, methods=['get'])
    def projection(self, request, pk=None):
        from decimal import Decimal
        from collections import defaultdict

        snap = self.get_object()

        # Starting stock keyed by raw_material id
        stock = {entry['id']: Decimal(str(entry['stock_qty'])) for entry in snap.data}

        # All non-voided orders created after the snapshot
        orders = Order.objects.filter(
            created_at__gte=snap.saved_at
        ).exclude(status=Order.Status.VOIDED)

        mat_deductions = defaultdict(Decimal)

        for order in orders:
            for item in order.items_json:
                product_id = item.get('productId')
                quantity   = item.get('quantity', 0)
                if not product_id or quantity <= 0:
                    continue

                try:
                    product = Product.objects.get(id=product_id)
                except Product.DoesNotExist:
                    continue

                item_name = item.get('name', '')
                if product.name and item_name.startswith(product.name + ' - '):
                    variation_name = item_name[len(product.name) + 3:]
                else:
                    variation_name = ''

                ings = list(ProductIngredient.objects.select_related('raw_material').filter(
                    product_id=product_id, variation_name=variation_name
                ))
                if not ings and variation_name:
                    ings = list(ProductIngredient.objects.select_related('raw_material').filter(
                        product_id=product_id, variation_name=''
                    ))

                for ing in ings:
                    yield_min = Decimal(str(ing.raw_material.yield_min))
                    if yield_min > 0:
                        deduction = Decimal(str(ing.qty_per_serving)) / yield_min * quantity
                        mat_deductions[ing.raw_material_id] += deduction

        items = []
        for entry in snap.data:
            mat_id   = entry['id']
            original = Decimal(str(entry['stock_qty']))
            used     = mat_deductions.get(mat_id, Decimal('0'))
            remaining = max(original - used, Decimal('0'))
            items.append({
                'id':           mat_id,
                'name':         entry['name'],
                'purchase_unit': entry['purchase_unit'],
                'snapshot_qty': str(original),
                'used_qty':     str(used.quantize(Decimal('0.001'))),
                'remaining_qty': str(remaining.quantize(Decimal('0.001'))),
            })

        return Response({
            'snapshot_id':       snap.id,
            'snapshot_saved_at': snap.saved_at,
            'order_count':       orders.count(),
            'items':             items,
        })


class ProductIngredientViewSet(viewsets.ModelViewSet):
    queryset = ProductIngredient.objects.select_related('raw_material', 'product').all()
    serializer_class = ProductIngredientSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        product_id = self.request.query_params.get('product')
        if product_id:
            qs = qs.filter(product_id=product_id)
        return qs


# ── Sync endpoints ────────────────────────────────────────────────────────────

class SyncPushView(APIView):
    """Android bulk-pushes its Room records here on reconnect."""

    def post(self, request):
        data = request.data

        for p in data.get('products', []):
            android_id = p.pop('id', None)
            Product.objects.update_or_create(
                android_id=android_id,
                defaults={**p, 'android_id': android_id},
            )

        for o in data.get('orders', []):
            android_id = o.pop('id', None)
            o.pop('transaction', None)
            Order.objects.update_or_create(
                android_id=android_id,
                defaults={**o, 'android_id': android_id, 'source': 'android'},
            )

        for t in data.get('transactions', []):
            android_id = t.pop('id', None)
            order_android_id = t.pop('order_id', None)
            try:
                order = Order.objects.get(android_id=order_android_id)
                Transaction.objects.update_or_create(
                    android_id=android_id,
                    defaults={**t, 'android_id': android_id, 'order': order},
                )
            except Order.DoesNotExist:
                pass

        return Response({'status': 'synced'})


class SyncPullView(APIView):
    """Android pulls changes it missed while offline."""

    def get(self, request):
        since_param = request.query_params.get('since')
        filter_kwargs = {}
        if since_param:
            since_dt = parse_datetime(since_param)
            if since_dt:
                filter_kwargs['updated_at__gt'] = since_dt

        products = Product.objects.filter(**filter_kwargs)
        orders = Order.objects.filter(**filter_kwargs)

        return Response({
            'products': ProductSerializer(products, many=True).data,
            'orders': OrderSerializer(orders, many=True).data,
        })


class CashAccountViewSet(viewsets.ModelViewSet):
    queryset = CashAccount.objects.all()
    serializer_class = CashAccountSerializer


class ExpenseViewSet(viewsets.ModelViewSet):
    queryset = Expense.objects.all()
    serializer_class = ExpenseSerializer

    def _expense_total(self, items):
        return Decimal(str(sum(float(i.get('amount', 0)) for i in items)))

    def perform_create(self, serializer):
        expense = serializer.save()
        if expense.account_id:
            CashAccount.objects.filter(pk=expense.account_id).update(
                balance=F('balance') - self._expense_total(expense.items)
            )

    def perform_destroy(self, instance):
        if instance.account_id:
            CashAccount.objects.filter(pk=instance.account_id).update(
                balance=F('balance') + self._expense_total(instance.items)
            )
        instance.delete()


class BulkImportView(APIView):
    # Fields to skip per table (auto-timestamps, computed serializer fields)
    _SKIP = {
        'products':      {'updated_at'},
        'orders':        {'created_at', 'updated_at'},
        'transactions':  {'order_detail'},
        'tables':        set(),
        'raw_materials': {'updated_at'},
        'recipes':       {'raw_material_name', 'serving_unit', 'purchase_unit',
                          'stock_qty', 'yield_min', 'yield_max'},
        'expenses':      {'created_at', 'account_name'},
        'cash_accounts': {'created_at'},
    }
    _JSON   = {
        'products': {'variations'},
        'orders':   {'items_json'},
        'expenses': {'items'},
    }
    _BOOL = {
        'products': {'is_available'},
        'orders':   {'is_unpaid'},
        'tables':   {'is_active'},
    }
    # Nullable integer fields (empty string → None)
    _INT = {
        'products':     {'android_id', 'stock', 'pieces_per_serving'},
        'orders':       {'android_id'},
        'transactions': {'android_id'},
    }
    # FK fields — stored as <field>_id in DB, value is an int
    _FK = {
        'transactions': {'order'},
        'recipes':      {'product', 'raw_material'},
        'expenses':     {'account'},
    }
    _MODEL = {
        'products':      Product,
        'orders':        Order,
        'transactions':  Transaction,
        'tables':        Table,
        'raw_materials': RawMaterial,
        'recipes':       ProductIngredient,
        'expenses':      Expense,
        'cash_accounts': CashAccount,
    }

    def post(self, request, table):
        if table not in self._MODEL:
            return Response({'error': f'Unknown table: {table}'}, status=400)

        rows = request.data.get('rows', [])
        if not isinstance(rows, list):
            return Response({'error': 'rows must be a list'}, status=400)

        Model      = self._MODEL[table]
        skip_set   = self._SKIP.get(table, set())
        json_set   = self._JSON.get(table, set())
        bool_set   = self._BOOL.get(table, set())
        int_set    = self._INT.get(table, set())
        fk_set     = self._FK.get(table, set())

        created = updated = errors = 0
        for raw in rows:
            try:
                row = {}
                for k, v in raw.items():
                    if k in skip_set:
                        continue
                    empty = v == '' or v is None
                    if k in json_set:
                        row[k] = _json.loads(v) if (not empty and isinstance(v, str)) else ([] if empty else v)
                    elif k in bool_set:
                        row[k] = str(v).lower() in ('true', '1', 'yes')
                    elif k in int_set:
                        row[k] = int(float(str(v))) if not empty else None
                    elif k in fk_set:
                        row[k + '_id'] = int(float(str(v))) if not empty else None
                    else:
                        row[k] = v if v is not None else ''

                raw_id = row.pop('id', None)
                if raw_id is not None:
                    try:
                        row_id = int(float(str(raw_id)))
                    except (ValueError, TypeError):
                        row_id = None
                else:
                    row_id = None

                if row_id is not None:
                    _, was_created = Model.objects.update_or_create(pk=row_id, defaults=row)
                else:
                    Model.objects.create(**row)
                    was_created = True

                if was_created:
                    created += 1
                else:
                    updated += 1
            except Exception:
                errors += 1

        return Response({'created': created, 'updated': updated, 'errors': errors})
