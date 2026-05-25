# DeadCode Detector - Backend API Summary

## Overview
This document summarizes the API endpoints discovered in the backend directory for the DeadCode Detector application.

## Authentication Endpoints

### User Registration
- **Endpoint**: `POST /api/auth/register/`
- **Description**: Register a new user account
- **Request Body**: 
  ```json
  {
    "email": "string",
    "password": "string",
    "full_name": "string"
  }
  ```
- **Response**: 
  ```json
  {
    "id": "integer",
    "email": "string",
    "full_name": "string",
    "is_active": "boolean",
    "date_joined": "datetime"
  }
  ```
- **Status Codes**: 201 Created, 400 Bad Request

### Login (JWT Token Obtain)
- **Endpoint**: `POST /api/auth/token/`
- **Description**: Obtain JWT access and refresh tokens
- **Request Body**:
  ```json
  {
    "email": "string",
    "password": "string"
  }
  ```
- **Response**:
  ```json
  {
    "refresh": "string",
    "access": "string",
    "user": {
      "id": "integer",
      "email": "string",
      "full_name": "string"
    }
  }
  ```
- **Status Codes**: 200 OK, 401 Unauthorized

### Token Refresh
- **Endpoint**: `POST /api/auth/token/refresh/`
- **Description**: Refresh expired access token using refresh token
- **Request Body**:
  ```json
  {
    "refresh": "string"
  }
  ```
- **Response**:
  ```json
  {
    "access": "string"
  }
  ```
- **Status Codes**: 200 OK, 401 Unauthorized

### Multi-Factor Authentication (MFA) Endpoints

#### MFA Login Completion
- **Endpoint**: `POST /api/auth/mfa/verify-login/`
- **Description**: Complete MFA verification during login
- **Headers**: `Authorization: Bearer <pre-auth-token>`
- **Request Body**:
  ```json
  {
    "token": "string"  // 6-digit MFA code
  }
  ```
- **Response**:
  ```json
  {
    "refresh": "string",
    "access": "string",
    "user": {
      "id": "integer",
      "email": "string",
      "full_name": "string"
    }
  }
  ```
- **Status Codes**: 200 OK, 400 Bad Request, 403 Forbidden

#### MFA Setup
- **Endpoint**: `POST /api/auth/mfa/setup/`
- **Description**: Initialize or rotate MFA secret
- **Headers**: `Authorization: Bearer <access-token>`
- **Response**:
  ```json
  {
    "qr_code_uri": "string",  // provisioning URI for authenticator app
    "qr_code_image": "string" // base64 encoded QR code image
  }
  ```
- **Status Codes**: 200 OK, 403 Forbidden

#### MFA Activation
- **Endpoint**: `POST /api/auth/mfa/activate/`
- **Description**: Activate MFA after initial setup verification
- **Headers**: `Authorization: Bearer <access-token>`
- **Request Body**:
  ```json
  {
    "token": "string"  // 6-digit MFA code from authenticator app
  }
  ```
- **Response**:
  ```json
  {
    "message": "string"
  }
  ```
- **Status Codes**: 200 OK, 400 Bad Request, 403 Forbidden

## Scanner/Analysis Endpoints (NOT IMPLEMENTED IN CURRENT BACKEND)

Based on the frontend specifications, the following endpoints would need to be implemented for full functionality:

### Analysis Management
- **POST** `/api/analysis/` - Start a new code analysis
- **GET** `/api/analysis/{id}/` - Get analysis details
- **GET** `/api/analysis/{id}/status/` - Get analysis progress/status
- **GET** `/api/analysis/{id}/results/` - Get analysis results
- **DELETE** `/api/analysis/{id}/` - Delete an analysis

### File Operations
- **GET** `/api/analysis/{id}/files/` - List files in analysis
- **GET** `/api/analysis/{id}/files/{filename}/content/` - Get file content
- **GET** `/api/analysis/{id}/files/{filename}/issues/` - Get issues in specific file

### Dashboard & Statistics
- **GET** `/api/dashboard/stats/` - Get overall statistics
- **GET** `/api/dashboard/breakdown/` - Get dead code breakdown by type
- **GET** `/api/analyses/` - List user's analyses (with pagination)

## Authentication Flow
1. User registers via `/api/auth/register/`
2. User logs in via `/api/auth/token/` to get access/refresh tokens
3. For MFA-enabled accounts:
   - Initial login returns a low-privilege token requiring MFA verification
   - User submits MFA code to `/api/auth/mfa/verify-login/` to get full-privilege tokens
4. Access token is used in Authorization header: `Authorization: Bearer <access-token>`
5. Refresh token is used to obtain new access tokens when expired

## Security Notes
- All endpoints except registration require authentication
- JWT tokens are used for stateless authentication
- Access tokens are short-lived (configurable, default 60 minutes)
- Refresh tokens are longer-lived (configurable, default 7 days)
- MFA adds an additional verification step for sensitive operations