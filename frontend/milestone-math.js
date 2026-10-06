(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.MilestoneMath = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function assertBigInt(value, name) {
    if (typeof value === "bigint") {
      return value;
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value) || !Number.isInteger(value)) {
        throw new Error(`${name} must be an integer`);
      }
      return BigInt(value);
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!/^-?\d+$/.test(trimmed)) {
        throw new Error(`${name} must be a valid integer string`);
      }
      return BigInt(trimmed);
    }
    throw new Error(`${name} must be a bigint, integer, or integer string`);
  }

  function assertPositiveIntegerCount(count) {
    if (typeof count !== "number" || !Number.isFinite(count)) {
      throw new Error("count must be a positive integer");
    }
    if (!Number.isInteger(count) || count <= 0) {
      throw new Error("count must be a positive integer");
    }
    return count;
  }

  function assertDecimals(decimals) {
    if (
      typeof decimals !== "number" ||
      !Number.isFinite(decimals) ||
      !Number.isInteger(decimals) ||
      decimals < 0
    ) {
      throw new Error("decimals must be a non-negative integer");
    }
    return decimals;
  }

  function evenSplit(total, count) {
    const totalBn = assertBigInt(total, "total");
    if (totalBn <= 0n) {
      throw new Error("total must be greater than zero");
    }
    const n = assertPositiveIntegerCount(count);
    const base = totalBn / BigInt(n);
    const remainder = totalBn % BigInt(n);
    const amounts = new Array(n);
    amounts[0] = base + remainder;
    for (let i = 1; i < n; i += 1) {
      amounts[i] = base;
    }
    return amounts;
  }

  function hasZeroAmount(amounts) {
    if (!Array.isArray(amounts)) {
      throw new Error("amounts must be an array");
    }
    for (let i = 0; i < amounts.length; i += 1) {
      const a = amounts[i];
      if (typeof a !== "bigint") {
        throw new Error("each amount must be a bigint");
      }
      if (a === 0n) {
        return true;
      }
    }
    return false;
  }

  function parseUnits(str, decimals) {
    const d = assertDecimals(decimals);
    if (typeof str !== "string") {
      throw new Error("amount must be a string");
    }
    const trimmed = str.trim();
    if (trimmed.length === 0) {
      throw new Error("amount must not be empty");
    }
    if (/[eE]/.test(trimmed)) {
      throw new Error("exponent notation is not allowed");
    }
    if (trimmed.startsWith("-")) {
      throw new Error("amount must not be negative");
    }
    if (!/^\d*\.?\d+$/.test(trimmed) || trimmed === ".") {
      throw new Error("amount must be a valid decimal string");
    }
    const dotIndex = trimmed.indexOf(".");
    let whole;
    let fraction;
    if (dotIndex === -1) {
      whole = trimmed;
      fraction = "";
    } else {
      const parts = trimmed.split(".");
      if (parts.length !== 2) {
        throw new Error("amount must contain at most one decimal point");
      }
      whole = parts[0];
      fraction = parts[1];
    }
    if (whole.length === 0) {
      whole = "0";
    }
    if (fraction.length > d) {
      throw new Error("too many decimal places for this asset");
    }
    const paddedFraction = fraction.padEnd(d, "0");
    const combined = whole + paddedFraction;
    const normalized = combined.replace(/^0+(?=\d)/, "");
    return BigInt(normalized.length === 0 ? "0" : normalized);
  }

  function formatUnits(value, decimals) {
    const d = assertDecimals(decimals);
    const v = assertBigInt(value, "value");
    if (v === 0n) {
      return "0";
    }
    const negative = v < 0n;
    const abs = negative ? -v : v;
    const base = 10n ** BigInt(d);
    let whole = abs / base;
    let fraction = abs % base;
    if (fraction === 0n) {
      const wholeStr = whole.toString();
      return negative ? `-${wholeStr}` : wholeStr;
    }
    let fractionStr = fraction.toString().padStart(d, "0");
    fractionStr = fractionStr.replace(/0+$/, "");
    const wholeStr = whole.toString();
    const result = `${wholeStr}.${fractionStr}`;
    return negative ? `-${result}` : result;
  }

  function sumDifference(amounts, total) {
    if (!Array.isArray(amounts)) {
      throw new Error("amounts must be an array");
    }
    let sum = 0n;
    for (let i = 0; i < amounts.length; i += 1) {
      sum += assertBigInt(amounts[i], "amount");
    }
    const totalBn = assertBigInt(total, "total");
    return {
      sum,
      difference: sum - totalBn,
    };
  }

  return {
    evenSplit,
    hasZeroAmount,
    parseUnits,
    formatUnits,
    sumDifference,
  };
});
