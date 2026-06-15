import json
import logging
import os
import subprocess
import tempfile
import uuid

from asgiref.sync import async_to_sync
from celery import group as celery_group
from channels.layers import get_channel_layer
from django.core.cache import cache
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.authentication import JWTAuthentication

from .permissions import IsMFAVerified
from .tasks import analyze_single_file, notify_batch_complete

logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {'.py', '.js', '.jsx', '.ts', '.tsx', '.txt', '.md'}
SKIP_DIRS = {'node_modules', '.git', '__pycache__', 'dist', 'build', '.venv', 'venv'}
CACHE_TTL = 15 * 60  # 15 minutes


def _map_language(ext: str) -> str:
    lang_map = {
        '.py': 'python', '.js': 'javascript', '.jsx': 'javascript',
        '.ts': 'typescript', '.tsx': 'typescript',
        '.txt': 'text', '.md': 'markdown',
    }
    return lang_map.get(ext, 'unknown')


class GitCloneView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsMFAVerified]

    def post(self, request):
        repo_url = request.data.get('repo_url', '').strip().rstrip('/')
        branch = (request.data.get('branch') or 'main').strip()
        token = request.data.get('token', '').strip()

        if not repo_url:
            return Response(
                {'error': 'repo_url is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Normalize: strip www, upgrade http→https, handle SSH-style git@ URLs
        repo_url_lower = repo_url.lower()
        if 'github.com' not in repo_url_lower and 'gitlab.com' not in repo_url_lower:
            return Response(
                {'error': 'Only GitHub and GitLab repositories are supported.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Convert to lowercase for consistency
        repo_url = repo_url.lower()

        if repo_url.startswith('git@'):
            # SSH: git@github.com:user/repo → https://github.com/user/repo
            repo_url = repo_url.replace(':', '/').replace('git@', 'https://').removesuffix('.git')
        else:
            if not repo_url.startswith('https://'):
                repo_url = 'https://' + repo_url.removeprefix('http://').removeprefix('https://')
            repo_url = repo_url.replace('://www.', '://')

        # Strip GitHub web path: /tree/branch/... or /blob/branch/...
        # Git clone only needs the repo root: https://github.com/owner/repo
        for prefix in ('/tree/', '/blob/'):
            idx = repo_url.find(prefix)
            if idx != -1:
                repo_url = repo_url[:idx]
                break

        # Remove .git suffix if present (after web-path stripping)
        repo_url = repo_url.removesuffix('.git')
        repo_url_clean = repo_url  # preserve without token for response

        if token:
            # Insert token into URL as credential: https://token@github.com/user/repo
            parts = repo_url.split('://', 1)
            if len(parts) == 2:
                repo_url = f'{parts[0]}://{token}@{parts[1]}'

        temp_dir = tempfile.mkdtemp(prefix='gc_')

        try:
            clone_cmd = [
                'git', 'clone', '--depth', '1',
                '--branch', branch,
                '--single-branch',
                repo_url,
                temp_dir,
            ]
            result = subprocess.run(
                clone_cmd,
                capture_output=True,
                text=True,
                timeout=120,
            )

            if result.returncode != 0:
                logger.error('Git clone failed (stderr): %s', result.stderr[-500:])
                error_msg = result.stderr.strip() or 'Git clone failed with unknown error.'
                # Sanitize any token from error message
                if token:
                    error_msg = error_msg.replace(token, '***')
                return Response(
                    {'error': error_msg},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            repo_name = os.path.basename(repo_url.replace('.git', ''))
            if '@' in repo_name:
                repo_name = repo_name.split('@')[-1]

            file_list = []
            total_bytes = 0

            for root, dirs, files in os.walk(temp_dir):
                dirs[:] = [d for d in dirs if d not in SKIP_DIRS]

                for fn in files:
                    ext = os.path.splitext(fn)[1].lower()
                    if ext not in ALLOWED_EXTENSIONS:
                        continue

                    full_path = os.path.join(root, fn)
                    try:
                        size = os.path.getsize(full_path)
                    except OSError:
                        continue

                    rel_path = os.path.relpath(full_path, temp_dir).replace('\\', '/')
                    file_list.append({
                        'path': rel_path,
                        'size_bytes': size,
                        'language': _map_language(ext),
                    })
                    total_bytes += size

            file_list.sort(key=lambda x: x['path'])

            session_id = str(uuid.uuid4())
            cache.set(
                f'git_session_{session_id}',
                json.dumps({'temp_dir': temp_dir, 'repo_name': repo_name, 'branch': branch}),
                CACHE_TTL,
            )

            return Response({
                'session_id': session_id,
                'repo_name': repo_name,
                'repo_url': repo_url_clean,
                'branch': branch,
                'total_files': len(file_list),
                'total_bytes': total_bytes,
                'files': file_list,
            })

        except subprocess.TimeoutExpired:
            logger.error('Git clone timed out for %s', repo_url)
            return Response(
                {'error': 'Clone operation timed out after 120 seconds.'},
                status=status.HTTP_504_GATEWAY_TIMEOUT,
            )
        except Exception as e:
            logger.exception('Git clone unexpected error')
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class GitFileFetchView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsMFAVerified]

    def post(self, request):
        session_id = request.data.get('session_id', '').strip()
        paths = request.data.get('paths', [])

        if not session_id or not paths:
            return Response(
                {'error': 'session_id and paths are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if len(paths) > 10:
            return Response(
                {'error': 'Maximum 10 paths per request.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Path traversal check
        for p in paths:
            normalized = os.path.normpath(p).replace('\\', '/')
            if normalized.startswith('..') or '/../' in f'/{normalized}' or normalized == '..':
                return Response(
                    {'error': f'Invalid path: {p}'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        cached = cache.get(f'git_session_{session_id}')
        if not cached:
            return Response(
                {'error': 'Git session expired or not found. Please re-import the repository.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            session_data = json.loads(cached)
        except (json.JSONDecodeError, TypeError):
            return Response(
                {'error': 'Invalid session data.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        temp_dir = session_data.get('temp_dir')
        if not temp_dir or not os.path.isdir(temp_dir):
            return Response(
                {'error': 'Session data corrupted. Please re-import the repository.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        files_result = []
        for p in paths:
            full_path = os.path.join(temp_dir, p)
            if not os.path.isfile(full_path):
                continue
            try:
                with open(full_path, 'r', encoding='utf-8', errors='replace') as fh:
                    content = fh.read()
                size = os.path.getsize(full_path)
                files_result.append({
                    'path': p,
                    'content': content,
                    'size_bytes': size,
                })
            except OSError as e:
                logger.warning('Failed to read %s: %s', full_path, e)

        return Response({'files': files_result})


class BatchAnalysisView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsMFAVerified]

    def post(self, request):
        uploaded = request.FILES.getlist('files')
        if not uploaded:
            return Response({'error': 'No files provided.'}, status=status.HTTP_400_BAD_REQUEST)

        scan_folder = request.data.get('scan_folder', '')
        scan_type = request.data.get('scan_type', 'folder')
        batch_id = str(uuid.uuid4())
        total = len(uploaded)
        channel_layer = get_channel_layer()
        group = f'analysis_{batch_id}'

        # Notify progress start
        async_to_sync(channel_layer.group_send)(group, {
            'type': 'analysis_progress',
            'done': 0,
            'total': total,
            'current_file': uploaded[0].name,
        })

        # Pass user's JWT token to Celery tasks for RAG auth
        auth_header = request.headers.get('Authorization', '')
        token = auth_header.replace('Bearer ', '') if auth_header.startswith('Bearer ') else ''

        # Fire Celery tasks for each file
        task_group = celery_group(
            analyze_single_file.s(
                f.name, f.read().decode('utf-8', errors='replace'), batch_id, scan_folder, token, scan_type
            )
            for f in uploaded
        )
        # When all tasks complete, notify batch_complete
        callback = notify_batch_complete.s(batch_id, total)
        (task_group | callback).apply_async()

        return Response({'batch_id': batch_id}, status=status.HTTP_201_CREATED)


class GitCloneStatusView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated, IsMFAVerified]

    def get(self, request, task_id):
        from celery.result import AsyncResult

        result = AsyncResult(task_id)
        payload = {'status': result.status.lower()}

        if result.successful():
            payload['result'] = result.result
        elif result.failed():
            payload['error'] = str(result.result)

        return Response(payload)
