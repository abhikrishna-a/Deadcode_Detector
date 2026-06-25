from django.core.management.base import BaseCommand
from accounts.models import JuniorSubmission
from accounts.chat_models import IssueThread, ChatRoom


class Command(BaseCommand):
    help = 'Clears all analysis and chat data, keeps user accounts'

    def handle(self, *args, **options):
        t_count = IssueThread.objects.count()
        IssueThread.objects.all().delete()
        self.stdout.write(f'Deleted {t_count} issue threads (incl. messages)')

        c_count = ChatRoom.objects.count()
        ChatRoom.objects.all().delete()
        self.stdout.write(f'Deleted {c_count} chat rooms (incl. messages)')

        s_count = JuniorSubmission.objects.count()
        JuniorSubmission.objects.all().delete()
        self.stdout.write(f'Deleted {s_count} submissions (incl. feedback)')

        self.stdout.write(self.style.SUCCESS('All analysis & chat data cleared'))
