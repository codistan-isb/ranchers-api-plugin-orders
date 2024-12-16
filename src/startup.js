import sendOrderEmail from "./util/sendOrderEmail.js";
import createNotification from "./util/createNotification.js";
import getProductbyId from "./util/getProductbyId.js";
import generateKitchenOrderID from "./util/generateKitchenOrderID.js";
import deliveryTimeCalculation from "./util/deliveryTimeCalculation.js";
import cors from "cors";
import bodyParser from "body-parser";
import morgan from "morgan";

/**
 * @summary Called on startup
 * @param {Object} context Startup context
 * @param {Object} context.collections Map of MongoDB collections
 * @returns {undefined}
 */
export default function ordersStartup(context) {
  const { app, appEvents } = context;
  if (app.expressApp) {

    //add other middleware
    app.expressApp.use(cors());
    app.expressApp.use(bodyParser.json());
    app.expressApp.use(bodyParser.urlencoded({ extended: true }));
    app.expressApp.use(morgan("dev"));
    app.expressApp.get("/ipn", async (req, res) => {

      try {
        const ipnData = req.body;

        // Log the incoming IPN data for debugging
        console.log('Received IPN:', ipnData);

      
        // Respond with a 200 OK to acknowledge receipt
        res.status(200).send('IPN received successfully');
    } catch (error) {
        console.error('Error processing IPN:', error.message);
        res.status(500).send('Server error');
    }
    })}


  appEvents.on(
    "afterOrderCreate",
    async ({
      order,
      createdBy,
      orderId,
      branchID,
      branchData,
      fulfillmentGroups,
      generatedID,
    }) => {
      let { collections } = context;
      const { Orders } = collections;
      // const today = new Date().toISOString().substr(0, 10);
      let deliveryTime = 0.0;
      // let query = {
      //   todayDate: { $eq: today },
      //   branchID: { $eq: branchID },
      //   kitchenOrderID: { $exists: true },
      // };
      // // console.log("order afterOrderCreate", order);
      // // console.log("createdBy afterOrderCreate", createdBy);
      // let generatedID = await generateKitchenOrderID(query, Orders, branchID);
      // let kitchenOrderID = generatedID;

      console.log("generatedID in app event", generatedID);
      if (branchData) {
        let deliveryTimeCalculationResponse = await deliveryTimeCalculation(
          branchData,
          fulfillmentGroups[0].data.shippingAddress
        );
        if (deliveryTimeCalculationResponse) {
          deliveryTime = Math.ceil(deliveryTimeCalculationResponse / 60);
        }
      }
      let orderData = {
        // kitchenOrderID,
        deliveryTime,
        updatedAt: new Date(),
      };
      // order.kitchenOrderID = kitchenOrderID;
      order.deliveryTime = deliveryTime;

      // console.log("Order for email ", order);
      // console.log("orderData", orderData);
      // console.log("Order for email Payment ", order.payments);

      await Orders.updateOne({ _id: orderId }, { $set: orderData });
      let productPurchased = await getProductbyId(context, {
        productId: order?.shipping[0]?.items[0]?.variantId,
      });
      let message = "Your order has been placed";
      let appType = "customer";
      let id = createdBy;
      let orderID = orderId;
      let userId = createdBy;
      // console.log("id", id);
      // console.log("orderID", orderID);
      context.mutations.oneSignalCreateNotification(context, {
        message,
        id,
        appType,
        userId,
        orderID,
      });
      const message1 = "New Order is placed";
      const appType1 = "admin";
      const id1 = userId;
      context.mutations.oneSignalCreateNotification(context, {
        message: message1,
        id: id1,
        appType: appType1,
        userId: userId,
      });
      sendOrderEmail(context, order, "new");
      createNotification(context, {
        details: null,
        from: createdBy,
        hasDetails: false,
        message: `You have a new order of ${productPurchased.title}`,
        status: "unread",
        to: productPurchased?.uploadedBy?.userId,
        type: "newOrder",
        url: `/en/profile/address?activeProfile=seller`,
      });
      await context.mutations.sendWhatsAppMessage(context, {
        createdBy,
        generatedID,
        OrderStatus: "placed",
      });
      // let sendMessage = await whatsAppMessage(context,createdBy,generatedID);
    }
  );
  // appEvents.on("afterOrderCreate", ({ order }) => sendOrderEmail(context, order, "new"));
  appEvents.on("afterOrderUpdate", async ({ order, updatedBy, status }) => {
    // console.log("order afterOrderUpdate ", order);

    // console.log("updatedBy afterOrderUpdate", updatedBy);
    const message = `Your order is ${status}`;
    const appTypecustomer = "customer";
    const Customerid = order?.accountId;
    const CustomeruserId = order?.accountId;
    const CustomerOrderID = order?.kitchenOrderID;
    context.mutations.oneSignalCreateNotification(context, {
      message,
      id: Customerid,
      appType: appTypecustomer,
      userId: CustomeruserId,
      orderID: CustomerOrderID,
    });
    sendOrderEmail(context, order, "confirmed");
    console.log("here in order", order);
    await context.mutations.sendWhatsAppMessage(context, {
      createdBy: order?.accountId,
      generatedID: order?.kitchenOrderID,
      OrderStatus: status,
    });
  });
}
