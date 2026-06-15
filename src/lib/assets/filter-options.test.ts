import { describe, expect, it } from "vitest";
import { buildAssetFilterOptions } from "./filter-options";

describe("buildAssetFilterOptions", () => {
  it("returns distinct non-empty gender and age band options sorted for display", () => {
    expect(
      buildAssetFilterOptions([
        { target_gender: " 女性 ", target_age_band: "60代" },
        { target_gender: "男性", target_age_band: "50代" },
        { target_gender: "女性", target_age_band: "60代" },
        { target_gender: "all", target_age_band: "50s-60s" },
        { target_gender: "男性・女性", target_age_band: "シニア" },
        { target_gender: "男女共用", target_age_band: "60代以���" },
        { target_gender: "", target_age_band: null },
        { target_gender: null, target_age_band: " " },
      ]),
    ).toEqual({
      targetGenders: ["女性", "男性", "男女共通"],
      targetAgeBands: ["50代", "50代〜60代", "60代", "60代以上"],
    });
  });
});
