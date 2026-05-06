from rest_framework import serializers
from .models import Product, Order, Transaction, Table, RawMaterial


class ProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = '__all__'


class OrderSummarySerializer(serializers.ModelSerializer):
    """Minimal order data embedded in Transaction for export."""
    class Meta:
        model = Order
        fields = ['id', 'slip_number', 'order_type', 'payment_method', 'table_number', 'items_json']


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


class TableSerializer(serializers.ModelSerializer):
    class Meta:
        model = Table
        fields = '__all__'


class RawMaterialSerializer(serializers.ModelSerializer):
    class Meta:
        model = RawMaterial
        fields = '__all__'
