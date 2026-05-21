# Time-Based Discount Feature (8PM - 2AM: 10% Off)

## Overview
This feature **automatically applies a 10% discount** on all product orders placed between **8:00 PM (20:00) and 2:00 AM (02:00)** daily. 

⚠️ **Important**: This discount is **completely automatic** and **does NOT require any discount code** to be entered. It applies to all customers automatically during the discount window.

This is useful for promoting off-peak ordering or incentivizing customers during specific hours.

## How It Works

### No Discount Code Required
- ✓ **Automatic application** - Discount is applied without customers entering a code
- ✓ **Universal** - Applies to all orders during the discount window
- ✓ **Stackable** - Works together with existing promotional/promo codes (both discounts apply)
- ✓ **No configuration needed** - Active immediately during specified hours

### Time Window
- **Start Time**: 8:00 PM (20:00)
- **End Time**: 2:00 AM (02:00) next day
- **Discount**: 10% off all items

**Example Timeline**:
- 7:59 PM → No discount
- 8:00 PM → 10% discount applied ✓
- 11:00 PM → 10% discount applied ✓
- 12:00 AM (midnight) → 10% discount applied ✓
- 1:59 AM → 10% discount applied ✓
- 2:00 AM → No discount
- 3:00 AM → No discount
- 8:00 AM → No discount

### Implementation Details

#### Files Modified
1. **src/util/checkTimeBasedDiscount.js** - Core utility function
2. **src/mutations/placeOrder.js** - Integration with order placement

#### Files Created
1. **src/util/checkTimeBasedDiscount.test.js** - Unit tests

### Code Flow

#### 1. Utility Function: `checkTimeBasedDiscount.js`
```javascript
import checkTimeBasedDiscount from "../util/checkTimeBasedDiscount.js";

const result = checkTimeBasedDiscount(itemsTotal);
// Returns: {
//   isDiscountActive: boolean,
//   discountAmount: number,
//   discountPercentage: number (0 or 10)
// }
```

**Parameters**:
- `itemsTotal` (Number): Total amount of items before discount

**Returns**:
- `isDiscountActive` (Boolean): Whether discount is currently active
- `discountAmount` (Number): Calculated 10% discount amount
- `discountPercentage` (Number): Percentage of discount (0 or 10)

#### 2. Integration in Order Placement

The discount is applied in `placeOrder.js` after retrieving cart discounts:

```javascript
// Calculate time-based discount
const { isDiscountActive, discountAmount } = checkTimeBasedDiscount(itemsTotal);
if (isDiscountActive) {
  const timeBasedDiscountInfo = {
    label: "Night Discount (8PM-2AM)",
    amount: timeBasedDiscount,
    discountPercentage: 10,
    appliedAt: new Date()
  };
  discounts.push(timeBasedDiscountInfo);
  discountTotal += timeBasedDiscount;
}
```

### API Response

When an order is placed during discount hours, the response includes the discount:

```graphql
{
  order {
    _id
    discounts {
      label: "Night Discount (8PM-2AM)"
      amount: 50.00
      discountPercentage: 10
      appliedAt: "2024-05-20T21:30:00Z"
    }
    invoices {
      discounts: 50.00
      subtotal: 500.00
      total: 450.00
    }
  }
}
```

## Example Scenarios

### Scenario 1: Order at 9:00 PM
- Order Total (items): $500.00
- Time-based Discount (10%): -$50.00
- **Final Total**: $450.00

### Scenario 2: Order at 3:00 PM
- Order Total (items): $500.00
- Time-based Discount: $0.00
- **Final Total**: $500.00

### Scenario 3: Order at 12:30 AM with Promo Code
- Order Total (items): $500.00
- Promo Code Discount: -$25.00
- Time-based Discount (10%): -$50.00
- **Final Total**: $425.00

### Scenario 4: Order at 2:30 AM (Outside discount hours)
- Order Total (items): $500.00
- Promo Code Discount: -$25.00
- Time-based Discount: $0.00 (outside 8PM-2AM window)
- **Final Total**: $475.00

## Testing

### Running Tests
```bash
npm test -- src/util/checkTimeBasedDiscount.test.js
```

### Test Coverage
- ✓ Discount applied during all hours (8PM-2AM)
- ✓ Discount NOT applied outside hours
- ✓ Correct discount calculation for various amounts
- ✓ Edge cases (zero amounts, fractional amounts, large amounts)

### Manual Testing

#### Using GraphQL (No Discount Code Required)
Simply place an order during 8PM-2AM - the discount is applied automatically!

```graphql
mutation {
  placeOrder(input: {
    order: {
      cartId: "cart123"
      email: "customer@example.com"
      fulfillmentGroups: [...]
      # NO discountCode field needed - discount applies automatically!
    }
  }) {
    order {
      _id
      createdAt
      discounts {
        label
        amount
        discountPercentage
      }
      invoices {
        total
        discounts
        subtotal
      }
    }
  }
}
```

## Configuration & Future Enhancements

### Current Configuration (Hardcoded)
- Discount Percentage: 10%
- Start Hour: 20 (8 PM)
- End Hour: 2 (2 AM)

### Future Enhancements
1. **Make discount percentage configurable** via environment variables or settings
2. **Support multiple time windows** (e.g., weekend special pricing)
3. **Support category-specific discounts** (apply to specific product types)
4. **Geographic-based discounts** (different hours based on timezone)
5. **Admin dashboard** to enable/disable or modify hours
6. **Analytics** to track discount usage and impact

### To Make Configurable

Modify `checkTimeBasedDiscount.js`:

```javascript
export default function checkTimeBasedDiscount(itemTotal, options = {}) {
  const {
    discountPercentage = 10,
    startHour = 20,
    endHour = 2
  } = options;
  
  const now = new Date();
  const currentHour = now.getHours();
  
  const isDiscountActive = startHour > endHour 
    ? (currentHour >= startHour || currentHour < endHour)
    : (currentHour >= startHour && currentHour < endHour);
  
  const discountAmount = isDiscountActive ? itemTotal * (discountPercentage / 100) : 0;
  
  return {
    isDiscountActive,
    discountAmount,
    discountPercentage: isDiscountActive ? discountPercentage : 0
  };
}
```

## Troubleshooting

### Discount not appearing in orders
1. Check the current server time (must be 8PM-2AM)
2. Verify `checkTimeBasedDiscount` function is imported in `placeOrder.js`
3. Check logs for any errors during discount calculation
4. Ensure item total is calculated correctly before discount function

### Multiple Discounts (Time-Based + Promo Code)
Both discounts are **automatically combined**:
- If customer orders during 8PM-2AM, they get the 10% time-based discount
- If they also enter a promo code, they get **both** discounts applied
- This is by design - the discounts stack to maximize customer savings during night hours

### Discount amount incorrect
1. Verify the calculation: `itemTotal × 0.10 = discountAmount`
2. Check for floating-point rounding issues in accounting.js
3. Verify time window logic (especially around midnight)

### Time zone issues
If orders are placed in different time zones:
- Current implementation uses **server local time**
- For multi-timezone support, pass timezone info to `checkTimeBasedDiscount`
- Modify to use UTC or specify timezone explicitly

## Impact

### Business Impact
- Encourages off-peak ordering during night hours (8PM-2AM)
- Increases order volume during slower periods
- Improves customer satisfaction with better pricing

### Technical Impact
- Minimal performance impact (simple time check)
- No database queries required
- Automatically applied to all orders during discount hours
- Compatible with existing discount codes and promotions

## Related Files
- [src/util/checkTimeBasedDiscount.js](./checkTimeBasedDiscount.js) - Core implementation
- [src/mutations/placeOrder.js](../mutations/placeOrder.js#L305) - Integration point
- [src/util/checkTimeBasedDiscount.test.js](./checkTimeBasedDiscount.test.js) - Tests
