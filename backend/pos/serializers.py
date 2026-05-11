from rest_framework import serializers
from .models import Product, Order, Transaction, Table, RawMaterial, ProductIngredient, RawMaterialSnapshot


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


class RawMaterialSnapshotSerializer(serializers.ModelSerializer):
    class Meta:
        model = RawMaterialSnapshot
        fields = '__all__'
        read_only_fields = ['saved_at', 'data']


class ProductIngredientSerializer(serializers.ModelSerializer):
    raw_material_name = serializers.CharField(source='raw_material.name', read_only=True)
    serving_unit = serializers.CharField(source='raw_material.serving_unit', read_only=True)
    purchase_unit = serializers.CharField(source='raw_material.purchase_unit', read_only=True)
    stock_qty = serializers.DecimalField(source='raw_material.stock_qty', max_digits=10, decimal_places=3, read_only=True)
    yield_min = serializers.DecimalField(source='raw_material.yield_min', max_digits=10, decimal_places=3, read_only=True)
    yield_max = serializers.DecimalField(source='raw_material.yield_max', max_digits=10, decimal_places=3, read_only=True)

    class Meta:
        model = ProductIngredient
        fields = '__all__'
