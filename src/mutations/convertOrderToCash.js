import SimpleSchema from "simpl-schema";
import ReactionError from "@reactioncommerce/reaction-error";
import decodeOpaqueId from "@reactioncommerce/api-utils/decodeOpaqueId.js";
import pkg from "mongodb";
const { ObjectId } = pkg;
import { Order as OrderSchema } from "../simpleSchemas.js";
import pubSub from "../util/pubSubIntance.js";
import formatPublicOrderResponse from "../util/formatPublicOrderResponse.js";

const inputSchema = new SimpleSchema({
    orderId: String,
    clientMutationId: {
        type: String,
        optional: true,
    },
});

/**
 * @method convertOrderToCash
 * @summary Converts an existing order to cash payment and recalculates tax based on branch cash tax rate
 * @param {Object} context - an object containing the per-request state
 * @param {Object} input - Input with orderId
 * @returns {Promise<Object>} Object with updated order
 */
export default async function convertOrderToCash(context, input) {
    inputSchema.validate(input);

    const { orderId, clientMutationId } = input;
    const { collections, userId } = context;
    const { Orders, BranchData, TaxRate } = collections;
    // Accept opaque IDs (Relay-style) or raw IDs; fall back to raw if decode fails
    let decodedId;
    try {
        decodedId = decodeOpaqueId(orderId);
    } catch (e) {
        decodedId = null;
    }
    const lookupId = decodedId?.id || orderId;
    // Find the order
    const order = await Orders.findOne({ _id: lookupId });
    if (!order) {
        throw new ReactionError("not-found", "Order not found");
    }

    // Check if payment status is pending
    const paymentStatus = (order.paymentStatus || order.payments?.[0]?.status || "").toString().toUpperCase();
    if (paymentStatus === "PENDING") {
        throw new ReactionError("invalid-param", "Cannot convert order with pending payment status");
    }

    // Check if order is already cash payment
    const currentPaymentMethod = (order.paymentMethod || order.payments?.[0]?.method || "").toString().toUpperCase();
    if (currentPaymentMethod === "CASH" || currentPaymentMethod === "COD") {
        throw new ReactionError("invalid-param", "Order is already a cash payment");
    }

    // Validate permissions
    //   await context.validatePermissions(
    //     `reaction:legacy:orders:${order._id}`,
    //     "update",
    //     { shopId: order.shopId }
    //   );

    // Get branch data to retrieve tax ID
    const branchData = await BranchData.findOne({
        _id: new ObjectId(order.branchID),
    });

    if (!branchData || !branchData.taxID) {
        throw new ReactionError("not-found", "Branch or tax configuration not found");
    }

    // Get tax data for cash payment
    const taxData = await TaxRate.findOne({ _id: new ObjectId(branchData.taxID) });
    if (!taxData || !taxData.Cash) {
        throw new ReactionError("not-found", "Cash tax rate not found");
    }

    const cashTaxPercentage = taxData.Cash;

    // Get the first payment and shipping group
    const firstPayment = order.payments?.[0] || {};
    const firstShipping = order.shipping?.[0] || {};
    const invoice = firstShipping.invoice || {};

    // Calculate new tax based on cash percentage
    const totalAmount = Number(firstPayment.totalAmount || invoice.subtotal || 0);
    const newTax = Math.round(totalAmount * (cashTaxPercentage / 100));

    // Calculate new final amount
    const shippingCharges = Number(invoice.shipping || 0);
    let newFinalAmount = totalAmount + newTax + shippingCharges;

    // Prepare update modifier
    const modifier = {
        $set: {
            paymentMethod: "CASH",
            updatedAt: new Date(),
            isConvertedToCash: true,
            updatedBy: userId || "user",
            "payments.0.method": "CASH",
            "payments.0.tax": newTax,
            "payments.0.finalAmount": newFinalAmount,
        },
        $push: {
            "workflow.workflow": "converted to cash",
        },
    };

    // Update invoice if it exists
    if (firstShipping.invoice) {
        modifier.$set["shipping.0.invoice.taxes"] = newTax;
        modifier.$set["shipping.0.invoice.total"] = newFinalAmount;
    }

    // Perform the update
    OrderSchema.validate(modifier, { modifier: true });
    try {
       await Orders.findOneAndUpdate(
            { _id: lookupId },
            modifier,
              { new: true }
        );
        const updatedOrder = await Orders.findOne({ _id: lookupId });
        const bId = updatedOrder?.branchID;
 if (bId) {
              console.log("Publishing to branch-specific channel:", `ORDER_PAYMENT_STATUS_UPDATED_${bId}`);

              pubSub.publish(`ORDER_PAYMENT_STATUS_UPDATED_${bId}`, {
                orderPaymentStatusUpdated: {
                  orderId: lookupId,
                  paymentStatus:"FAILED",
                  updatedAt: new Date(),
                  isPaid: false,
                  paymentMethod: "CASH",
                  payments: updatedOrder?.payments?.map(({ address, ...payment }) => ({
                    ...payment,
                    billingAddress: address
                  }))
                }
              });
            }
        return {
            clientMutationId,
            order: formatPublicOrderResponse(updatedOrder),
            status: updatedOrder?true:false
        };
    } catch (error) {
        throw new ReactionError("server-error", `Failed to update order: ${error.message}`);
    }
}
