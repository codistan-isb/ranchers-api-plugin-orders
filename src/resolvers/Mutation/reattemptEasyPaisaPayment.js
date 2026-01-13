/**
 * @name Mutation/reattemptEasyPaisaPayment
 * @method
 * @memberof Order/GraphQL
 * @summary Reattempts EasyPaisa payment for an existing order
 * @param {Object} _ - unused
 * @param {Object} args - The input arguments
 * @param {Object} args.input - mutation input
 * @param {String} args.input.orderId - The order ID
 * @param {String} args.input.shopId - The shop ID
 * @param {String} [args.input.clientMutationId] - An optional string identifying the mutation call
 * @param {Object} context - an object containing the per-request state
 * @returns {Promise<Object>} ReattemptEasyPaisaPaymentPayload
 */
export default async function reattemptEasyPaisaPayment(_, args, context) {
  const { input } = args;
  const { clientMutationId = null } = input;

  const result = await context.mutations.reattemptEasyPaisaPayment(context, input);

  return {
    clientMutationId,
    ...result
  };
}
