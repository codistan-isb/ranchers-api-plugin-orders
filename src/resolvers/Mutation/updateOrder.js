import sendOrderEmail from "../../util/sendOrderEmail.js";
import { decodeOrderOpaqueId } from "../../xforms/id.js";

/**
 * @name Mutation/updateOrder
 * @method
 * @memberof Payments/GraphQL
 * @summary resolver for the updateOrder GraphQL mutation
 * @param {Object} parentResult - unused
 * @param {Object} args.input - an object of all mutation arguments that were sent by the client
 * @param {Object} [args.input.customFields] - Updated custom fields
 * @param {String} [args.input.email] - Set this as the order email
 * @param {String} args.input.orderId - The order ID
 * @param {String} [args.input.status] - Set this as the current order status
 * @param {String} [args.input.clientMutationId] - An optional string identifying the mutation call
 * @param {Object} context - an object containing the per-request state
 * @returns {Promise<Object>} UpdateOrderPayload
 */
export default async function updateOrder(parentResult, { input }, context) {
  const {
    clientMutationId = null,
    customFields,
    email,
    orderId,
    status
  } = input;
  const { order } = await context.mutations.updateOrder(context, {
    customFields,
    email,
    orderId: decodeOrderOpaqueId(orderId),
    status
  });
  if (status === 'confirmed') {
    // Send email to notify customer of a refund
    sendOrderEmail(context, order, "confirmed");
    await context.mutations.sendWhatsAppMessage(context, {
      
      createdBy: order?.accountId,
      generatedID: order?.kitchenOrderID,
      OrderStatus: "confirmed",
      order
    });
  }
  return {
    clientMutationId,
    order
  };
}
