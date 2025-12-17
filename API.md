# AkaMoney API Documentation

English | [繁體中文](API.zh-TW.md)

Base URL: `https://your-worker.workers.dev` or `https://api.aka.money`

## Authentication

Most endpoints require JWT authentication. Include the JWT token in the Authorization header:

```
Authorization: Bearer <your_jwt_token>
```

## Endpoints

### Public Endpoints

#### Health Check
```http
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": 1702834567890
}
```

#### Redirect to Original URL
```http
GET /:shortCode
```

**Response:** 302 redirect to the original URL

**Error Responses:**
- 404: Short URL not found
- 410: Short URL has expired

#### Create Short URL (Public)
```http
POST /api/shorten
Content-Type: application/json
```

**Request Body:**
```json
{
  "original_url": "https://example.com/very-long-url",
  "short_code": "my-link",  // Optional: custom short code
  "title": "My Link",        // Optional: title
  "description": "Description"  // Optional: description
}
```

**Response:** 201 Created
```json
{
  "id": "abc123",
  "short_code": "my-link",
  "original_url": "https://example.com/very-long-url",
  "short_url": "my-link",
  "title": "My Link",
  "created_at": 1702834567890,
  "updated_at": 1702834567890,
  "is_active": true,
  "click_count": 0
}
```

**Error Responses:**
- 400: Invalid URL or short code format
- 409: Short code already exists

#### Get Public Analytics
```http
GET /api/public/analytics/:shortCode
```

**Response:** 200 OK
```json
{
  "short_code": "my-link",
  "total_clicks": 42,
  "created_at": 1702834567890
}
```

### Protected Endpoints (JWT Required)

#### List User URLs
```http
GET /api/urls?page=1&limit=20
Authorization: Bearer <token>
```

**Query Parameters:**
- `page` (optional): Page number, default 1
- `limit` (optional): Items per page, default 20, max 100

**Response:** 200 OK
```json
{
  "data": [
    {
      "id": "abc123",
      "short_code": "my-link",
      "original_url": "https://example.com",
      "short_url": "my-link",
      "title": "My Link",
      "created_at": 1702834567890,
      "updated_at": 1702834567890,
      "is_active": true,
      "click_count": 42
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "total_pages": 5
  }
}
```

#### Get Specific URL
```http
GET /api/urls/:id
Authorization: Bearer <token>
```

**Response:** 200 OK
```json
{
  "id": "abc123",
  "short_code": "my-link",
  "original_url": "https://example.com",
  "short_url": "my-link",
  "title": "My Link",
  "description": "My description",
  "created_at": 1702834567890,
  "updated_at": 1702834567890,
  "expires_at": 1735834567890,
  "is_active": true,
  "click_count": 42
}
```

#### Update URL
```http
PUT /api/urls/:id
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "original_url": "https://example.com/updated",  // Optional
  "title": "Updated Title",                        // Optional
  "description": "Updated description",            // Optional
  "is_active": false,                              // Optional
  "expires_at": 1735834567890                      // Optional
}
```

**Response:** 200 OK
```json
{
  "id": "abc123",
  "short_code": "my-link",
  "original_url": "https://example.com/updated",
  "short_url": "my-link",
  "title": "Updated Title",
  "updated_at": 1702834600000,
  "is_active": false,
  "click_count": 42
}
```

#### Delete URL
```http
DELETE /api/urls/:id
Authorization: Bearer <token>
```

**Response:** 200 OK
```json
{
  "message": "URL deleted successfully"
}
```

#### Get Analytics
```http
GET /api/analytics/:shortCode
Authorization: Bearer <token>
```

**Response:** 200 OK
```json
{
  "url": {
    "id": "abc123",
    "short_code": "my-link",
    "original_url": "https://example.com",
    "short_url": "my-link",
    "created_at": 1702834567890,
    "click_count": 42
  },
  "total_clicks": 42,
  "clicks_by_date": {
    "2024-12-17": 10,
    "2024-12-18": 15,
    "2024-12-19": 17
  },
  "clicks_by_country": {
    "US": 20,
    "GB": 10,
    "CA": 12
  },
  "clicks_by_device": {
    "mobile": 25,
    "desktop": 15,
    "tablet": 2
  },
  "clicks_by_browser": {
    "chrome": 30,
    "safari": 8,
    "firefox": 4
  },
  "recent_clicks": [
    {
      "id": "click123",
      "clicked_at": 1702834567890,
      "country": "US",
      "city": "New York",
      "device_type": "mobile",
      "browser": "chrome",
      "os": "ios"
    }
  ]
}
```

## Error Responses

All error responses follow this format:

```json
{
  "error": "Error Type",
  "message": "Detailed error message"
}
```

### Common HTTP Status Codes

- `200 OK`: Request succeeded
- `201 Created`: Resource created successfully
- `400 Bad Request`: Invalid request parameters
- `401 Unauthorized`: Missing or invalid authentication
- `404 Not Found`: Resource not found
- `409 Conflict`: Resource already exists
- `410 Gone`: Resource has expired
- `500 Internal Server Error`: Server error

## Rate Limiting

Currently, there is no rate limiting implemented. It's recommended to implement rate limiting in production:

- Public endpoints: 100 requests per minute per IP
- Authenticated endpoints: 1000 requests per minute per user

## CORS

The API supports CORS with the following configuration:

- Allowed origins: Configurable in `backend/src/middleware/cors.ts`
- Allowed methods: GET, POST, PUT, DELETE, OPTIONS
- Allowed headers: Content-Type, Authorization
- Credentials: Supported

## Short Code Format

Short codes must follow these rules:
- Length: 3-20 characters
- Allowed characters: a-z, A-Z, 0-9, hyphen (-), underscore (_)
- Pattern: `^[a-zA-Z0-9-_]{3,20}$`

## URL Validation

Original URLs must:
- Be valid URLs
- Use HTTP or HTTPS protocol
- Be properly formatted

## Click Tracking

When a short URL is accessed:
1. The system records click metadata (IP, user agent, referrer, country, device, browser, OS)
2. The click count is incremented
3. The user is redirected to the original URL
4. All data is stored asynchronously for analytics

## Data Retention

- URLs: Stored indefinitely unless deleted or expired
- Click records: Stored indefinitely
- User data: Stored while account is active

## Best Practices

1. **Use HTTPS**: Always use HTTPS in production
2. **Validate input**: Always validate URLs before shortening
3. **Handle errors**: Implement proper error handling
4. **Cache responses**: Cache static data when possible
5. **Monitor usage**: Track API usage and set up alerts
6. **Secure tokens**: Store JWT tokens securely
7. **Rate limiting**: Implement rate limiting for production
8. **Logging**: Log important events for debugging

## Example Usage

### JavaScript/TypeScript
```typescript
const response = await fetch('https://api.aka.money/api/shorten', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_TOKEN'
  },
  body: JSON.stringify({
    original_url: 'https://example.com/very-long-url',
    short_code: 'my-link'
  })
});

const data = await response.json();
console.log(data.short_url);
```

### cURL
```bash
curl -X POST https://api.aka.money/api/shorten \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"original_url": "https://example.com"}'
```

### Python
```python
import requests

response = requests.post(
    'https://api.aka.money/api/shorten',
    headers={
        'Content-Type': 'application/json',
        'Authorization': 'Bearer YOUR_TOKEN'
    },
    json={
        'original_url': 'https://example.com',
        'short_code': 'my-link'
    }
)

data = response.json()
print(data['short_url'])
```
