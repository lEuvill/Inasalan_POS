from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pos', '0016_order_order_mode'),
    ]

    operations = [
        migrations.AddField(
            model_name='rawmaterial',
            name='category',
            field=models.CharField(blank=True, default='', max_length=100),
        ),
    ]
