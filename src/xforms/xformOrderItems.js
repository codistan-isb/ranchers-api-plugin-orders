/**
 * @param {Object} context - an object containing the per-request state
 * @param {Object[]} items Array of order fulfillment group items
 * @returns {Object[]} Same array with GraphQL-only props added
 */
export default async function xformOrderItems(context, items) {
  let { redis } = context;

  if (!items || items.length === 0) {
    return [];
  }

  // Fetch product info for all items concurrently
  const productInfoPromises = items.map(async (item) => {
    const productData = await redis.get(item.productId);
    return productData ? JSON.parse(productData) : null;
  });

  const productInfos = await Promise.all(productInfoPromises);

  // Transform order items
  const xformedItems = items.map((item, index) => {
    const productInfo = productInfos[index];
    return {
      ...item,
      productConfiguration: {
        productId: item.productId,
        productVariantId: item.variantId,
      },
      subtotal: {
        amount: item.subtotal,
        currencyCode: item.price.currencyCode,
      },
      isDeal: item.productTagIds.includes("QxJefMA3viGnquk6Y"),
      productImage: productInfo?.media?.[0]?.URLs?.large || null, // Set productImage safely
    };
  });

  // Apply transformation functions
  for (const mutateItems of context.getFunctionsOfType("xformOrderItems")) {
    await mutateItems(context, xformedItems); // eslint-disable-line no-await-in-loop
  }

  return xformedItems;
}

