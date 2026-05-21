import moment from "moment-timezone";

/**
 * @summary Check if current time is within the discount window (8pm to 2am)
 *   and calculate the discount amount
 * @param {Number} itemTotal The total amount of items before discount
 * @param {String} [timeZone="Asia/Karachi"] IANA timezone for customer local time
 * @returns {Object} Object with isDiscountActive and discountAmount
 */
export default function checkTimeBasedDiscount(itemTotal, timeZone = "Asia/Karachi") {
  const currentHour = moment().tz(timeZone).hours();
  
  // Check if current time is between 8pm (20:00) and 2am (02:00)
  // This includes 20:00-23:59 and 00:00-01:59
  const isDiscountActive = currentHour >= 20 || currentHour < 2;

  // Calculate 10% discount if active, rounded up to nearest integer
  const discountAmount = isDiscountActive ? Math.ceil(itemTotal * 0.1) : 0;
  
  return {
    isDiscountActive,
    discountAmount,
    discountPercentage: isDiscountActive ? 10 : 0
  };
}
