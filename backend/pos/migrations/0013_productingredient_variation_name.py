from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pos', '0012_stock_qty_product_ingredient'),
    ]

    operations = [
        migrations.AddField(
            model_name='productingredient',
            name='variation_name',
            field=models.CharField(blank=True, default='', max_length=100),
        ),
        migrations.AlterUniqueTogether(
            name='productingredient',
            unique_together={('product', 'raw_material', 'variation_name')},
        ),
    ]
