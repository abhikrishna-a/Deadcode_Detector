import logging
import os
import subprocess
import tempfile
import uuid

from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .git_views import ALLOWED_EXTENSIONS, SKIP_DIRS
from .tasks import batch_analyze_folder

logger = logging.getLogger(__name__)


class WebhookAnalyzeView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        repo_url = request.data.get("repo_url", "").strip().rstrip("/")
        if not repo_url:
            return Response({"error": "repo_url is required."}, status=status.HTTP_400_BAD_REQUEST)

        repo_url = repo_url.lower()
        if "github.com" not in repo_url and "gitlab.com" not in repo_url:
            return Response(
                {"error": "Only GitHub and GitLab repositories are supported."}, status=status.HTTP_400_BAD_REQUEST
            )

        if repo_url.startswith("git@"):
            repo_url = repo_url.replace(":", "/").replace("git@", "https://").removesuffix(".git")
        else:
            if not repo_url.startswith("https://"):
                repo_url = "https://" + repo_url.removeprefix("http://").removeprefix("https://")
            repo_url = repo_url.replace("://www.", "://")

        repo_url = repo_url.removesuffix(".git")

        repo_name = repo_url.rstrip("/").split("/")[-1]
        branch = request.data.get("branch", "main").strip()

        temp_dir = tempfile.mkdtemp(prefix="gc_wh_")
        try:
            clone_cmd = ["git", "clone", "--depth", "1", "--branch", branch, "--single-branch", repo_url, temp_dir]
            result = subprocess.run(clone_cmd, capture_output=True, text=True, timeout=120)
            if result.returncode != 0:
                logger.error("Webhook clone failed: %s", result.stderr[-500:])
                return Response({"error": result.stderr.strip() or "Clone failed"}, status=status.HTTP_400_BAD_REQUEST)

            files_data = []
            for root, dirs, files in os.walk(temp_dir):
                dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
                for fn in files:
                    ext = os.path.splitext(fn)[1].lower()
                    if ext not in ALLOWED_EXTENSIONS:
                        continue
                    full_path = os.path.join(root, fn)
                    rel_path = os.path.relpath(full_path, temp_dir).replace("\\", "/")
                    try:
                        with open(full_path, encoding="utf-8", errors="replace") as fh:
                            content = fh.read()
                        files_data.append((rel_path, content))
                    except OSError, UnicodeDecodeError:
                        continue

            if not files_data:
                return Response({"error": "No analyzable files found."}, status=status.HTTP_400_BAD_REQUEST)

            batch_id = str(uuid.uuid4())
            batch_analyze_folder.delay(files_data, batch_id, scan_folder=repo_name, token="", scan_type="full")

            return Response({"batch_id": batch_id, "total_files": len(files_data)}, status=status.HTTP_201_CREATED)

        except subprocess.TimeoutExpired:
            return Response({"error": "Clone timed out after 120 seconds."}, status=status.HTTP_504_GATEWAY_TIMEOUT)
        except Exception as e:
            logger.exception("Webhook analyze error")
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        finally:
            try:
                import shutil

                shutil.rmtree(temp_dir, ignore_errors=True)
            except Exception:
                pass
