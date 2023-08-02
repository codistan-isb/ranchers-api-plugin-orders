import SimpleSchema from "simpl-schema";

const inputSchema = new SimpleSchema({
  action: {
    type: String,
    optional: true,
  },
  fromShop: {
    type: Object,
    blackbox: true,
  },
  to: {
    type: String,
  },
  language: {
    type: String,
    optional: true,
  },
  dataForEmail: {
    type: Object,
    blackbox: true,
  },
});

/**
 * @name sendOrderEmail
 * @summary A mutation that compiles and server-side renders the email template with order data, and sends the email
 * @param {Object} context GraphQL context
 * @param {Object} input Data for email: action, dataForEmail, fromShop, to
 * @returns {Undefined} no return
 */
export default async function sendOrderEmail(context, input) {
  inputSchema.validate(input);
  // console.log(input)
  const { action, dataForEmail, fromShop, language, to } = input;
  console.log("2", action);
  console.log(
    "dataForEmail.order.workflow.status",
    dataForEmail.order.workflow.status
  );
  // Compile email
  let templateName;

  if (action === "shipped") {
    templateName = "orders/shipped";
  }
  if (action === "refunded") {
    templateName = "orders/refunded";
  }
  if (action === "itemRefund") {
    templateName = "orders/itemRefund";
  }
  if (action === "confirmed") {
    templateName = "orders/confirmed";
  } else if (action === "new") {
    templateName = "orders/new";
  } else {
    templateName = `orders/${dataForEmail.order.workflow.status}`;
  }
  // console.log(templateName);

  await context.mutations.sendEmail(context, {
    data: dataForEmail,
    fromShop,
    templateName,
    language,
    to,
  });
}
