import { describe, expect, it } from "vitest";
import {
  terminalWheelAction,
  wheelHasNothingToScroll,
} from "../../../src/frontend/terminal/terminal-wheel";

const keys = { ctrlKey: false, metaKey: false, altKey: false, shiftKey: false };

describe("terminalWheelAction", () => {
  it("zooms with Ctrl or Cmd unless wheel zoom is off", () => {
    const cfg = { wheelZoom: true, fastScrollModifier: "alt" } as const;
    expect(terminalWheelAction({ ...keys, metaKey: true }, cfg)).toBe("zoom");
    expect(terminalWheelAction({ ...keys, ctrlKey: true }, cfg)).toBe("zoom");
    expect(
      terminalWheelAction(
        { ...keys, metaKey: true },
        { ...cfg, wheelZoom: false },
      ),
    ).toBe("default");
  });

  it("fast scrolls with the chosen modifier", () => {
    expect(
      terminalWheelAction(
        { ...keys, ctrlKey: true },
        { wheelZoom: false, fastScrollModifier: "ctrl" },
      ),
    ).toBe("fast");
    expect(
      terminalWheelAction(
        { ...keys, altKey: true },
        { wheelZoom: true, fastScrollModifier: "alt" },
      ),
    ).toBe("fast");
    expect(
      terminalWheelAction(keys, { wheelZoom: true, fastScrollModifier: "alt" }),
    ).toBe("default");
  });
});

describe("wheelHasNothingToScroll", () => {
  it("drops the wheel on a normal buffer with no scrollback yet", () => {
    expect(wheelHasNothingToScroll({ type: "normal", baseY: 0 })).toBe(true);
    expect(wheelHasNothingToScroll({ type: "normal", baseY: 12 })).toBe(false);
  });

  it("leaves the alternate screen alone so less and vim still scroll", () => {
    expect(wheelHasNothingToScroll({ type: "alternate", baseY: 0 })).toBe(
      false,
    );
  });
});
