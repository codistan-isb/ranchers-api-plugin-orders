import checkTimeBasedDiscount from "./checkTimeBasedDiscount.js";

describe("checkTimeBasedDiscount", () => {
  let originalDateNow;

  beforeEach(() => {
    // Save the original Date.now
    originalDateNow = Date.now;
  });

  afterEach(() => {
    // Restore the original Date.now
    global.Date.now = originalDateNow;
  });

  /**
   * Helper function to mock the current time
   */
  const mockCurrentTime = (hour, minute = 0) => {
    const mockDate = new Date();
    mockDate.setHours(hour, minute, 0, 0);
    global.Date = class extends Date {
      constructor() {
        super();
        return mockDate;
      }
      static now() {
        return mockDate.getTime();
      }
    };
  };

  describe("during discount hours (8pm to 2am)", () => {
    it("should apply 10% discount at 8pm (20:00)", () => {
      mockCurrentTime(20); // 8pm
      const result = checkTimeBasedDiscount(1000);
      expect(result.isDiscountActive).toBe(true);
      expect(result.discountAmount).toBe(100);
      expect(result.discountPercentage).toBe(10);
    });

    it("should apply 10% discount at 11:59pm (23:59)", () => {
      mockCurrentTime(23, 59);
      const result = checkTimeBasedDiscount(1000);
      expect(result.isDiscountActive).toBe(true);
      expect(result.discountAmount).toBe(100);
      expect(result.discountPercentage).toBe(10);
    });

    it("should apply 10% discount at midnight (00:00)", () => {
      mockCurrentTime(0);
      const result = checkTimeBasedDiscount(1000);
      expect(result.isDiscountActive).toBe(true);
      expect(result.discountAmount).toBe(100);
      expect(result.discountPercentage).toBe(10);
    });

    it("should apply 10% discount at 1:59am (01:59)", () => {
      mockCurrentTime(1, 59);
      const result = checkTimeBasedDiscount(1000);
      expect(result.isDiscountActive).toBe(true);
      expect(result.discountAmount).toBe(100);
      expect(result.discountPercentage).toBe(10);
    });

    it("should calculate correct discount amount for various totals", () => {
      mockCurrentTime(21); // 9pm
      
      const result500 = checkTimeBasedDiscount(500);
      expect(result500.discountAmount).toBe(50);
      
      const result2500 = checkTimeBasedDiscount(2500);
      expect(result2500.discountAmount).toBe(250);
      
      const result999 = checkTimeBasedDiscount(999);
      expect(result999.discountAmount).toBe(99.9);
    });
  });

  describe("outside discount hours", () => {
    it("should NOT apply discount at 2am (02:00)", () => {
      mockCurrentTime(2);
      const result = checkTimeBasedDiscount(1000);
      expect(result.isDiscountActive).toBe(false);
      expect(result.discountAmount).toBe(0);
      expect(result.discountPercentage).toBe(0);
    });

    it("should NOT apply discount at noon (12:00)", () => {
      mockCurrentTime(12);
      const result = checkTimeBasedDiscount(1000);
      expect(result.isDiscountActive).toBe(false);
      expect(result.discountAmount).toBe(0);
      expect(result.discountPercentage).toBe(0);
    });

    it("should NOT apply discount at 7:59pm (19:59)", () => {
      mockCurrentTime(19, 59);
      const result = checkTimeBasedDiscount(1000);
      expect(result.isDiscountActive).toBe(false);
      expect(result.discountAmount).toBe(0);
      expect(result.discountPercentage).toBe(0);
    });

    it("should NOT apply discount at 3pm (15:00)", () => {
      mockCurrentTime(15);
      const result = checkTimeBasedDiscount(1000);
      expect(result.isDiscountActive).toBe(false);
      expect(result.discountAmount).toBe(0);
      expect(result.discountPercentage).toBe(0);
    });
  });

  describe("edge cases", () => {
    it("should handle zero item total", () => {
      mockCurrentTime(21);
      const result = checkTimeBasedDiscount(0);
      expect(result.isDiscountActive).toBe(true);
      expect(result.discountAmount).toBe(0);
    });

    it("should handle fractional item totals", () => {
      mockCurrentTime(21);
      const result = checkTimeBasedDiscount(333.33);
      expect(result.isDiscountActive).toBe(true);
      expect(result.discountAmount).toBeCloseTo(33.333, 2);
    });

    it("should handle large item totals", () => {
      mockCurrentTime(21);
      const result = checkTimeBasedDiscount(50000);
      expect(result.isDiscountActive).toBe(true);
      expect(result.discountAmount).toBe(5000);
    });
  });
});
