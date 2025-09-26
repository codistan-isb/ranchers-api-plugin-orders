import pkg from "../package.json";
import i18n from "./i18n/index.js";
import cors from "cors";
import bodyParser from "body-parser";
import morgan from "morgan";
import mutations from "./mutations/index.js";
import policies from "./policies.json";
import preStartup from "./preStartup.js";
import queries from "./queries/index.js";
import resolvers from "./resolvers/index.js";
import schemas from "./schemas/index.js";
import { Order, OrderFulfillmentGroup, OrderItem } from "./simpleSchemas.js";
import startup from "./startup.js";
import getDataForOrderEmail from "./util/getDataForOrderEmail.js";

/**
 * @summary Import and call this function to add this plugin to your API.
 * @param {ReactionAPI} app The ReactionAPI instance
 * @returns {undefined}
 */


function IPNPayment(context) {
  const { app } = context;

  if (app.expressApp) {
    app.expressApp.use(cors());
    app.expressApp.use(bodyParser.json());
    app.expressApp.use(bodyParser.urlencoded({ extended: true }));
    app.expressApp.use(morgan("dev"));

    app.expressApp.post("/jazzcash/ipn", async (req, res) => {
      try {
        console.log("Collections available:", Object.keys(context.collections));

        const { collections } = context;
        const { Transaction } = collections;
        const payload = req.body;

        let transactionDetails = await Transaction.findOne({ transactionId: payload.pp_TxnRefNo });

        console.log("Transaction Details:", transactionDetails);

        console.log("Payload received from JazzCash:", payload);
        console.log("IPN Received: SECURE HASH ", payload.pp_SecureHash);

        if (payload.pp_ResponseCode === "121") {
          console.log("Payment success. Mark order as PAID.");
          await Transaction.updateOne(
            { transactionId: payload.pp_TxnRefNo },
            {
              $set: {
                statusCode: payload.pp_ResponseCode,
                paymentResMsg: payload.pp_ResponseMessage,
              },
            }
          );
          console.log("Transaction record updated with JazzCash response.");
        } else {
          console.log("Payment failed or cancelled.");
        }

        // Send IPN response back to JazzCash
        return res.status(200).json({
          transactionDetails,
          pp_ResponseCode: payload.pp_ResponseCode,
          pp_ResponseMessage: payload.pp_ResponseMessage,
        });
      } catch (error) {
        console.error("Error processing JazzCash IPN:", error);
        return res.status(500).json({
          transactionDetails,
          pp_ResponseCode: payload.pp_ResponseCode,
          pp_ResponseMessage: payload.pp_ResponseMessage,
        });
      }
    });
  }
}
export default async function register(app) {

  await app.registerPlugin({
    label: "Orders",
    name: "orders",
    version: pkg.version,
    i18n,
    collections: {
      Orders: {
        name: "Orders",
        indexes: [
          // Create indexes. We set specific names for backwards compatibility
          // with indexes created by the aldeed:schema-index Meteor package.
          [{ accountId: 1, shopId: 1 }],
          [{ createdAt: -1 }, { name: "c2_createdAt" }],
          [{ email: 1 }, { name: "c2_email" }],
          [{ referenceId: 1 }, { unique: true }],
          [{ shopId: 1 }, { name: "c2_shopId" }],
          [{ "shipping.items.productId": 1 }],
          [{ "shipping.items.variantId": 1 }],
          [{ "payments.address.fullName": 1 }],
          [{ "shipping.address.fullName": 1 }],
          [{ "payments.address.phone": 1 }],
          [{ "workflow.status": 1 }, { name: "c2_workflow.status" }],
        ],
      },
      CartHistory: {
        name: "CartHistory",
        updatedAt: { type: Date, default: Date.now },
        createdAt: { type: Date, default: Date.now },
      },
      WhatsAppMessage: {
        name: "WhatsAppMessage",
        updatedAt: { type: Date, default: Date.now },
        createdAt: { type: Date, default: Date.now },
      },
      Transaction: {
        name: "Transaction",
        updatedAt: { type: Date, default: Date.now },
        createdAt: { type: Date, default: Date.now },
      },
      FavoriteOrder: {
        name: "FavoriteOrder",
        updatedAt: { type: Date, default: Date.now },
        createdAt: { type: Date, default: Date.now },
      },

    },
    functionsByType: {
      getDataForOrderEmail: [getDataForOrderEmail],
      preStartup: [preStartup, IPNPayment],
      startup: [startup],
    },
    graphQL: {
      resolvers,
      schemas,
    },
    mutations,
    queries,
    policies,
    simpleSchemas: {
      Order,
      OrderFulfillmentGroup,
      OrderItem,
    },
  });
}
