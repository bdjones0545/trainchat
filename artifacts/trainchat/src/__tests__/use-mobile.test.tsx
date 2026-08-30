import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useIsMobile } from "@/hooks/use-mobile";

describe("useIsMobile", () => {
  it("uses the current viewport on first render and follows breakpoint changes", () => {
    let changeListener: ((event: MediaQueryListEvent) => void) | undefined;
    const mediaQuery = {
      matches: true,
      media: "(max-width: 767px)",
      onchange: null,
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        changeListener = listener;
      },
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList;

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    vi.spyOn(window, "matchMedia").mockReturnValue(mediaQuery);

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);

    Object.defineProperty(mediaQuery, "matches", { value: false });
    act(() => changeListener?.({ matches: false } as MediaQueryListEvent));

    expect(result.current).toBe(false);
  });
});
