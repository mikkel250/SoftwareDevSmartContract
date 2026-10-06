import { expect } from "chai";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const MilestoneMath = require("../frontend/milestone-math.js");

describe("milestoneMath", function () {
  describe("evenSplit", function () {
    it("AE7: splits 3 USDC (3_000_000 units) evenly across 3 milestones", function () {
      const amounts = MilestoneMath.evenSplit(3_000_000n, 3);
      expect(amounts).to.deep.equal([1_000_000n, 1_000_000n, 1_000_000n]);
    });

    it("gives milestone 1 the remainder when splitting 10 across 3", function () {
      const amounts = MilestoneMath.evenSplit(10n, 3);
      expect(amounts).to.deep.equal([4n, 3n, 3n]);
    });

    it("returns the whole total when count is 1", function () {
      const amounts = MilestoneMath.evenSplit(42n, 1);
      expect(amounts).to.deep.equal([42n]);
    });

    it("returns 2, 0, 0 when total 2 is split across 3 milestones", function () {
      const amounts = MilestoneMath.evenSplit(2n, 3);
      expect(amounts).to.deep.equal([2n, 0n, 0n]);
      expect(MilestoneMath.hasZeroAmount(amounts)).to.equal(true);
    });

    it("rejects zero or negative total", function () {
      expect(() => MilestoneMath.evenSplit(0n, 3)).to.throw(Error);
      expect(() => MilestoneMath.evenSplit(-1n, 3)).to.throw(Error);
    });

    it("rejects zero, negative, or non-integer count", function () {
      expect(() => MilestoneMath.evenSplit(10n, 0)).to.throw(Error);
      expect(() => MilestoneMath.evenSplit(10n, -1)).to.throw(Error);
      expect(() => MilestoneMath.evenSplit(10n, 1.5)).to.throw(Error);
    });

    it("amounts always sum exactly to the total", function () {
      const cases: Array<[bigint, number]> = [
        [1n, 7],
        [10_000_000_000_000_000_007n, 7],
        [999n, 17],
      ];
      for (const [total, count] of cases) {
        const amounts = MilestoneMath.evenSplit(total, count);
        const sum = amounts.reduce((a, b) => a + b, 0n);
        expect(sum).to.equal(total);
      }
    });

    it("accepts numeric string for total", function () {
      const amounts = MilestoneMath.evenSplit("10", 3);
      expect(amounts).to.deep.equal([4n, 3n, 3n]);
    });
  });

  describe("hasZeroAmount", function () {
    it("returns false when no milestone is zero", function () {
      expect(MilestoneMath.hasZeroAmount([1n, 2n, 3n])).to.equal(false);
    });

    it("returns true when any milestone is zero", function () {
      expect(MilestoneMath.hasZeroAmount([2n, 0n, 0n])).to.equal(true);
    });
  });

  describe("parseUnits", function () {
    it('parses "1.5" with 6 decimals to 1_500_000', function () {
      expect(MilestoneMath.parseUnits("1.5", 6)).to.equal(1_500_000n);
    });

    it('parses "1.5" with 8 decimals to 150_000_000', function () {
      expect(MilestoneMath.parseUnits("1.5", 8)).to.equal(150_000_000n);
    });

    it('parses "1.5" with 18 decimals to 1500000000000000000n', function () {
      expect(MilestoneMath.parseUnits("1.5", 18)).to.equal(
        1500000000000000000n
      );
    });

    it("rejects more fractional digits than decimals allow", function () {
      expect(() => MilestoneMath.parseUnits("0.0000001", 6)).to.throw(Error);
    });

    it("rejects empty string", function () {
      expect(() => MilestoneMath.parseUnits("", 6)).to.throw(Error);
    });

    it("rejects negative values", function () {
      expect(() => MilestoneMath.parseUnits("-1", 6)).to.throw(Error);
      expect(() => MilestoneMath.parseUnits("-0.5", 6)).to.throw(Error);
    });

    it("rejects non-numeric garbage", function () {
      expect(() => MilestoneMath.parseUnits("abc", 6)).to.throw(Error);
      expect(() => MilestoneMath.parseUnits("1.2.3", 6)).to.throw(Error);
    });

    it("rejects exponent notation", function () {
      expect(() => MilestoneMath.parseUnits("1e6", 6)).to.throw(Error);
      expect(() => MilestoneMath.parseUnits("1.5e2", 6)).to.throw(Error);
    });

    it('accepts "1", "0.5", and leading-dot ".5"', function () {
      expect(MilestoneMath.parseUnits("1", 6)).to.equal(1_000_000n);
      expect(MilestoneMath.parseUnits("0.5", 6)).to.equal(500_000n);
      expect(MilestoneMath.parseUnits(".5", 6)).to.equal(500_000n);
    });

    it("trims leading and trailing whitespace", function () {
      expect(MilestoneMath.parseUnits("  1.5  ", 6)).to.equal(1_500_000n);
    });
  });

  describe("formatUnits", function () {
    it("formats without trailing fractional zeros", function () {
      expect(MilestoneMath.formatUnits(1_500_000n, 6)).to.equal("1.5");
      expect(MilestoneMath.formatUnits(1_000_000n, 6)).to.equal("1");
    });

    it("round-trips parse then format for several pairs", function () {
      const pairs: Array<[string, number]> = [
        ["1.5", 6],
        ["0.5", 8],
        ["100", 18],
        [".25", 6],
        ["0", 6],
      ];
      for (const [s, d] of pairs) {
        const v = MilestoneMath.parseUnits(s, d);
        expect(MilestoneMath.formatUnits(v, d)).to.equal(
          s === ".25" ? "0.25" : s === "0" ? "0" : s
        );
      }
    });

    it("round-trips format then parse", function () {
      const values: Array<[bigint, number]> = [
        [1_500_000n, 6],
        [150_000_000n, 8],
        [1500000000000000000n, 18],
        [42n, 6],
      ];
      for (const [v, d] of values) {
        const s = MilestoneMath.formatUnits(v, d);
        expect(MilestoneMath.parseUnits(s, d)).to.equal(v);
      }
    });
  });

  describe("sumDifference", function () {
    it("returns difference 0 when amounts sum to total", function () {
      const result = MilestoneMath.sumDifference(
        [1_000_000n, 1_000_000n, 1_000_000n],
        3_000_000n
      );
      expect(result.sum).to.equal(3_000_000n);
      expect(result.difference).to.equal(0n);
    });

    it("returns positive difference when sum exceeds total", function () {
      const result = MilestoneMath.sumDifference(
        [2_000_000n, 2_000_000n],
        3_000_000n
      );
      expect(result.sum).to.equal(4_000_000n);
      expect(result.difference).to.equal(1_000_000n);
    });

    it("returns negative difference when sum is below total", function () {
      const result = MilestoneMath.sumDifference(
        [1_000_000n, 500_000n],
        3_000_000n
      );
      expect(result.sum).to.equal(1_500_000n);
      expect(result.difference).to.equal(-1_500_000n);
    });

    it("never throws for a mismatch", function () {
      expect(() =>
        MilestoneMath.sumDifference([1n], 999n)
      ).to.not.throw();
    });

    it("accepts string total where convenient", function () {
      const result = MilestoneMath.sumDifference([1n, 2n], "3");
      expect(result.difference).to.equal(0n);
    });
  });
});
