import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

/**
 * Middleware que inyecta cabeceras de seguridad HTTP recomendadas por OWASP
 * para mitigar ataques como Cross-Site Scripting (XSS), Clickjacking, MIME-sniffing
 * y fuga de información del servidor.
 */
@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
  public use(req: Request, res: Response, next: NextFunction): void {
    // 1. Content Security Policy (CSP) estricta
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; base-uri 'self'; font-src 'self' https: data:; form-action 'self'; frame-ancestors 'none'; img-src 'self' data: https:; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline';"
    );

    // 2. Prevenir detección incorrecta de tipos MIME (MIME-Sniffing)
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // 3. Prevenir Clickjacking / embedding no autorizado en iframes
    res.setHeader('X-Frame-Options', 'DENY');

    // 4. Deshabilitar el filtro XSS legado de navegadores para evitar vulnerabilidades de evasión
    res.setHeader('X-XSS-Protection', '0');

    // 5. HTTP Strict Transport Security (HSTS) - Forzar HTTPS durante 1 año
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );

    // 6. Política de Referrer para no filtrar datos sensibles en URLs externas
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // 7. Aislamiento de origen cruzado
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

    // 8. Permissions-Policy: Restringir APIs de hardware y navegador no necesarias en la API
    res.setHeader(
      'Permissions-Policy',
      'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()'
    );

    // 9. Ocultar información del framework (remover X-Powered-By)
    res.removeHeader('X-Powered-By');
    res.removeHeader('x-powered-by');

    next();
  }
}
