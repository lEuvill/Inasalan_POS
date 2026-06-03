from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pos', '0020_expense_model'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='customer_name',
            field=models.CharField(blank=True, default='', max_length=100),
        ),
    ]
