from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pos', '0018_order_mode_bulk'),
    ]

    operations = [
        migrations.AddField(
            model_name='product',
            name='pieces_per_serving',
            field=models.IntegerField(default=1),
        ),
    ]
