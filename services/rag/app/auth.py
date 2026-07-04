import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from jose.exceptions import JWKError

_JWT_EXCEPTIONS = (JWTError, JWKError)
_TYPE_EXCEPTIONS = (ValueError, TypeError)

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

ALGORITHM = "HS256"

oauth2_scheme = HTTPBearer()


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(oauth2_scheme)):
    secret_key = os.getenv("DJANGO_SECRET_KEY")
    if not secret_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="RAG auth is not configured. Set DJANGO_SECRET_KEY for the RAG service.",
        )

    token = credentials.credentials
    try:
        payload = jwt.decode(token, secret_key, algorithms=[ALGORITHM])
    except _JWT_EXCEPTIONS:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    if payload.get("mfa_verified_for_session") is not True:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="MFA verification required. Complete MFA login before accessing this resource.",
        )

    raw_user_id = payload.get("user_id")
    role = payload.get("role", "viewer")

    if raw_user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    try:
        user_id = int(raw_user_id)
    except _TYPE_EXCEPTIONS:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid user_id in token")

    return {"user_id": user_id, "role": role}
