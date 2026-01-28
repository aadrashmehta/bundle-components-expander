// @ts-check

/*
Expands bundle products into individual cart line items.
Bundle configuration is stored as JSON in a product metafield.
*/

const NO_CHANGES = {
  operations: [],
};

export function cartTransformRun(input) {
  const operations = input.cart.lines.reduce((acc, cartLine) => {
    const expandOperation = optionallyBuildExpandOperation(
      cartLine,
      input.presentmentCurrencyRate
    );

    if (expandOperation) {
      acc.push({ lineExpand: expandOperation });
    }

    return acc;
  }, []);

  return operations.length > 0 ? { operations } : NO_CHANGES;
}

function optionallyBuildExpandOperation(cartLine, presentmentCurrencyRate) {
  const { id: cartLineId, merchandise } = cartLine;

  if (
    merchandise.__typename !== "ProductVariant" ||
    !merchandise.product ||
    !merchandise.product.bundledComponentData
  ) {
    return null;
  }

  let bundleData;
  try {
    bundleData = JSON.parse(
      merchandise.product.bundledComponentData.value
    );
  } catch (e) {
    return null;
  }

  if (!Array.isArray(bundleData) || bundleData.length === 0) {
    return null;
  }

  const expandedCartItems = bundleData.map((component) => ({
    merchandiseId: component.id,
    quantity: component.quantity || 1,
    price: {
      adjustment: {
        fixedPricePerUnit: {
          amount: (
            component.price * presentmentCurrencyRate
          ).toFixed(2),
        },
      },
    },
  }));

  if (expandedCartItems.length === 0) {
    return null;
  }

  return {
    cartLineId,
    expandedCartItems,
  };
}






// // @ts-check

// /**
//  * @typedef {import("../generated/api").CartTransformRunInput} CartTransformRunInput
//  * @typedef {import("../generated/api").CartTransformRunResult} CartTransformRunResult
//  */

// /**
//  * @type {CartTransformRunResult}
//  */
// const NO_CHANGES = {
//   operations: [],
// };

// /**
//  * @param {CartTransformRunInput} input
//  * @returns {CartTransformRunResult}
//  */
// export function cartTransformRun(input) {
//   return NO_CHANGES;
// };