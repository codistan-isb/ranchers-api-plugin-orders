import addOrderFulfillmentGroup from "./addOrderFulfillmentGroup.js";
import cancelOrderItem from "./cancelOrderItem.js";
import createRefund from "./createRefund.js";
import moveOrderItems from "./moveOrderItems.js";
import placeOrder from "./placeOrder.js";
import favoriteOrder from "./favoriteOrder.js";
import removeFavoriteOrder from "./removeFavoriteOrder.js";
import splitOrderItem from "./splitOrderItem.js";
import updateOrder from "./updateOrder.js";
import updateOrderFulfillmentGroup from "./updateOrderFulfillmentGroup.js";
import updateOrderTime from "./updateOrderTime.js";
import cancelCustomerOrder from "./cancelCustomerOrder.js";
import updateReviewsRatings from "./updateReviewsRatings.js";
import testNewOrderEvent from "./testNewOrderEvent.js";
export default {
  addOrderFulfillmentGroup,
  cancelOrderItem,
  createRefund,
  moveOrderItems,
  placeOrder,
  favoriteOrder,
  removeFavoriteOrder,
  splitOrderItem,
  updateOrder,
  updateOrderFulfillmentGroup,
  updateOrderTime,
  cancelCustomerOrder,
  updateReviewsRatings,
  testNewOrderEvent,
  async convertOrderToCash(parent, args, context) {
    return context.mutations.convertOrderToCash(context, args.input);
  }
};
