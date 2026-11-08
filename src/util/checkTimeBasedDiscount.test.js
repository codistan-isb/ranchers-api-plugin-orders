import checkTimeBasedDiscount, { sumNonDealItemsTotal } from "./checkTimeBasedDiscount.js";

describe("checkTimeBasedDiscount", () => {
  let OriginalDate;

  beforeEach(() => {
    OriginalDate = global.Date;
  });

  afterEach(() => {
    global.Date = OriginalDate;
  });

  const installMockDate = (mockDate) => {
    global.Date = class extends OriginalDate {
      constructor(...args) {
        if (args.length === 0) return new OriginalDate(mockDate.getTime());
        return new OriginalDate(...args);
      }
      static now() {
        return mockDate.getTime();
      }
    };
  };

  /**
   * Helper function to mock the current time in the machine timezone
   */
  const mockCurrentTime = (hour, minute = 0) => {
    const mockDate = new OriginalDate();
    mockDate.setHours(hour, minute, 0, 0);
    installMockDate(mockDate);
  };

  const mockInstant = (isoString) => {
    installMockDate(new OriginalDate(isoString));
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
      expect(result999.discountAmount).toBe(100);
    });

    it("should apply shop-configured discount percentage", () => {
      mockCurrentTime(21); // 9pm
      const result = checkTimeBasedDiscount(1000, "Asia/Karachi", 15);
      expect(result.isDiscountActive).toBe(true);
      expect(result.discountAmount).toBe(150);
      expect(result.discountPercentage).toBe(15);
    });

    it("should apply discount using shop-configured start and end times", () => {
      mockCurrentTime(22); // 10pm
      const result = checkTimeBasedDiscount(1000, "Asia/Karachi", 20, "8PM", "2AM");
      expect(result.isDiscountActive).toBe(true);
      expect(result.discountAmount).toBe(200);
      expect(result.discountPercentage).toBe(20);
    });

    it("should not apply discount before a later configured start time", () => {
      mockCurrentTime(21); // 9pm
      const result = checkTimeBasedDiscount(1000, "Asia/Karachi", 20, "10PM", "2AM");
      expect(result.isDiscountActive).toBe(false);
      expect(result.discountAmount).toBe(0);
      expect(result.discountPercentage).toBe(0);
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
      expect(result.discountAmount).toBe(34);
    });

    it("should handle large item totals", () => {
      mockCurrentTime(21);
      const result = checkTimeBasedDiscount(50000);
      expect(result.isDiscountActive).toBe(true);
      expect(result.discountAmount).toBe(5000);
    });

    it("rounds 10% of a 575 ala carte total up to 58 inside a 9AM-2AM window", () => {
      mockInstant("2026-11-08T05:12:19.711Z"); // 10:12 Asia/Karachi
      const result = checkTimeBasedDiscount(575, "Asia/Karachi", 10, "9AM", "2AM");
      expect(result.isDiscountActive).toBe(true);
      expect(result.discountAmount).toBe(58);
      expect(result.discountPercentage).toBe(10);
    });
  });
});

describe("sumNonDealItemsTotal", () => {
  const DEAL_TAG_ID = "QxJefMA3viGnquk6Y";

  it("discounts only the ala carte line when a deal is in the same order", () => {
    const groups = [
      {
        group: {
          items: [
            {
              productId: "deal-product",
              variantId: "deal-variant",
              productTagIds: [DEAL_TAG_ID],
              subtotal: 1999,
              quantity: 1
            },
            {
              productId: "burger",
              variantId: "burger-variant",
              productTagIds: [],
              subtotal: 575,
              quantity: 1
            }
          ]
        }
      }
    ];

    expect(sumNonDealItemsTotal(groups)).toBe(575);
  });

  it("treats a cart isDeal flag as a deal even when the order line has no deal tag", () => {
    const groups = [
      {
        group: {
          items: [
            { productId: "deal-product", variantId: "deal-variant", subtotal: 1999, quantity: 1 },
            { productId: "burger", variantId: "burger-variant", subtotal: 575, quantity: 1 }
          ]
        }
      }
    ];
    const cartItems = [
      { productId: "deal-product", variantId: "deal-variant", isDeal: true, subtotal: { amount: 1999 } },
      { productId: "burger", variantId: "burger-variant", isDeal: false, subtotal: { amount: 575 } }
    ];

    expect(sumNonDealItemsTotal(groups, cartItems)).toBe(575);
  });

  it("returns 0 when every line is a deal", () => {
    const groups = [
      {
        items: [
          { productId: "deal-product", isDeal: true, subtotal: 1999, quantity: 1 }
        ]
      }
    ];

    expect(sumNonDealItemsTotal(groups)).toBe(0);
  });
});
