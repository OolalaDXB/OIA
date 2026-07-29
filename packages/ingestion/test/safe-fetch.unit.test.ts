import { describe, it, expect } from "vitest";
import { validateUrlShape, isPrivateOrReservedIp } from "../src/safe-fetch";

describe("[UNIT] safe-fetch SSRF url-shape validation", () => {
  it("allows normal https official URLs", () => {
    expect(validateUrlShape("https://ec.europa.eu/info").ok).toBe(true);
    expect(validateUrlShape("http://hub71.com/x").ok).toBe(true);
  });

  it("blocks non-http(s) protocols", () => {
    expect(validateUrlShape("file:///etc/passwd").ok).toBe(false);
    expect(validateUrlShape("ftp://host/x").ok).toBe(false);
    expect(validateUrlShape("gopher://host").ok).toBe(false);
  });

  it("blocks credentials in URL", () => {
    expect(validateUrlShape("https://user:pass@host.com/").ok).toBe(false);
  });

  it("blocks localhost and loopback/private IP literals", () => {
    expect(validateUrlShape("http://localhost/").ok).toBe(false);
    expect(validateUrlShape("http://127.0.0.1/").ok).toBe(false);
    expect(validateUrlShape("http://10.0.0.5/").ok).toBe(false);
    expect(validateUrlShape("http://169.254.169.254/latest/meta-data").ok).toBe(false); // cloud metadata
    expect(validateUrlShape("http://192.168.1.1/").ok).toBe(false);
    expect(validateUrlShape("http://[::1]/").ok).toBe(false);
  });

  it("honours denylist and allowlist", () => {
    expect(validateUrlShape("https://evil.com/", { denylist: ["evil.com"] }).ok).toBe(false);
    expect(validateUrlShape("https://other.com/", { allowlist: ["ec.europa.eu"] }).ok).toBe(false);
    expect(validateUrlShape("https://ec.europa.eu/", { allowlist: ["ec.europa.eu"] }).ok).toBe(true);
  });

  it("classifies private/reserved IP ranges", () => {
    for (const ip of ["10.1.2.3", "127.0.0.1", "172.16.0.1", "192.168.0.1", "169.254.1.1", "100.64.0.1", "::1"]) {
      expect(isPrivateOrReservedIp(ip)).toBe(true);
    }
    for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34"]) {
      expect(isPrivateOrReservedIp(ip)).toBe(false);
    }
  });
});
