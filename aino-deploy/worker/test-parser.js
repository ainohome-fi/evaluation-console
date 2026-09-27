import { parseAliExpressProductResponse } from './aliexpress-response-parser.js';

const sample = {
  itemId: '1005008861976362',
  title: 'Test product',
  skuProperties: [
    { skuPropertyId: '14', skuPropertyName: 'Color', values: [
      { propertyValueId: '10', propertyValueName: 'Red Tail Ball' }
    ] },
    { skuPropertyId: '5', skuPropertyName: 'Version', values: [
      { propertyValueId: '100014066', propertyValueName: '2026 Version' }
    ] }
  ],
  skuPaths: [
    { path: '14:10#Red Tail Ball;5:100014066#2026 Version', skuId: '12000046992762882', skuStock: 161 }
  ],
  skuPriceInfoMap: {
    '12000046992762882': {
      salePriceLocal: '€5.38',
      salePriceString: '€5.38'
    }
  },
  SHIPPING: {
    bizData: [{
      shipFrom: 'China',
      displayAmount: 2.99,
      shippingFee: 'charge',
      deliveryDayMin: 18,
      deliveryDayMax: 18,
      deliveryProviderName: 'AliExpress Selection Standard Shipping'
    }]
  },
  PRICE_EXTEND: {
    tax: {
      content: 'Price includes VAT | Import charges will apply',
      explanationInfo: {
        text: 'VAT, duty and clearance fees may vary based on the destination customs regulations.'
      }
    }
  }
};

const result = parseAliExpressProductResponse(JSON.stringify(sample), {
  productId: '1005008861976362',
  currency: 'EUR'
});

if (!result.ok) throw new Error(result.error);

const v = result.product.variants[0];
if (v.skuId !== '12000046992762882') throw new Error('SKU ID mapping failed');
if (v.stock !== 161) throw new Error('SKU stock mapping failed');
if (v.prices[0]?.amount !== 5.38) throw new Error('SKU price mapping failed');
if (result.product.shipping.shipFromCountry !== 'China') throw new Error('ship-from mapping failed');
if (result.product.shipping.fee?.amount !== 2.99) throw new Error('shipping cost mapping failed');
if (!result.product.trade.vat) throw new Error('VAT mapping failed');

console.log('Aino AliExpress response parser test: PASS');
console.log(JSON.stringify({
  sku: v.skuId,
  attributes: v.attributes,
  stock: v.stock,
  price: v.prices[0],
  shipFrom: result.product.shipping.shipFromCountry,
  shipping: result.product.shipping.fee,
  vat: result.product.trade.vat,
}, null, 2));
