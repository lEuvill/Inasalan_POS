from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.views import APIView
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

from .models import Product, Order, Transaction
from .serializers import ProductSerializer, OrderSerializer, TransactionSerializer

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
        else:
            _broadcast('NEW_ORDER', OrderSerializer(order).data)

    def perform_update(self, serializer):
        order = serializer.save()
        if order.status == Order.Status.COMPLETED:
            Transaction.objects.get_or_create(
                order=order,
                defaults={'total': order.total, 'completed_at': timezone.now()},
            )
        _broadcast('ORDER_STATUS_UPDATE', OrderSerializer(order).data)


class TransactionViewSet(viewsets.ModelViewSet):
    queryset = Transaction.objects.select_related('order').all()
    serializer_class = TransactionSerializer
    http_method_names = ['get', 'patch', 'head', 'options']


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
