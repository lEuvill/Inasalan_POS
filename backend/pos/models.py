from django.db import models


class Product(models.Model):
    # android_id links this record to the Room DB row on the Android device
    android_id = models.IntegerField(unique=True, null=True, blank=True)
    name = models.CharField(max_length=255)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    category = models.CharField(max_length=100, blank=True)
    image_path = models.TextField(blank=True)
    is_available = models.BooleanField(default=True)
    # e.g. [{"name": "Meal", "price": "120.00"}, {"name": "Solo", "price": "90.00"}]
    variations = models.JSONField(default=list, blank=True)
    # Export mapping — used when generating sales export files
    output_name = models.CharField(max_length=255, blank=True)
    output_code = models.CharField(max_length=50, blank=True)
    stock = models.IntegerField(null=True, blank=True)
    pieces_per_serving = models.IntegerField(default=1)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['category', 'name']

    def __str__(self):
        return self.name


class Order(models.Model):
    class Status(models.TextChoices):
        PENDING = 'PENDING'
        PREPARING = 'PREPARING'
        READY = 'READY'
        COMPLETED = 'COMPLETED'
        VOIDED = 'VOIDED'

    class OrderType(models.TextChoices):
        DINE_IN = 'DINE_IN', 'Dine In'
        TAKE_OUT = 'TAKE_OUT', 'Take Out'
        DELIVERY = 'DELIVERY', 'Delivery'
        PICK_UP = 'PICK_UP', 'Pick Up'

    class PaymentMethod(models.TextChoices):
        CASH = 'CASH', 'Cash'
        GCASH = 'GCASH', 'GCash'

    class OrderMode(models.TextChoices):
        REGULAR  = 'REGULAR',  'Regular'
        EMPLOYEE = 'EMPLOYEE', 'Employee'
        WASTE    = 'WASTE',    'Waste'
        BULK     = 'BULK',     'Bulk'

    android_id = models.IntegerField(unique=True, null=True, blank=True)
    slip_number = models.CharField(max_length=20, blank=True, null=True)
    order_type = models.CharField(max_length=20, choices=OrderType.choices, blank=True)
    payment_method = models.CharField(max_length=20, choices=PaymentMethod.choices, blank=True)
    items_json = models.JSONField()
    total = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    source = models.CharField(max_length=10, default='web')  # 'web' or 'android'
    table_number = models.CharField(max_length=20, blank=True, default='')
    customer_name = models.CharField(max_length=100, blank=True, default='')
    is_unpaid = models.BooleanField(default=False)
    order_mode = models.CharField(max_length=20, choices=OrderMode.choices, default=OrderMode.REGULAR)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'Order #{self.pk} [{self.status}]'


class Table(models.Model):
    name = models.CharField(max_length=50)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class RawMaterial(models.Model):
    name = models.CharField(max_length=100)
    purchase_unit = models.CharField(max_length=50)
    batch_qty = models.DecimalField(max_digits=10, decimal_places=3)
    batch_price = models.DecimalField(max_digits=10, decimal_places=2)
    serving_unit = models.CharField(max_length=50)
    yield_min = models.DecimalField(max_digits=10, decimal_places=3)
    yield_max = models.DecimalField(max_digits=10, decimal_places=3)
    category = models.CharField(max_length=100, blank=True, default='')
    stock_qty = models.DecimalField(max_digits=10, decimal_places=3, default=0)
    notes = models.TextField(blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class ProductIngredient(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='recipe_ingredients')
    raw_material = models.ForeignKey(RawMaterial, on_delete=models.CASCADE, related_name='used_in')
    qty_per_serving = models.DecimalField(max_digits=10, decimal_places=3)
    variation_name = models.CharField(max_length=100, blank=True, default='')

    class Meta:
        ordering = ['raw_material__name']
        unique_together = [('product', 'raw_material', 'variation_name')]

    def __str__(self):
        label = f'{self.product.name} - {self.variation_name}' if self.variation_name else self.product.name
        return f'{self.raw_material.name} in {label}'


class RawMaterialSnapshot(models.Model):
    saved_at = models.DateTimeField(auto_now_add=True)
    data = models.JSONField()  # [{id, name, stock_qty, purchase_unit}]

    class Meta:
        ordering = ['-saved_at']

    def __str__(self):
        return f'Snapshot {self.pk} @ {self.saved_at}'


class CashAccount(models.Model):
    name = models.CharField(max_length=100)
    balance = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f'{self.name} ₱{self.balance}'


class Expense(models.Model):
    date = models.DateField()
    category = models.CharField(max_length=100, blank=True, default='')
    notes = models.TextField(blank=True, default='')
    items = models.JSONField(default=list)  # [{description, amount}]
    account = models.ForeignKey(CashAccount, null=True, blank=True, on_delete=models.SET_NULL, related_name='expenses')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-id']

    def __str__(self):
        total = sum(float(i.get('amount', 0)) for i in self.items)
        return f'Expense {self.date} ₱{total:.2f}'


class Transaction(models.Model):
    order = models.OneToOneField(Order, on_delete=models.CASCADE, related_name='transaction')
    android_id = models.IntegerField(unique=True, null=True, blank=True)
    total = models.DecimalField(max_digits=10, decimal_places=2)
    # Snapshot of how the sale was paid, captured at completion time. Kept on the
    # Transaction (not read live from Order) so later edits to Order.payment_method
    # cannot silently move a closed day's cash reconciliation.
    payment_method = models.CharField(max_length=20, choices=Order.PaymentMethod.choices, blank=True)
    completed_at = models.DateTimeField()

    class Meta:
        ordering = ['-completed_at']

    def __str__(self):
        return f'Transaction #{self.pk} for Order #{self.order_id}'
