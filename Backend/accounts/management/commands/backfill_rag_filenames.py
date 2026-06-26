import hashlib
from django.db import connection
from django.core.management.base import BaseCommand
from accounts.models import JuniorSubmission


class Command(BaseCommand):
    help = 'Backfill rag_documents.filename from JuniorSubmission.relative_path'

    def handle(self, *args, **options):
        submissions = JuniorSubmission.objects.filter(
            status='done',
            rag_document_id__isnull=True,
        ).exclude(relative_path='').exclude(scan_folder='').order_by('id')

        self.stdout.write(f'Found {submissions.count()} submissions to backfill')

        done = 0
        errors = 0
        with connection.cursor() as cursor:
            for sub in submissions:
                if '/' not in sub.relative_path:
                    self.stdout.write(f'  SKIP submission {sub.id}: {sub.filename} -> flat ({sub.relative_path})')
                    sub.rag_document_id = '00000000-0000-0000-0000-000000000000'
                    sub.save(update_fields=['rag_document_id'])
                    errors += 1
                    continue
                file_hash = hashlib.sha256(sub.file_content.encode()).hexdigest()
                need_created_at = sub.file_content.strip() == ''
                if need_created_at:
                    cursor.execute(
                        """UPDATE rag_documents
                           SET filename = %s
                           WHERE file_hash = %s AND user_id = %s AND scan_folder = %s
                               AND filename NOT LIKE %s
                               AND created_at BETWEEN %s AND %s""",
                        [
                            sub.relative_path, file_hash, sub.user_id, sub.scan_folder,
                            '%/%',
                            sub.created_at.isoformat(),
                            (sub.created_at + __import__('datetime').timedelta(seconds=5)).isoformat(),
                        ],
                    )
                else:
                    cursor.execute(
                        """UPDATE rag_documents
                           SET filename = %s
                           WHERE file_hash = %s AND user_id = %s AND scan_folder = %s
                               AND filename NOT LIKE %s""",
                        [sub.relative_path, file_hash, sub.user_id, sub.scan_folder, '%/%'],
                    )
                updated = cursor.rowcount
                self.stdout.write(f'  OK submission {sub.id}: {sub.filename} -> {sub.relative_path} ({updated} doc(s))')
                sub.rag_document_id = '00000000-0000-0000-0000-000000000000'
                sub.save(update_fields=['rag_document_id'])
                done += 1

        self.stdout.write(self.style.SUCCESS(f'Done. {done} updated, {errors} errors/skipped'))
