import { describe, expect, it } from "vitest";
import { areaSchema, hoursSchema, weekdaySchema } from "@/modules/service-coverage/validation";
const area = { name: " Westminster ", postcode: "sw1a1aa", notes: " Coverage ", active: true, display_order: "0" };
describe("service area validation", () => {
  it("normalizes whitespace, postcode and order", () => {
    expect(areaSchema.parse(area)).toEqual({ name: "Westminster", postcode: "SW1A 1AA", notes: "Coverage", active: true, display_order: 0 });
  });
  it.each(["", "SW1A", "M1", "B33", "CR2", "DN55", "W1A 1AA", "EC1A 1BB", "GIR 0AA", "BT7 1NN"])("accepts optional/outward/full postcode %s", (postcode) => {
    expect(areaSchema.safeParse({ ...area, postcode }).success).toBe(true);
  });
  it.each([{ name: " " }, { name: "x".repeat(121) }, { postcode: "90210" }, { postcode: "London" }, { postcode: "SW1A 1" }, { notes: "x".repeat(1001) }, { display_order: "-1" }, { display_order: "1.5" }, { display_order: "10001" }])("rejects invalid area %j", (change) => {
    expect(areaSchema.safeParse({ ...area, ...change }).success).toBe(false);
  });
});
describe("weekly opening hours validation", () => {
  it("accepts a same-day interval", () => {
    expect(hoursSchema.safeParse({ is_closed: false, opens_at: "09:00", closes_at: "17:30" }).success).toBe(true);
  });
  it.each([null, "", "bad", "09:00"])("closed day discards stale times %s", (time) => {
    expect(hoursSchema.parse({ is_closed: true, opens_at: time, closes_at: time })).toEqual({ is_closed: true, opens_at: null, closes_at: null });
  });
  it.each([["", "17:00"], ["09:00", ""], ["24:00", "25:00"], ["09:60", "17:00"], ["9:00", "17:00"], ["09:00:01", "17:00"], ["17:00", "09:00"], ["09:00", "09:00"]])("rejects interval %s–%s", (opens_at, closes_at) => {
    expect(hoursSchema.safeParse({ is_closed: false, opens_at, closes_at }).success).toBe(false);
  });
  it("accepts exactly seven weekday selectors", () => {
    for (let day = 1; day <= 7; day++) expect(weekdaySchema.parse(String(day))).toBe(day);
    for (const value of ["0", "8", "1.5", "", "Monday", null]) expect(weekdaySchema.safeParse(value).success).toBe(false);
  });
});
