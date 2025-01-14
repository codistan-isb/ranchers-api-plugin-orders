import Random from "@reactioncommerce/random";
import buildOrderItem from "./buildOrderItem.js";
import updateGroupTotals from "./updateGroupTotals.js";

/**
 * @summary Builds an order fulfillment group from fulfillment group input.
 * @param {Object} context an object containing the per-request state
 * @param {String} [accountId] ID of account placing the order
 * @param {Object[]} [additionalItems] Additional already-created order items to push into the group
 *   items array before calculating shipping, tax, surcharges, and totals.
 * @param {Object} [billingAddress] The primary billing address for the order, if known
 * @param {String|null} [cartId] ID of the cart from which the order is being placed, if applicable
 * @param {String} currencyCode Currency code for all money values
 * @param {Number} discountTotal Calculated discount total
 * @param {Object} inputGroup Order fulfillment group input. See schema.
 * @param {String} orderId ID of existing or new order to which this group will belong
 * @param {Object} cart - the cart this order is being created from
 * @returns {Promise<Object>} The fulfillment group
 */
export default async function buildOrderFulfillmentGroupFromInput(
  context,
  {
    accountId,
    additionalItems,
    billingAddress,
    cartId,
    currencyCode,
    discountTotal,
    inputGroup,
    orderId,
    cart,
  }
) {
  const {
    data,
    items,
    selectedFulfillmentMethodId,
    shopId,
    totalPrice: expectedGroupTotal,
    type,
  } = inputGroup;
  console.log("items in buildOrderFulfillmentGroupFromInput ",items)

  const group = {
    _id: Random.id(),
    address: data ? data.shippingAddress : null,
    shopId,
    type,
    workflow: { status: "new", workflow: ["new"] },
  };
  console.log("group in start of buildOrder ",group)
  console.log("additionalItems ",additionalItems)

  // Build the final order item objects. As part of this, we look up the variant in the system and make sure that
  // the price is what the caller expects it to be.
  if (items) {
    group.items = await Promise.all(
      items.map((inputItem) =>
        buildOrderItem(context, { currencyCode, inputItem, cart })
      )
    );
    console.log("group in after group.items = await Promise.all ",group)

  } else {
    group.items = [];
  }
  console.log("group in after if (items) { ",group)

  if (Array.isArray(additionalItems) && additionalItems.length) {
    group.items.push(...additionalItems);
  }
  console.log("group after array.isArray ",group)

  // Add some more properties for convenience
  group.itemIds = group.items.map((item) => item._id);
  console.log("group in after group.itemIds ",group)
  group.totalItemQuantity = group.items.reduce(
    (sum, item) => sum + item.quantity,
    0
  );
  console.log("group in after group.totalItemQuantity ",group)

  const { groupSurcharges, groupSurchargeTotal, taxableAmount, taxTotal } =
    await updateGroupTotals(context, {
      accountId,
      billingAddress,
      cartId,
      currencyCode,
      discountTotal,
      expectedGroupTotal,
      group,
      orderId,
      selectedFulfillmentMethodId,
    });
    console.log("group in buildOrder ",group)

  return {
    group,
    groupSurcharges,
    groupSurchargeTotal,
    taxableAmount,
    taxTotal,
  };
}
