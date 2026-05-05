from rest_framework import serializers
from .models import Product, Order, Transaction


class ProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = '__all__'


class OrderSummarySerializer(serializers.ModelSerializer):
    """Minimal order data embedded in Transaction for export."""
    class Meta:
        model = Order
        fields = ['id', 'slip_number', 'items_json']


class TransactionSerializer(serializers.ModelSerializer):
    order_detail = OrderSummarySerializer(source='order', read_only=True)

    class Meta:
        model = Transaction
        fields = '__all__'


class OrderSerializer(serializers.ModelSerializer):
    transaction = TransactionSerializer(read_only=True)

    class Meta:
        model = Order
        fields = '__all__'
