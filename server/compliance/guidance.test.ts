/** Guidance/clarification workflow + attorney-privilege filtering. */
import { describe, it, expect } from "vitest";
import { canTransitionClarification, filterPrivileged, canViewRecord } from "./guidance";

describe("clarification workflow transitions", () => {
  it("allows the expected forward path", () => {
    expect(canTransitionClarification("submitted", "facts_recorded")).toBe(true);
    expect(canTransitionClarification("facts_recorded", "legal_requested")).toBe(true);
    expect(canTransitionClarification("facts_recorded", "sent_to_agency")).toBe(true); // legal optional
    expect(canTransitionClarification("sent_to_agency", "answered")).toBe(true);
    expect(canTransitionClarification("answered", "interpreted")).toBe(true);
    expect(canTransitionClarification("interpreted", "closed")).toBe(true);
  });
  it("rejects illegal jumps", () => {
    expect(canTransitionClarification("submitted", "answered")).toBe(false);
    expect(canTransitionClarification("closed", "submitted")).toBe(false);
    expect(canTransitionClarification("sent_to_agency", "interpreted")).toBe(false); // must be answered first
  });
});

describe("attorney-client privilege filtering", () => {
  const rows = [
    { id: 1, privileged: false, title: "public guidance" },
    { id: 2, privileged: true, title: "privileged legal memo" },
    { id: 3, privileged: false, title: "another public" },
  ];
  it("hides privileged rows from callers without PRIVILEGED_VIEW", () => {
    const filtered = filterPrivileged(rows, false);
    expect(filtered.map((r) => r.id)).toEqual([1, 3]);
  });
  it("shows privileged rows to callers with PRIVILEGED_VIEW", () => {
    expect(filterPrivileged(rows, true).map((r) => r.id)).toEqual([1, 2, 3]);
  });
  it("canViewRecord gates a single privileged record", () => {
    expect(canViewRecord({ privileged: true }, false)).toBe(false);
    expect(canViewRecord({ privileged: true }, true)).toBe(true);
    expect(canViewRecord({ privileged: false }, false)).toBe(true);
  });
});
