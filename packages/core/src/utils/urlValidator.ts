/**
 * URL validation utilities to prevent SSRF (Server-Side Request Forgery) attacks
 */

export interface UrlValidationOptions {
  /**
   * Allow private/internal IP addresses (default: false)
   * WARNING: Enabling this can expose your application to SSRF attacks
   */
  allowPrivateIPs?: boolean;
  
  /**
   * Allow localhost addresses (default: false)
   * WARNING: Enabling this can expose your application to SSRF attacks
   */
  allowLocalhost?: boolean;
  
  /**
   * Custom list of allowed protocols (default: ['http:', 'https:'])
   */
  allowedProtocols?: string[];
  
  /**
   * Disable URL validation entirely (default: false)
   * WARNING: This completely disables SSRF protection
   */
  disableValidation?: boolean;
}

export class SSRFError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SSRFError';
  }
}

/**
 * Private IP ranges that should be blocked to prevent SSRF attacks
 */
const PRIVATE_IP_RANGES = [
  // IPv4 private ranges
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  // IPv6 private ranges
  /^fc00:/i,
  /^fe80:/i,
  /^::1$/,
  /^fd/,
];

/**
 * Validates a URL to prevent SSRF attacks
 * @param url - The URL to validate
 * @param options - Validation options
 * @throws {SSRFError} If the URL is invalid or potentially dangerous
 */
export function validateUrl(
  url: string,
  options: UrlValidationOptions = {}
): void {
  const {
    allowPrivateIPs = false,
    allowLocalhost = false,
    allowedProtocols = ['http:', 'https:'],
    disableValidation = false,
  } = options;

  if (disableValidation) {
    return;
  }

  if (!url || typeof url !== 'string') {
    throw new SSRFError('URL must be a non-empty string');
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch (error) {
    throw new SSRFError(`Invalid URL format: ${url}`);
  }

  // Validate protocol
  const protocol = parsedUrl.protocol.toLowerCase();
  if (!allowedProtocols.includes(protocol)) {
    throw new SSRFError(
      `Protocol "${protocol}" is not allowed. Only ${allowedProtocols.join(', ')} are permitted.`
    );
  }

  // Check for localhost
  const hostname = parsedUrl.hostname.toLowerCase();
  // Normalize IPv6 addresses (remove brackets if present)
  const normalizedHostname = hostname.replace(/^\[|\]$/g, '');
  const isLocalhost =
    normalizedHostname === 'localhost' ||
    normalizedHostname === '127.0.0.1' ||
    normalizedHostname === '::1' ||
    normalizedHostname === '[::1]' ||
    normalizedHostname.startsWith('127.') ||
    normalizedHostname === '0.0.0.0';

  if (isLocalhost && !allowLocalhost) {
    throw new SSRFError(
      'Localhost addresses are not allowed for security reasons. Set allowLocalhost=true to override.'
    );
  }

  // Check for private IP ranges
  if (!allowPrivateIPs) {
    const isPrivateIP = PRIVATE_IP_RANGES.some((range) =>
      range.test(normalizedHostname)
    );

    if (isPrivateIP) {
      throw new SSRFError(
        'Private/internal IP addresses are not allowed for security reasons. Set allowPrivateIPs=true to override.'
      );
    }

    // Additional check for IPv4 private ranges using numeric comparison
    if (/^\d+\.\d+\.\d+\.\d+$/.test(normalizedHostname)) {
      const parts = normalizedHostname.split('.').map(Number);
      const [a, b] = parts;

      // 10.0.0.0/8
      if (a === 10) {
        throw new SSRFError(
          'Private IP addresses (10.x.x.x) are not allowed for security reasons.'
        );
      }

      // 172.16.0.0/12
      if (a === 172 && b >= 16 && b <= 31) {
        throw new SSRFError(
          'Private IP addresses (172.16-31.x.x) are not allowed for security reasons.'
        );
      }

      // 192.168.0.0/16
      if (a === 192 && b === 168) {
        throw new SSRFError(
          'Private IP addresses (192.168.x.x) are not allowed for security reasons.'
        );
      }

      // 169.254.0.0/16 (link-local)
      if (a === 169 && b === 254) {
        throw new SSRFError(
          'Link-local addresses (169.254.x.x) are not allowed for security reasons.'
        );
      }
    }
  }
}

