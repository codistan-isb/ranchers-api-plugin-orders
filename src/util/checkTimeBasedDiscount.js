import moment from "moment-timezone";

const DEAL_TAG_ID = "QxJefMA3viGnquk6Y";

/**
 * @summary A line is a deal when the cart or order item is flagged, or it carries the deal tag.
 *   Deal lines are excluded from the time-based discount. Ala carte lines are not.
 * @param {Object} item Cart item or order item
 * @returns {Boolean}
 */
export function isDealItem(item) {
  if (!item) return false;
  return (
    item.isDeal === true ||
    (Array.isArray(item.productTagIds) && item.productTagIds.includes(DEAL_TAG_ID))
  );
}

/**
 * @summary Line total used for the time discount. Order items store a numeric subtotal;
 *   cart items store `{ amount }`.
 * @param {Object} item Order or cart item
 * @returns {Number}
 */
function lineSubtotal(item) {
  if (typeof item?.subtotal === "number" && Number.isFinite(item.subtotal)) {
    return item.subtotal;
  }
  if (typeof item?.subtotal?.amount === "number" && Number.isFinite(item.subtotal.amount)) {
    return item.subtotal.amount;
  }
  const price = typeof item?.price === "number" ? item.price : Number(item?.price?.amount);
  const quantity = Number(item?.quantity) || 0;
  if (Number.isFinite(price)) return price * quantity;
  return 0;
}

/**
 * @summary Sum of ala carte (non-deal) item totals. A deal in the same order does not
 *   zero this out; only that deal's own price is left out.
 * @param {Object[]} groups Fulfillment groups, or `{ group }` wrappers from the first pricing pass
 * @param {Object[]} [cartItems] Cart items, used when `isDeal` lives on the cart line
 * @returns {Number}
 */
export function sumNonDealItemsTotal(groups = [], cartItems = []) {
  let total = 0;
  for (const entry of groups) {
    const items = entry?.group?.items || entry?.items || [];
    for (const item of items) {
      const cartItem = (cartItems || []).find((candidate) => {
        if (!candidate?.productId || !item?.productId) return false;
        if (candidate.productId !== item.productId) return false;
        if (candidate.variantId && item.variantId && candidate.variantId !== item.variantId) return false;
        return true;
      });
      if (isDealItem(item) || isDealItem(cartItem)) continue;
      total += lineSubtotal(item);
    }
  }
  return total;
}

/**
 * @summary Check if current time is within the shop discount window
 *   and calculate the discount amount for the given (already deal-excluded) item total
 * @param {Number} itemTotal Ala carte item total the percentage applies to
 * @param {String} [timeZone="Asia/Karachi"] IANA timezone for customer local time
 * @param {Number|String} [discountPercentage=10] Discount percentage from shop settings
 * @param {String} [startTime="8PM"] Discount start time from shop settings
 * @param {String} [endTime="2AM"] Discount end time from shop settings
 * @returns {Object} Object with isDiscountActive and discountAmount
 */
export default function checkTimeBasedDiscount(
  itemTotal,
  timeZone = "Asia/Karachi",
  discountPercentage = 10,
  startTime = "8PM",
  endTime = "2AM"
) {
  const now = moment().tz(timeZone);
  const currentHour = now.hours();
  const parsedDiscountPercentage = Number(discountPercentage);
  const safeDiscountPercentage = Number.isFinite(parsedDiscountPercentage) && parsedDiscountPercentage >= 0
    ? parsedDiscountPercentage
    : 10;

  const parseHour = (value, fallbackHour) => {
    const parsedTime = moment(value, ["hA", "ha", "h:mmA", "h:mma", "H", "H:mm"], true);
    return parsedTime.isValid() ? parsedTime.hours() : fallbackHour;
  };

  const startHour = parseHour(startTime, 20);
  const endHour = parseHour(endTime, 2);

  // Support same-day and overnight discount windows.
  const isDiscountActive = startHour < endHour
    ? currentHour >= startHour && currentHour < endHour
    : currentHour >= startHour || currentHour < endHour;

  const discountAmount = isDiscountActive ? Math.ceil(Number(itemTotal) * (safeDiscountPercentage / 100)) : 0;

  return {
    isDiscountActive,
    discountAmount,
    discountPercentage: isDiscountActive ? safeDiscountPercentage : 0
  };
}
