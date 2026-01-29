# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it by emailing security@npc.gov.in.

**Please do not report security vulnerabilities through public GitHub issues.**

Include the following information in your report:
- Type of vulnerability
- Full path to the affected source code
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

## Security Measures

### Authentication & Authorization
- JWT-based authentication with refresh tokens
- Role-based access control (RBAC)
- Password hashing using bcrypt (cost factor 12)
- Session management with token rotation

### Data Protection
- All sensitive data encrypted at rest
- HTTPS enforced in production
- SQL injection prevention via Prisma ORM
- XSS protection via input sanitization
- CSRF protection enabled

### API Security
- Rate limiting (100 requests/minute)
- Request size limits
- Helmet.js security headers
- CORS configured for specific origins

### File Upload Security
- File type validation
- File size limits (10MB per file, 100MB total)
- Malware scanning (to be implemented)
- Secure storage with MinIO

### Infrastructure
- Non-root container execution
- Secret management via environment variables
- Network isolation via Docker networks
- Regular security updates

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |

## Security Checklist for Deployment

- [ ] Change all default passwords
- [ ] Set strong JWT secrets
- [ ] Enable HTTPS
- [ ] Configure firewall rules
- [ ] Set up log monitoring
- [ ] Enable database encryption
- [ ] Configure backup encryption
- [ ] Review CORS settings
- [ ] Enable audit logging
- [ ] Set up intrusion detection
