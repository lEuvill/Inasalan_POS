from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pos', '0014_order_is_unpaid'),
    ]

    operations = [
        migrations.CreateModel(
            name='RawMaterialSnapshot',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('saved_at', models.DateTimeField(auto_now_add=True)),
                ('data', models.JSONField()),
            ],
            options={
                'ordering': ['-saved_at'],
            },
        ),
    ]
