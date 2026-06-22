# Generated manually — changes timeout_seconds default from 300 to 60

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0011_add_scheduled_at_timeout'),
    ]

    operations = [
        migrations.AlterField(
            model_name='juniorsubmission',
            name='timeout_seconds',
            field=models.IntegerField(default=60),
        ),
    ]
