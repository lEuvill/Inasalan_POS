from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pos', '0013_productingredient_variation_name'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='is_unpaid',
            field=models.BooleanField(default=False),
        ),
    ]
