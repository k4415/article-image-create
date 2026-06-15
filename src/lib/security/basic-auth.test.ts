import { describe, expect, it } from "vitest";
import { isBasicAuthAllowed } from "./basic-auth";

function basic(user: string, password: string) {
  return `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
}

describe("isBasicAuthAllowed", () => {
  it("allows requests when basic auth is not configured", () => {
    expect(isBasicAuthAllowed(null, { user: "", password: "" })).toBe(true);
  });

  it("allows matching basic credentials", () => {
    expect(isBasicAuthAllowed(basic("admin", "secret"), { user: "admin", password: "secret" })).toBe(true);
  });

  it("rejects missing or wrong credentials when configured", () => {
    expect(isBasicAuthAllowed(null, { user: "admin", password: "secret" })).toBe(false);
    expect(isBasicAuthAllowed(basic("admin", "wrong"), { user: "admin", password: "secret" })).toBe(false);
  });
});
