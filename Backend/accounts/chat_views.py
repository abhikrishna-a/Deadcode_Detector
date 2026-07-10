import logging

import requests
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db.models import Count, OuterRef, Subquery
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .authentication import CookieJWTAuthentication
from .chat_models import ChatRoom, IssueThread, RoomMessage, ThreadMessage
from .permissions import IsMFAVerified

logger = logging.getLogger(__name__)
RAG_BASE = settings.RAG_ANALYZE_URL.rsplit("/rag/", 1)[0]


def _notify_admins_new_thread(thread_id, from_username):
    try:
        channel_layer = get_channel_layer()
        user_model = get_user_model()
        admins = user_model.objects.filter(role="senior", is_active=True)
        for admin in admins:
            async_to_sync(channel_layer.group_send)(
                f"notifications_user_{admin.id}",
                {
                    "type": "new_chat_thread",
                    "thread_id": thread_id,
                    "from_username": from_username,
                },
            )
    except Exception as e:
        logger.warning("Failed to notify admins about new thread %s: %s", thread_id, e)


class ChatThreadListCreateView(APIView):
    authentication_classes = [CookieJWTAuthentication]
    permission_classes = [IsAuthenticated, IsMFAVerified]

    def get(self, request):
        try:
            resolved = request.query_params.get("resolved", "false").lower() == "true"
            if request.user.role == "senior":
                qs = IssueThread.objects.filter(resolved=resolved)
            else:
                qs = IssueThread.objects.filter(created_by=request.user, resolved=resolved)
            qs = qs.select_related("created_by").prefetch_related("messages")

            data = []
            for t in qs:
                msgs = []
                for m in t.messages.all():
                    msgs.append(
                        {
                            "id": m.id,
                            "author_id": m.author_id,
                            "content": m.content,
                            "is_ai_hint": m.is_ai_hint,
                            "created_at": m.created_at.isoformat(),
                        }
                    )
                data.append(
                    {
                        "id": t.id,
                        "analysis_id": t.analysis_id,
                        "filename": t.filename,
                        "issue_id": t.issue_id,
                        "created_by": {"id": t.created_by.id, "username": t.created_by.username},
                        "resolved": t.resolved,
                        "created_at": t.created_at.isoformat(),
                        "messages": msgs,
                    }
                )
            return Response({"threads": data, "total": len(data)}, status=status.HTTP_200_OK)
        except Exception:
            logger.exception("Failed to list threads for user %s", request.user)
            return Response({"error": "Failed to list threads."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def post(self, request):
        try:
            analysis_id = request.data.get("analysis_id")
            filename = request.data.get("filename", "")
            issue_id = request.data.get("issue_id", "")

            if not analysis_id or not issue_id:
                return Response({"error": "analysis_id and issue_id required"}, status=status.HTTP_400_BAD_REQUEST)

            thread, created = IssueThread.objects.get_or_create(
                analysis_id=analysis_id,
                issue_id=issue_id,
                defaults={"filename": filename, "created_by": request.user},
            )
            if not created:
                return Response({"thread_id": thread.id, "exists": True}, status=status.HTTP_200_OK)

            token_str = str(request.auth)
            ai_content = "AI suggestion unavailable."
            try:
                chat_resp = requests.post(
                    f"{RAG_BASE}/rag/chat-json",
                    json={
                        "message": (
                            f"Issue {issue_id} in {filename}. "
                            f"Explain what the issue means, why it matters, "
                            f"and how to fix it in simple terms for a junior developer."
                        ),
                        "analysis_id": analysis_id,
                    },
                    headers={"Authorization": f"Bearer {token_str}"},
                    timeout=15,
                )
                if chat_resp.ok:
                    ai_content = chat_resp.json().get("answer", ai_content)
            except requests.RequestException as e:
                logger.warning("AI pre-fill failed for thread %d: %s", thread.id, e)

            ThreadMessage.objects.create(
                thread=thread,
                author=request.user,
                content=ai_content,
                is_ai_hint=True,
            )

            _notify_admins_new_thread(thread.id, request.user.username)

            return Response({"thread_id": thread.id, "created": True}, status=status.HTTP_201_CREATED)
        except Exception:
            logger.exception("Failed to create thread")
            return Response({"error": "Failed to create thread."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class ThreadMessageCreateView(APIView):
    authentication_classes = [CookieJWTAuthentication]
    permission_classes = [IsAuthenticated, IsMFAVerified]

    def post(self, request, pk):
        try:
            try:
                thread = IssueThread.objects.get(id=pk)
            except IssueThread.DoesNotExist:
                return Response({"error": "Thread not found"}, status=status.HTTP_404_NOT_FOUND)

            if request.user.role != "senior" and thread.created_by != request.user:
                return Response({"error": "You cannot post to this thread."}, status=status.HTTP_403_FORBIDDEN)

            content = request.data.get("content", "").strip()
            if not content:
                return Response({"error": "Content required"}, status=status.HTTP_400_BAD_REQUEST)

            msg = ThreadMessage.objects.create(thread=thread, author=request.user, content=content)
            return Response(
                {
                    "id": msg.id,
                    "content": msg.content,
                    "author_id": msg.author_id,
                    "is_ai_hint": msg.is_ai_hint,
                    "created_at": msg.created_at.isoformat(),
                },
                status=status.HTTP_201_CREATED,
            )
        except Exception:
            logger.exception("Failed to post message to thread %s", pk)
            return Response({"error": "Failed to post message."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class ThreadResolveView(APIView):
    authentication_classes = [CookieJWTAuthentication]
    permission_classes = [IsAuthenticated, IsMFAVerified]

    def patch(self, request, pk):
        try:
            if request.user.role != "senior":
                return Response({"error": "Only seniors can resolve threads"}, status=status.HTTP_403_FORBIDDEN)
            try:
                thread = IssueThread.objects.get(id=pk)
            except IssueThread.DoesNotExist:
                return Response({"error": "Thread not found"}, status=status.HTTP_404_NOT_FOUND)
            thread.resolved = True
            thread.save(update_fields=["resolved"])
            return Response({"resolved": True}, status=status.HTTP_200_OK)
        except Exception:
            logger.exception("Failed to resolve thread %s", pk)
            return Response({"error": "Failed to resolve thread."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class ChatRoomListCreateView(APIView):
    authentication_classes = [CookieJWTAuthentication]
    permission_classes = [IsAuthenticated, IsMFAVerified]

    def get(self, request):
        try:
            last_msg_qs = RoomMessage.objects.filter(room=OuterRef("pk")).order_by("-created_at")
            rooms = (
                ChatRoom.objects.annotate(
                    message_count=Count("messages"),
                    last_message_content=Subquery(last_msg_qs.values("content")[:1]),
                    last_message_author=Subquery(last_msg_qs.values("author__username")[:1]),
                    last_message_created_at=Subquery(last_msg_qs.values("created_at")[:1]),
                )
                .select_related("created_by")
                .order_by("-created_at")
            )

            data = [
                {
                    "id": r.id,
                    "name": r.name,
                    "scan_folder": r.scan_folder,
                    "created_by": r.created_by.username,
                    "created_at": r.created_at.isoformat(),
                    "message_count": r.message_count,
                    "last_message": {
                        "content": (r.last_message_content or "")[:200],
                        "author_username": r.last_message_author or "",
                        "created_at": r.last_message_created_at.isoformat() if r.last_message_created_at else "",
                    }
                    if r.last_message_content
                    else None,
                }
                for r in rooms
            ]
            return Response({"rooms": data}, status=status.HTTP_200_OK)
        except Exception:
            logger.exception("Failed to list rooms")
            return Response({"error": "Failed to list rooms."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def post(self, request):
        try:
            name = request.data.get("name", "").strip()
            scan_folder = request.data.get("scan_folder", "")
            if not name:
                return Response({"error": "Room name required"}, status=status.HTTP_400_BAD_REQUEST)
            room, created = ChatRoom.objects.get_or_create(
                name=name,
                defaults={"scan_folder": scan_folder or None, "created_by": request.user},
            )
            return Response(
                {
                    "id": room.id,
                    "name": room.name,
                    "scan_folder": room.scan_folder,
                    "created": created,
                },
                status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
            )
        except Exception:
            logger.exception("Failed to create room")
            return Response({"error": "Failed to create room."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class ChatRoomMessagesView(APIView):
    authentication_classes = [CookieJWTAuthentication]
    permission_classes = [IsAuthenticated, IsMFAVerified]

    def get(self, request, room_name):
        try:
            try:
                room = ChatRoom.objects.get(name=room_name)
            except ChatRoom.DoesNotExist:
                return Response({"error": "Room not found"}, status=status.HTTP_404_NOT_FOUND)

            before = request.query_params.get("before")
            limit = min(int(request.query_params.get("limit", 50)), 200)

            qs = room.messages.select_related("author").all()
            if before:
                qs = qs.filter(created_at__lt=before)
            qs = qs.order_by("-created_at")[:limit]

            data = []
            for m in reversed(list(qs)):
                data.append(
                    {
                        "id": m.id,
                        "author_id": m.author_id,
                        "author_username": m.author.username,
                        "content": m.content,
                        "created_at": m.created_at.isoformat(),
                    }
                )
            return Response({"messages": data}, status=status.HTTP_200_OK)
        except Exception:
            logger.exception("Failed to fetch messages for room %s", room_name)
            return Response({"error": "Failed to fetch messages."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def post(self, request, room_name):
        try:
            room, _ = ChatRoom.objects.get_or_create(
                name=room_name,
                defaults={"created_by": request.user, "scan_folder": room_name},
            )
            content = request.data.get("content", "").strip()
            if not content:
                return Response({"error": "Content is required."}, status=status.HTTP_400_BAD_REQUEST)
            msg = RoomMessage.objects.create(room=room, author=request.user, content=content)
            return Response(
                {
                    "id": msg.id,
                    "author_id": msg.author_id,
                    "author_username": msg.author.username,
                    "content": msg.content,
                    "created_at": msg.created_at.isoformat(),
                },
                status=status.HTTP_201_CREATED,
            )
        except Exception:
            logger.exception("Failed to send message to room %s", room_name)
            return Response({"error": "Failed to send message."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
