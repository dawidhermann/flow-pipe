import { describe, test } from "node:test";
import * as assert from "node:assert";
import { validateUrl, SSRFError } from "../urlValidator";

describe("URL Validator", () => {
  describe("Valid URLs", () => {
    test("should allow https URLs", () => {
      assert.doesNotThrow(() => {
        validateUrl("https://example.com");
      });
    });

    test("should allow http URLs", () => {
      assert.doesNotThrow(() => {
        validateUrl("http://example.com");
      });
    });

    test("should allow URLs with paths", () => {
      assert.doesNotThrow(() => {
        validateUrl("https://api.example.com/users/123");
      });
    });

    test("should allow URLs with query parameters", () => {
      assert.doesNotThrow(() => {
        validateUrl("https://api.example.com/search?q=test");
      });
    });
  });

  describe("Invalid protocols", () => {
    test("should reject file:// protocol", () => {
      assert.throws(
        () => {
          validateUrl("file:///etc/passwd");
        },
        SSRFError,
        /Protocol "file:" is not allowed/
      );
    });

    test("should reject ftp:// protocol", () => {
      assert.throws(
        () => {
          validateUrl("ftp://example.com");
        },
        SSRFError,
        /Protocol "ftp:" is not allowed/
      );
    });

    test("should allow custom protocols when configured", () => {
      assert.doesNotThrow(() => {
        validateUrl("file:///etc/passwd", {
          allowedProtocols: ["file:"],
        });
      });
    });
  });

  describe("Localhost protection", () => {
    test("should reject localhost", () => {
      assert.throws(
        () => {
          validateUrl("http://localhost:3000");
        },
        SSRFError,
        /Localhost addresses are not allowed/
      );
    });

    test("should reject 127.0.0.1", () => {
      assert.throws(
        () => {
          validateUrl("http://127.0.0.1:3000");
        },
        SSRFError,
        /Localhost addresses are not allowed/
      );
    });

    test("should reject ::1 (IPv6 localhost)", () => {
      assert.throws(
        () => {
          validateUrl("http://[::1]:3000");
        },
        SSRFError,
        /Localhost addresses are not allowed/
      );
    });

    test("should allow localhost when configured", () => {
      assert.doesNotThrow(() => {
        validateUrl("http://localhost:3000", {
          allowLocalhost: true,
        });
      });
    });
  });

  describe("Private IP protection", () => {
    test("should reject 10.x.x.x addresses", () => {
      assert.throws(
        () => {
          validateUrl("http://10.0.0.1");
        },
        SSRFError,
        /Private IP addresses \(10\.x\.x\.x\)/
      );
    });

    test("should reject 172.16-31.x.x addresses", () => {
      assert.throws(
        () => {
          validateUrl("http://172.16.0.1");
        },
        SSRFError,
        /Private IP addresses \(172\.16-31\.x\.x\)/
      );
    });

    test("should reject 192.168.x.x addresses", () => {
      assert.throws(
        () => {
          validateUrl("http://192.168.1.1");
        },
        SSRFError,
        /Private IP addresses \(192\.168\.x\.x\)/
      );
    });

    test("should reject 169.254.x.x (link-local)", () => {
      assert.throws(
        () => {
          validateUrl("http://169.254.0.1");
        },
        SSRFError,
        /Link-local addresses/
      );
    });

    test("should allow private IPs when configured", () => {
      assert.doesNotThrow(() => {
        validateUrl("http://10.0.0.1", {
          allowPrivateIPs: true,
        });
      });
    });
  });

  describe("Invalid URL format", () => {
    test("should reject invalid URL strings", () => {
      assert.throws(
        () => {
          validateUrl("not-a-url");
        },
        SSRFError,
        /Invalid URL format/
      );
    });

    test("should reject empty strings", () => {
      assert.throws(
        () => {
          validateUrl("");
        },
        SSRFError,
        /URL must be a non-empty string/
      );
    });

    test("should reject non-string values", () => {
      assert.throws(
        () => {
          validateUrl(null as unknown as string);
        },
        SSRFError,
        /URL must be a non-empty string/
      );
    });
  });

  describe("Validation disabling", () => {
    test("should skip validation when disabled", () => {
      assert.doesNotThrow(() => {
        validateUrl("file:///etc/passwd", {
          disableValidation: true,
        });
      });
    });

    test("should skip validation for localhost when disabled", () => {
      assert.doesNotThrow(() => {
        validateUrl("http://localhost:3000", {
          disableValidation: true,
        });
      });
    });
  });
});

