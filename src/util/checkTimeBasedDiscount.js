import moment from "moment-timezone";

/**
 * @summary Check if current time is within the discount window (8pm to 2am)
 *   and calculate the discount amount
 * @param {Number} itemTotal The total amount of items before discount
 * @param {String} [timeZone="Asia/Karachi"] IANA timezone for customer local time
 * @param {Number|String} [discountPercentage=10] Discount percentage from shop settings
 * @param {String} [startTime="8PM"] Discount start time from shop settings
 * @param {String} [endTime="2AM"] Discount end time from shop settings
 * @param {Boolean} [hasDealItem=false] Whether cart contains any deal item
 * @returns {Object} Object with isDiscountActive and discountAmount
 */
export default function checkTimeBasedDiscount(
  itemTotal,
  timeZone = "Asia/Karachi",
  discountPercentage = 10,
  startTime = "8PM",
  endTime = "2AM",
  hasDealItem = false
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
  

  const isDiscountInTimeWindow = startHour < endHour
    ? currentHour >= startHour && currentHour < endHour
    : currentHour >= startHour || currentHour < endHour;

  const isDiscountActive = !hasDealItem && isDiscountInTimeWindow;


  const discountAmount = isDiscountActive ? Math.ceil(itemTotal * (safeDiscountPercentage / 100)) : 0;
  
  return {
    isDiscountActive,
    discountAmount,
    discountPercentage: isDiscountActive ? safeDiscountPercentage : 0
  };
}
