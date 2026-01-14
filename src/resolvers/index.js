import getConnectionTypeResolvers from "@reactioncommerce/api-utils/graphql/getConnectionTypeResolvers.js";
import { encodeOrderFulfillmentGroupOpaqueId, encodeOrderItemOpaqueId } from "../xforms/id.js";
import Mutation from "./Mutation/index.js";
import Order from "./Order/index.js";
import OrderFulfillmentGroup from "./OrderFulfillmentGroup/index.js";
import OrderItem from "./OrderItem/index.js";
import Query from "./Query/index.js";
import Refund from "./Refund/index.js";
import pubSub from "../util/pubSubIntance.js";
// import { PubSub } from "graphql-subscriptions";
// const pubSub = new PubSub();
export default {
  AddOrderFulfillmentGroupPayload: {
    newFulfillmentGroupId: (node) => encodeOrderFulfillmentGroupOpaqueId(node.newFulfillmentGroupId)
  },
  Mutation,
  Order,
  OrderFulfillmentGroup,
  OrderFulfillmentGroupData: {
    __resolveType(obj) {
      return obj.gqlType;
    }
  },
  OrderItem,
  Query,
  Refund,
  OrderPaymentStatusUpdate: {
    orderId: (obj) => obj.orderId,
    paymentStatus: (obj) => obj.paymentStatus,
    updatedAt: (obj) => obj.updatedAt,
    isPaid: (obj) => obj.isPaid
  },
  Subscription: {
    newOrder: {
      subscribe: (_, { branchID }) => {
        // If branchID is provided, filter events for that branch
        if (branchID) {
          return {
            async *[Symbol.asyncIterator]() {
              const asyncIterator = pubSub.asyncIterator(["ORDER_CREATED"]);
              for await (const value of asyncIterator) {
                // Only yield this event if it matches the requested branchID
                if (value.newOrder && value.newOrder.branchID === branchID) {
                  yield value;
                }
              }
            }
          };
        }
        
        // If no branchID, return all order events
        return pubSub.asyncIterator(["ORDER_CREATED"]);
      },
    },
    orderPaymentStatusUpdated: {
      subscribe: (_, { orderId }) => {
        // Subscribe to payment status updates for the specific order
        const eventName = `ORDER_PAYMENT_STATUS_UPDATED_${orderId}`;
        return pubSub.asyncIterator([eventName]);
      },
    },
  },
  SplitOrderItemPayload: {
    newItemId: (node) => encodeOrderItemOpaqueId(node.newItemId)
  },
  ...getConnectionTypeResolvers("Order"),
  ...getConnectionTypeResolvers("OrdersByAccountId")
};
