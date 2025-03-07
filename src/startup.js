import sendOrderEmail from "./util/sendOrderEmail.js";
import createNotification from "./util/createNotification.js";
import getProductbyId from "./util/getProductbyId.js";
import generateKitchenOrderID from "./util/generateKitchenOrderID.js";
import deliveryTimeCalculation from "./util/deliveryTimeCalculation.js";
import cors from "cors";
import bodyParser from "body-parser";
import morgan from "morgan";
import cron from 'node-cron';
import nodemailer from "nodemailer";
import fs from "fs";
import { decodeCartOpaqueId } from "./xforms/id.js";
import decodeOpaqueId from "@reactioncommerce/api-utils/decodeOpaqueId.js";
const transporter = nodemailer.createTransport({
  host: process.env.BREVOHOST,
  port: 587,
  secure: false,
  auth: {
    user: process.env.BREVOUSER,
    pass: process.env.BREVOPASS
  }
}
);

/**
 * @summary Called on startup
 * @param {Object} context Startup context
 * @param {Object} context.collections Map of MongoDB collections
 * @returns {undefined}
 */
export default async function ordersStartup(context) {
  const { app, appEvents } = context;
  let { collections, redis } = context;
  const { Orders, Catalog } = collections;
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
    })
  }
  const catalogs = await Catalog.find({}).toArray()
  for (let i = 0; i < catalogs.length; i++) {
    console.log("catalogs[0] ", catalogs[0])
    console.log("redis.set(catalogs[0]?.product?._id, catalogs[0]?.product, , 604800) ,", redis.set(catalogs[i]?.product?._id, catalogs[i]?.product, "EX", 604800))
    await redis.set(catalogs[i]?.product?._id, JSON.stringify(catalogs[i]?.product), "EX", 604800);
  }
  console.log(decodeOpaqueId("cmVhY3Rpb24vdGFnOlF4SmVmTUEzdmlHbnF1azZZ"))
  console.log(decodeOpaqueId("cmVhY3Rpb24vdGFnOmFKOVQ2dFBIekU2aHNwZDA1OQ=="))
  console.log("in api ", decodeOpaqueId("cmVhY3Rpb24vdGFnOmFKOVQ2dFBIekU2aHNwZDA2MA=="))
  function convertJsonToCsv(items, fields) {
    const hdr = fields

    const hadrString = hdr.join(",");

    // nned to handle null or undefined values here..
    const replacer = (key, val) => val ?? '';

    const rowItems = items.map((row) =>
      hdr.map((fieldNameVal) => JSON.stringify(row[fieldNameVal], replacer))
        .join(",")
    );

    // join hdr and body, and break into separate lines ..
    const csvFile = [hadrString, ...rowItems].join('\r\n');

    return csvFile;
  }
  console.log("America/New_York ",)
  if (process.env.ENVIRONMENT == "production") {

    cron.schedule('0 22 * * *', async () => {
      // cron.schedule('*/60 * * * * *', async () => {
      try {
        console.log("process.env.ENVIRONMENT", process.env.ENVIRONMENT)
        console.log("running pipeline")
        // Get the current time and calculate the time 24 hours ago
        const now = new Date();
        console.log("now ", now)
        const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        console.log("last24Hours ", last24Hours)
        const aggregationPipeline = [
          {
              $match: {
                  createdAt: {
                      $gte: last24Hours,
                      $lte: now
                  },
              }
          },
          {
              $addFields: {
                  branchID: {
                      $toObjectId: "$branchID"
                  }
              }
          },
          {
              $lookup: {
                  from: "BranchData",
                  localField: "branchID",
                  foreignField: "_id",
                  as: "branchData"
              }
          },
          {
              $addFields: {
                  branchInfo: {
                      $arrayElemAt: ["$branchData", 0]
                  }
              }
          },
          {
              $addFields: {
                  branchName: "$branchInfo.name",
                  branchAddress: "$branchInfo.address"
              }
          },
          {
              $addFields: {
                  amount: {
                      $arrayElemAt: ["$payments.totalAmount", 0]
                  },
                  tax: {
                      $arrayElemAt: ["$payments.tax", 0]
                  },
                  finalAmount: {
                      $arrayElemAt: ["$payments.finalAmount", 0]
                  },
                  status: "$workflow.status",
                  contactNumber: {
                      $arrayElemAt: [
                          "$payments.address.phone",
                          0
                      ]
                  },
                  phonenumber: {
                      $arrayElemAt: [
                          "$shipping.address.phone",
                          0
                      ]
                  },
                  deliveryAddress: {
                      $arrayElemAt: [
                          "$shipping.address.address1",
                          0
                      ]
                  },
                  productName: {
                      $arrayElemAt: ["$shipping.items.title", 0]
                  },
              }
          },
          {
              $addFields: {
                  currencyCode: {
                      $cond: {
                          if: {
                              $eq: ["$currencyCode", "USD"]
                          },
                          then: "PKR",
                          else: "$currencyCode"
                      }
                  }
              }
          },
          {
              $sort: {
                  createdAt: -1
              }
          },
          {
              $addFields: {
                  orderTime: {
                      $add: ["$createdAt", 5 * 60 * 60000]
                  }
              }
          },
          {
              $project: {
                  orderTime: 1,
                  contactNumber: 1,
                  email: 1,
                  phonenumber: 1,
                  deliveryAddress: 1,
                  paymentMethod: 1,
                  placedFrom: 1,
                  branchName: 1,
                  branchAddress: 1,
                  tax: 1,
                  amount: 1,
                  finalAmount: 1,
                  currencyCode: 1,
                  rejectionReason: 1,
                  status: 1,
                  productName: -1,
                  items: "$shipping.items"
              }
          }
      ]

      const NewOrdersTemplate = await Orders.aggregate(aggregationPipeline).toArray();
      console.log("NewOrdersTemplate:", NewOrdersTemplate);
      const dealNames = ["Tamasha Champions Deal", "Hunger Buster", "Happiness Squared Deal", "Any 2 Deal", "Two For You"];

      const formattedOrders = NewOrdersTemplate.map(order => {
          const items = order.items?.[0] || []; // Extracting items array from nested array

          let formattedProductNames = [];
          let formattedDealNames = [];

          items.forEach(item => {
              const formattedItem = `${item.title} x ${item.quantity}`;
              const normalizedTitle = item.title.trim(); // Trim spaces

              console.log("Checking:", `"${normalizedTitle}"`, "against dealNames:", dealNames);
              console.log("Match:", dealNames.includes(normalizedTitle));

              if (dealNames.includes(normalizedTitle)) {
                  formattedDealNames.push(formattedItem);
              } else {
                  formattedProductNames.push(formattedItem);
              }
          });

          return {
              ...order,
              productName: formattedProductNames.join(', '),
              dealName: formattedDealNames.join(', ')
          };
      });


      console.log("Formatted Orders:", formattedOrders);
      const fields = [
          '_id', 'orderTime', 'contactNumber', 'phonenumber', 'email', 'deliveryAddress', 'paymentMethod', 'placedFrom', 'branchName', 'branchAddress', 'amount', 'tax', 'finalAmount', 'productName', 'dealName'
      ];
      const canceledOrderFields = [
          '_id', 'orderTime', 'contactNumber', 'phonenumber', 'email', 'deliveryAddress', 'paymentMethod', 'placedFrom', 'rejectionReason', 'branchName', 'branchAddress', 'amount', 'tax', 'finalAmount', 'productName', 'dealName'
      ];
      const opts = { fields };
      // Filter orders for web and app
      const webOrders = formattedOrders.filter(order => order.placedFrom === 'web');
      const appOrders = formattedOrders.filter(order => order.placedFrom === 'app');
      const canceledOrders = formattedOrders.filter(order => order.status === 'canceled');

      // Convert to CSV
      const todayOrdersCsv = convertJsonToCsv(formattedOrders, fields);
      const webOrdersCsv = convertJsonToCsv(webOrders, fields);
      const appOrdersCsv = convertJsonToCsv(appOrders, fields);
      const canceledOrdersCsv = convertJsonToCsv(canceledOrders, canceledOrderFields);

      // Save CSV to files
      fs.writeFileSync('./todayOrders.csv', todayOrdersCsv);
      fs.writeFileSync('./webOrders.csv', webOrdersCsv);
      fs.writeFileSync('./appOrders.csv', appOrdersCsv);
      fs.writeFileSync('./canceledOrders.csv', canceledOrdersCsv);
      //console.log("csv ", csv)
      // console.log(csv);
      // Save CSV to a file
      const filePath = './todayOrders.csv';
      fs.writeFileSync(filePath, todayOrdersCsv);
      const webFilePath = './todayWebOrders.csv';
      fs.writeFileSync(webFilePath, webOrdersCsv);
      const appFilePath = './todayAppOrders.csv';
      fs.writeFileSync(appFilePath, appOrdersCsv);
      const canceledFilePath = './canceledOrders.csv';
      fs.writeFileSync(canceledFilePath, canceledOrdersCsv);
        const email = {
          from: "muhammad.usama@ranchercafe.com",
          to: [
            // "haris.ghumman46@gmail.com",
            // "aliasadwarraich29@gmail.com",
            // "stasawfi787@gmail.com",
            "harisbakhabarpk@gmail.com",
            // "mwaseemkha@gmail.com",
            // "nadirw70@gmail.com",
            // "hamzakiani666k@gmail.com",
            // "ZoahibKahlid575@gmail.com"
          ].join(","),
          subject: "Daily Orders Report",
          text: "This is the daily orders report",
          attachments: [
            {
              filename: 'todayOrders.csv',
              content: fs.createReadStream('./todayOrders.csv')
            },
            {
              filename: 'todayWebOrders.csv',
              content: fs.createReadStream('./todayWebOrders.csv')
            },
            {
              filename: 'todayAppOrders.csv',
              content: fs.createReadStream('./todayAppOrders.csv')
            },
            {
              filename: 'canceledOrders.csv',
              content: fs.createReadStream('./canceledOrders.csv')
            }
          ]
        };
        console.log("email ", email)
        const info = await transporter.sendMail(email);
        console.log('info:', info);

      } catch (err) {
        console.log("err ", err)
      }
    });
  }
  


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
