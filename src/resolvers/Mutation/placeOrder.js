import generateKitchenOrderID from "../../util/generateKitchenOrderID.js";
import {
  decodeCartOpaqueId,
  decodeFulfillmentMethodOpaqueId,
  decodeOrderItemsOpaqueIds,
  decodeShopOpaqueId,
} from "../../xforms/id.js";

/**
 * @name Mutation/placeOrder
 * @method
 * @memberof Payments/GraphQL
 * @summary resolver for the placeOrder GraphQL mutation
 * @param {Object} parentResult - unused
 * @param {Object} args.input - an object of all mutation arguments that were sent by the client
 * @param {Object} args.input.order - The order input
 * @param {Object[]} args.input.payments - Payment info
 * @param {String} [args.input.clientMutationId] - An optional string identifying the mutation call
 * @param {Object} context - an object containing the per-request state
 * @returns {Promise<Object>} PlaceOrderPayload
 */
export default async function placeOrder(parentResult, { input }, context) {
  const today = new Date().toISOString().substr(0, 10);
  const {
    clientMutationId = null,
    order,
    payments,
    branchID,
    notes,
    Latitude,
    Longitude,
    placedFrom,
    isGuestUser = false,
    guestToken = null,
    jazzCashNumber,
    CNIC
  } = input;

  console.log("INPUT INSIDE RESOLVER", input);
  const {
    cartId: opaqueCartId,
    fulfillmentGroups,
    shopId: opaqueShopId,
  } = order;
  const cartId = opaqueCartId ? decodeCartOpaqueId(opaqueCartId) : null;
  const shopId = decodeShopOpaqueId(opaqueShopId);

  console.log("PAYMENTS INSIDE RESOLVER", payments);

  const transformedFulfillmentGroups = fulfillmentGroups.map((group) => ({
    ...group,
    paymentMethod: group?.paymentMethod || "CASH",
    items: decodeOrderItemsOpaqueIds(group.items),
    selectedFulfillmentMethodId: decodeFulfillmentMethodOpaqueId(
      group.selectedFulfillmentMethodId
    ),
    shopId: decodeShopOpaqueId(group.shopId),
  }));
  console.log("transformedFulfillmentGroups", transformedFulfillmentGroups);
  const { orders, token } = await context.mutations.placeOrder(context, {
    order: {
      ...order,
      cartId,
      fulfillmentGroups: transformedFulfillmentGroups,
      shopId,
      notes,
    },
    payments,
    branchID,
    placedFrom,
    notes,
    Latitude,
    Longitude,
    isGuestUser,
    guestToken,
    jazzCashNumber,
    CNIC
  });
  console.log("Order Placed ", orders);
  console.log("Order Placed ", orders[0].payments);
  // console.log("Order Placed payments ", orders[0].payments);
  return {
    clientMutationId,
    orders,
    token,
    notes,
  };
}
