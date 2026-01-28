# Bundle Expander - Complete Implementation Guide by Fayyaz Ahmed

## Table of Contents
1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Architecture](#architecture)
4. [Step 1: App Setup](#step-1-app-setup)
5. [Step 2: Metafield Configuration](#step-2-metafield-configuration)
6. [Step 3: Cart Transform Function](#step-3-cart-transform-function)
7. [Step 4: Setting Bundle Data](#step-4-setting-bundle-data)
8. [Step 5: Frontend Display (Liquid)](#step-5-frontend-display-liquid)
9. [Testing](#testing)
10. [Troubleshooting](#troubleshooting)

---

## Overview

The Bundle Expander is a Shopify Cart Transform Function that automatically expands bundled products into their individual components at checkout. When a customer adds a bundle product to their cart, the function replaces it with the individual products that make up the bundle, each with custom pricing.

### Key Features
- ✅ Automatic bundle expansion at checkout
- ✅ Custom pricing per component
- ✅ Quantity multipliers for components
- ✅ Beautiful frontend display showing bundle contents
- ✅ No manual cart manipulation required

### How It Works
1. Merchant creates a "bundle" product with a metafield containing component data
2. Customer adds bundle product to cart
3. Cart Transform Function intercepts the cart
4. Function expands bundle into individual component products with custom prices
5. Customer sees individual items in cart with correct pricing

---

## Prerequisites

Before starting, ensure you have:

- [ ] Shopify Partner account
- [ ] Development store or test store
- [ ] Node.js 18+ installed
- [ ] Shopify CLI installed (`npm install -g @shopify/cli @shopify/app`)
- [ ] Basic knowledge of:
  - Shopify Functions
  - GraphQL
  - JavaScript/Node.js
  - Liquid templating

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    BUNDLE EXPANDER FLOW                      │
└─────────────────────────────────────────────────────────────┘

1. PRODUCT SETUP
   ┌──────────────┐
   │ Bundle       │
   │ Product      │ ← Metafield: bundle component data
   └──────────────┘
         │
         ↓
2. CUSTOMER ACTION
   ┌──────────────┐
   │ Customer adds│
   │ bundle to    │
   │ cart         │
   └──────────────┘
         │
         ↓
3. FUNCTION EXECUTION
   ┌──────────────┐
   │ Cart         │
   │ Transform    │ ← Reads metafield, expands bundle
   │ Function     │
   └──────────────┘
         │
         ↓
4. RESULT
   ┌──────────────┐
   │ Cart shows   │
   │ individual   │ ← Each with custom price
   │ components   │
   └──────────────┘
```

---

## Step 1: App Setup

### 1.1 Create Shopify App

```bash
# Create new app
npm init @shopify/app@latest

# Follow prompts:
# - App name: bundle-expander
# - Template: Remix
# - Language: TypeScript (or JavaScript)
```

### 1.2 Configure App

Navigate to your app directory:
```bash
cd bundle-expander
```

### 1.3 Update shopify.app.toml

Add the necessary scopes:

```toml
# shopify.app.toml

name = "bundle-expander"
client_id = "YOUR_CLIENT_ID"
application_url = "https://YOUR_APP_URL"
embedded = true

[access_scopes]
scopes = "write_products,read_products"

[auth]
redirect_urls = [
  "https://YOUR_APP_URL/auth/callback",
  "https://YOUR_APP_URL/auth/shopify/callback",
  "https://YOUR_APP_URL/api/auth/callback"
]

[webhooks]
api_version = "2025-01"

[pos]
embedded = false
```

### 1.4 Install App on Development Store

```bash
npm run dev
```

Follow the prompts to install the app on your development store.

---

## Step 2: Metafield Configuration

### 2.1 Add Metafield Definition to shopify.app.toml

Add this configuration to create the metafield that will store bundle data:

```toml
# shopify.app.toml (add to the end of file)

[product.metafields.bundles-price-per-component.function-configuration]
name = "Bundle Component Data"
description = "Array of component variants with their prices and quantities for bundle expansion"
type = "json"
access.admin = "merchant_read_write"
```

**Important Notes:**
- The namespace will be `$app:bundles-price-per-component` (app-owned)
- Merchants can edit values but cannot change the definition
- The metafield is automatically deployed to all stores that install the app

### 2.2 Deploy Metafield Configuration

```bash
shopify app deploy
```

This creates the metafield definition across all stores with your app installed.

### 2.3 Metafield Structure

The metafield stores a JSON array with this structure:

```json
[
  {
    "id": "gid://shopify/ProductVariant/50669750518050",
    "price": "25.00",
    "quantity": 1,
    "product_handle": "miller-standard-ss-tee-324-1"
  },
  {
    "id": "gid://shopify/ProductVariant/50669750223138",
    "price": "30.00",
    "quantity": 2,
    "product_handle": "slash-badge-standard-ls-tee-324"
  }
]
```

**Field Descriptions:**
- `id` (required): GraphQL ID of the product variant
- `price` (required): Price for this component in the bundle (as string)
- `quantity` (required): How many of this item are in the bundle
- `product_handle` (required): Product handle for Liquid display

---

## Step 3: Cart Transform Function

### 3.1 Generate Function

```bash
npm run shopify app generate extension
```

**Choose:**
- Extension type: **Cart transform**
- Name: **bundle-expander-transform**
- Language: **JavaScript**

### 3.2 Update Function Configuration

Edit `extensions/bundle-expander-transform/shopify.extension.toml`:

```toml
api_version = "2025-01"

[[extensions]]
type = "cart_transform"
name = "bundle-expander-transform"
handle = "bundle-expander"

[extensions.input.variables]
```

### 3.3 Create GraphQL Input Query

Create/edit `extensions/bundle-expander-transform/input.graphql`:

```graphql
query RunInput {
  presentmentCurrencyRate
  cart {
    lines {
      id
      quantity
      merchandise {
        __typename
        ... on ProductVariant {
          id
          title
          product {
            bundledComponentData: metafield(
              namespace: "$app:bundles-price-per-component"
              key: "function-configuration"
            ) {
              type
              value
            }
          }
        }
      }
    }
  }
}
```

**Query Explanation:**
- `presentmentCurrencyRate`: Converts prices to customer's currency
- `cart.lines`: All items currently in cart
- `bundledComponentData`: Our custom metafield with component data

### 3.4 Implement Function Logic

Create/edit `extensions/bundle-expander-transform/src/run.js`:

```javascript
// @ts-check

/**
 * @typedef {import("../generated/api").RunInput} RunInput
 * @typedef {import("../generated/api").FunctionRunResult} FunctionRunResult
 * @typedef {import("../generated/api").Operation} Operation
 */

/**
 * @type {FunctionRunResult}
 */
const NO_CHANGES = {
  operations: [],
};

/**
 * @param {RunInput} input
 * @returns {FunctionRunResult}
 */
export function run(input) {
  const operations = [];

  // Get the presentment currency rate for price conversion
  const currencyRate = input.presentmentCurrencyRate || 1.0;

  // Loop through each cart line
  for (const line of input.cart.lines) {
    // Check if this line item has bundle data
    const bundleData = line.merchandise?.product?.bundledComponentData;

    if (!bundleData || !bundleData.value) {
      // Not a bundle product, skip
      continue;
    }

    let components;
    try {
      // Parse the JSON data
      components = JSON.parse(bundleData.value);
    } catch (error) {
      console.error("Failed to parse bundle data:", error);
      continue;
    }

    if (!Array.isArray(components) || components.length === 0) {
      // Invalid or empty bundle data, skip
      continue;
    }

    // Create expand operation for this bundle
    const expandOperation = {
      expand: {
        cartLineId: line.id,
        expandedCartItems: components.map((component) => {
          // Calculate the component quantity
          // Multiply by line quantity to handle multiple bundles in cart
          const componentQuantity = (component.quantity || 1) * line.quantity;

          // Calculate price per unit in customer's currency
          const pricePerUnit = parseFloat(component.price) * currencyRate;

          return {
            merchandiseId: component.id,
            quantity: componentQuantity,
            price: {
              adjustment: {
                fixedPricePerUnit: {
                  amount: pricePerUnit.toFixed(2),
                },
              },
            },
          };
        }),
      },
    };

    operations.push(expandOperation);
  }

  if (operations.length === 0) {
    return NO_CHANGES;
  }

  return {
    operations: operations,
  };
}
```

**Function Logic Breakdown:**

1. **Loop through cart lines**: Check each item in cart
2. **Find bundle products**: Look for products with `bundledComponentData` metafield
3. **Parse component data**: Convert JSON string to JavaScript object
4. **Create expand operation**: For each bundle, create expansion with:
   - Component variant IDs
   - Quantities (multiplied by bundle quantity in cart)
   - Custom prices (converted to customer's currency)
5. **Return operations**: Shopify applies the transformations

### 3.5 Deploy Function

```bash
npm run deploy
```

Or deploy the function specifically:

```bash
shopify app function build
shopify app deploy
```

---

## Step 4: Setting Bundle Data

### 4.1 Get Product and Variant Data

You need to collect:
- Variant IDs for each component
- Product handles for each component
- Prices you want to charge in the bundle
- Quantities of each component

### 4.2 Create Helper Script (Optional)

Create `scripts/get-bundle-data.js`:

```javascript
import { authenticate } from "../shopify.server.js";

export async function getBundleData(admin, variantIds) {
  const query = `
    query GetVariants($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on ProductVariant {
          id
          title
          product {
            id
            handle
            title
          }
        }
      }
    }
  `;

  const response = await admin.graphql(query, {
    variables: { ids: variantIds }
  });

  const data = await response.json();
  return data.data.nodes;
}
```

### 4.3 Create App Route to Generate Bundle Data

Create `app/routes/app.bundle-builder.jsx`:

```javascript
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { useState } from "react";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  return json({});
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const variantIds = JSON.parse(formData.get("variantIds"));

  const query = `
    query GetVariants($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on ProductVariant {
          id
          title
          product {
            id
            handle
            title
          }
        }
      }
    }
  `;

  const response = await admin.graphql(query, {
    variables: { ids: variantIds }
  });

  const data = await response.json();
  return json({ variants: data.data.nodes });
};

export default function BundleBuilder() {
  const submit = useSubmit();
  const [variantIds, setVariantIds] = useState("");
  const [prices, setPrices] = useState("");
  const [quantities, setQuantities] = useState("");

  const handleGenerate = () => {
    const ids = variantIds.split("\n").map(id => id.trim()).filter(Boolean);
    submit(
      { variantIds: JSON.stringify(ids) },
      { method: "post" }
    );
  };

  return (
    <div style={{ padding: "20px", maxWidth: "800px", margin: "0 auto" }}>
      <h1>Bundle Data Generator</h1>
      
      <div style={{ marginBottom: "20px" }}>
        <label>
          <strong>Variant IDs (one per line):</strong>
          <textarea
            value={variantIds}
            onChange={(e) => setVariantIds(e.target.value)}
            rows={10}
            style={{ width: "100%", marginTop: "10px", padding: "10px" }}
            placeholder="gid://shopify/ProductVariant/12345&#10;gid://shopify/ProductVariant/67890"
          />
        </label>
      </div>

      <div style={{ marginBottom: "20px" }}>
        <label>
          <strong>Prices (one per line, in order):</strong>
          <textarea
            value={prices}
            onChange={(e) => setPrices(e.target.value)}
            rows={5}
            style={{ width: "100%", marginTop: "10px", padding: "10px" }}
            placeholder="25.00&#10;30.00"
          />
        </label>
      </div>

      <div style={{ marginBottom: "20px" }}>
        <label>
          <strong>Quantities (one per line, in order):</strong>
          <textarea
            value={quantities}
            onChange={(e) => setQuantities(e.target.value)}
            rows={5}
            style={{ width: "100%", marginTop: "10px", padding: "10px" }}
            placeholder="1&#10;2"
          />
        </label>
      </div>

      <button
        onClick={handleGenerate}
        style={{
          padding: "12px 24px",
          background: "#008060",
          color: "white",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer"
        }}
      >
        Generate Bundle Data
      </button>
    </div>
  );
}
```

### 4.4 Set Bundle Data via GraphQL Mutation

Once you have your bundle data JSON, use this mutation to set it on a product:

```graphql
mutation SetBundleData($productId: ID!, $metafieldValue: String!) {
  productUpdate(
    input: {
      id: $productId
      metafields: [
        {
          namespace: "$app:bundles-price-per-component"
          key: "function-configuration"
          type: "json"
          value: $metafieldValue
        }
      ]
    }
  ) {
    product {
      id
      title
      metafield(
        namespace: "$app:bundles-price-per-component"
        key: "function-configuration"
      ) {
        value
      }
    }
    userErrors {
      field
      message
    }
  }
}
```

**Variables:**
```json
{
  "productId": "gid://shopify/Product/YOUR_BUNDLE_PRODUCT_ID",
  "metafieldValue": "[{\"id\":\"gid://shopify/ProductVariant/50669750518050\",\"price\":\"25.00\",\"quantity\":1,\"product_handle\":\"miller-standard-ss-tee-324-1\"},{\"id\":\"gid://shopify/ProductVariant/50669750223138\",\"price\":\"30.00\",\"quantity\":2,\"product_handle\":\"slash-badge-standard-ls-tee-324\"}]"
}
```

**Example using Admin API:**

```javascript
const response = await admin.graphql(`
  mutation SetBundleData($productId: ID!, $metafieldValue: String!) {
    productUpdate(
      input: {
        id: $productId
        metafields: [
          {
            namespace: "$app:bundles-price-per-component"
            key: "function-configuration"
            type: "json"
            value: $metafieldValue
          }
        ]
      }
    ) {
      product {
        id
        title
      }
      userErrors {
        field
        message
      }
    }
  }
`, {
  variables: {
    productId: "gid://shopify/Product/9961779462434",
    metafieldValue: JSON.stringify([
      {
        id: "gid://shopify/ProductVariant/50669750518050",
        price: "25.00",
        quantity: 1,
        product_handle: "miller-standard-ss-tee-324-1"
      },
      {
        id: "gid://shopify/ProductVariant/50669750223138",
        price: "30.00",
        quantity: 2,
        product_handle: "slash-badge-standard-ls-tee-324"
      }
    ])
  }
});
```

---

## Step 5: Frontend Display (Liquid)

### 5.1 Create Liquid Snippet

Create `snippets/bundle-display.liquid` in your theme:

```liquid
{%- comment -%}
  Bundle Product Display - Beautiful Grid Design
  Usage: {% render 'bundle-display' %}
{%- endcomment -%}

{% assign bundle_metafield = product.metafields.app--310775021569--bundles-price-per-component.function-configuration %}

{% if bundle_metafield and bundle_metafield.value %}
  {% assign bundle_data = bundle_metafield.value | parse_json %}
  
  {% if bundle_data.size > 0 %}
    <div class="bundle-section">
      <div class="bundle-header">
        <h2 class="bundle-title">🎁 This Bundle Includes</h2>
        <p class="bundle-subtitle">Premium quality products bundled together</p>
      </div>
      
      <div class="bundle-grid">
        {% for component in bundle_data %}
          {% assign bundle_product = all_products[component.product_handle] %}
          
          {% if bundle_product.id %}
            {% assign variant_gid = component.id | remove: 'gid://shopify/ProductVariant/' %}
            {% assign variant_id = variant_gid | plus: 0 %}
            
            {% assign found_variant = blank %}
            {% for var in bundle_product.variants %}
              {% if var.id == variant_id %}
                {% assign found_variant = var %}
                {% break %}
              {% endif %}
            {% endfor %}
            
            {% if found_variant == blank %}
              {% assign found_variant = bundle_product.variants.first %}
            {% endif %}
            
            <div class="bundle-card">
              <div class="bundle-card__image-container">
                {% if found_variant.image %}
                  <img 
                    src="{{ found_variant.image | image_url: width: 400 }}"
                    srcset="{{ found_variant.image | image_url: width: 400 }} 1x, {{ found_variant.image | image_url: width: 800 }} 2x"
                    alt="{{ found_variant.image.alt | default: bundle_product.title }}"
                    loading="lazy"
                    class="bundle-card__image"
                  >
                {% elsif bundle_product.featured_image %}
                  <img 
                    src="{{ bundle_product.featured_image | image_url: width: 400 }}"
                    srcset="{{ bundle_product.featured_image | image_url: width: 400 }} 1x, {{ bundle_product.featured_image | image_url: width: 800 }} 2x"
                    alt="{{ bundle_product.featured_image.alt | default: bundle_product.title }}"
                    loading="lazy"
                    class="bundle-card__image"
                  >
                {% else %}
                  <div class="bundle-card__no-image">
                    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <rect width="80" height="80" rx="8" fill="#F3F4F6"/>
                      <path d="M40 20C28.954 20 20 28.954 20 40C20 51.046 28.954 60 40 60C51.046 60 60 51.046 60 40C60 28.954 51.046 20 40 20ZM40 55C31.729 55 25 48.271 25 40C25 31.729 31.729 25 40 25C48.271 25 55 31.729 55 40C55 48.271 48.271 55 40 55Z" fill="#9CA3AF"/>
                      <path d="M35 35L45 45M45 35L35 45" stroke="#9CA3AF" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                  </div>
                {% endif %}
                
                {% if component.quantity > 1 %}
                  <div class="bundle-card__badge">
                    <span>{{ component.quantity }}×</span>
                  </div>
                {% endif %}
                
                <div class="bundle-card__overlay">
                  <a href="{{ bundle_product.url }}" class="bundle-card__view-btn">
                    View Product →
                  </a>
                </div>
              </div>
              
              <div class="bundle-card__info">
                <h3 class="bundle-card__title">
                  <a href="{{ bundle_product.url }}">{{ bundle_product.title }}</a>
                </h3>
                
                {% if found_variant.title != 'Default Title' %}
                  <p class="bundle-card__variant">{{ found_variant.title }}</p>
                {% endif %}
                
                <div class="bundle-card__price-row">
                  <div class="bundle-card__price-info">
                    <span class="bundle-card__label">Price</span>
                    <span class="bundle-card__price">Rs.{{ component.price }}</span>
                  </div>
                  
                  {% if component.quantity > 1 %}
                    <div class="bundle-card__calculation">
                      <span class="bundle-card__multiply">×</span>
                      <span class="bundle-card__qty">{{ component.quantity }}</span>
                      <span class="bundle-card__equals">=</span>
                      <span class="bundle-card__total">Rs.{{ component.price | times: component.quantity }}</span>
                    </div>
                  {% endif %}
                </div>
              </div>
            </div>
          {% else %}
            <div class="bundle-card bundle-card--error">
              <div class="bundle-card__error-content">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                  <circle cx="24" cy="24" r="20" stroke="#F59E0B" stroke-width="2"/>
                  <path d="M24 16V26M24 32V32.5" stroke="#F59E0B" stroke-width="2" stroke-linecap="round"/>
                </svg>
                <p>Product Not Available</p>
                <small>{{ component.product_handle }}</small>
              </div>
            </div>
          {% endif %}
        {% endfor %}
      </div>
      
      <div class="bundle-summary">
        {% assign total_price = 0 %}
        {% assign total_items = 0 %}
        
        {% for component in bundle_data %}
          {% assign item_total = component.price | times: component.quantity %}
          {% assign total_price = total_price | plus: item_total %}
          {% assign total_items = total_items | plus: component.quantity %}
        {% endfor %}
        
        <div class="bundle-summary__content">
          <div class="bundle-summary__icon">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M4 8L16 2L28 8V24L16 30L4 24V8Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
              <path d="M16 2V30M4 8L28 24M28 8L4 24" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </div>
          <div class="bundle-summary__details">
            <div class="bundle-summary__row">
              <span class="bundle-summary__label">Total Items in Bundle</span>
              <span class="bundle-summary__value">{{ total_items }} Items</span>
            </div>
            <div class="bundle-summary__row bundle-summary__row--total">
              <span class="bundle-summary__label">Complete Bundle Value</span>
              <span class="bundle-summary__total-value">Rs.{{ total_price }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <style>
      .bundle-section {
        margin: 60px auto;
        max-width: 1400px;
        padding: 0 20px;
      }
      
      .bundle-header {
        text-align: center;
        margin-bottom: 50px;
      }
      
      .bundle-title {
        font-size: 42px;
        font-weight: 800;
        margin: 0 0 12px;
        color: #111827;
        letter-spacing: -0.02em;
      }
      
      .bundle-subtitle {
        font-size: 18px;
        color: #6B7280;
        margin: 0;
        font-weight: 400;
      }
      
      .bundle-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 30px;
        margin-bottom: 60px;
      }
      
      .bundle-card {
        background: #fff;
        border-radius: 20px;
        overflow: hidden;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        border: 1px solid #E5E7EB;
      }
      
      .bundle-card:hover {
        transform: translateY(-8px);
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        border-color: #3B82F6;
      }
      
      .bundle-card__image-container {
        position: relative;
        width: 100%;
        padding-bottom: 100%;
        background: linear-gradient(135deg, #F9FAFB 0%, #F3F4F6 100%);
        overflow: hidden;
      }
      
      .bundle-card__image {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 0.5s ease;
      }
      
      .bundle-card:hover .bundle-card__image {
        transform: scale(1.1);
      }
      
      .bundle-card__no-image {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .bundle-card__badge {
        position: absolute;
        top: 16px;
        right: 16px;
        background: linear-gradient(135deg, #EF4444 0%, #DC2626 100%);
        color: white;
        padding: 8px 16px;
        border-radius: 30px;
        font-weight: 800;
        font-size: 16px;
        box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
        z-index: 2;
      }
      
      .bundle-card__overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(180deg, transparent 0%, rgba(0, 0, 0, 0.8) 100%);
        display: flex;
        align-items: flex-end;
        justify-content: center;
        padding: 20px;
        opacity: 0;
        transition: opacity 0.3s ease;
      }
      
      .bundle-card:hover .bundle-card__overlay {
        opacity: 1;
      }
      
      .bundle-card__view-btn {
        background: white;
        color: #111827;
        padding: 12px 28px;
        border-radius: 50px;
        font-weight: 700;
        text-decoration: none;
        font-size: 14px;
        transition: all 0.2s;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      }
      
      .bundle-card__view-btn:hover {
        background: #3B82F6;
        color: white;
        transform: translateY(-2px);
      }
      
      .bundle-card__info {
        padding: 24px;
      }
      
      .bundle-card__title {
        margin: 0 0 8px;
        font-size: 18px;
        font-weight: 700;
        line-height: 1.4;
        min-height: 50px;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      
      .bundle-card__title a {
        color: #111827;
        text-decoration: none;
        transition: color 0.2s;
      }
      
      .bundle-card__title a:hover {
        color: #3B82F6;
      }
      
      .bundle-card__variant {
        margin: 0 0 16px;
        font-size: 14px;
        color: #6B7280;
        font-weight: 500;
      }
      
      .bundle-card__price-row {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding-top: 16px;
        border-top: 2px solid #F3F4F6;
      }
      
      .bundle-card__price-info {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      
      .bundle-card__label {
        font-size: 13px;
        color: #6B7280;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        font-weight: 600;
      }
      
      .bundle-card__price {
        font-size: 24px;
        font-weight: 900;
        color: #111827;
      }
      
      .bundle-card__calculation {
        display: flex;
        align-items: center;
        gap: 8px;
        justify-content: flex-end;
        font-size: 16px;
        color: #6B7280;
      }
      
      .bundle-card__multiply,
      .bundle-card__equals {
        font-weight: 600;
        color: #9CA3AF;
      }
      
      .bundle-card__qty {
        font-weight: 700;
        color: #374151;
        background: #F3F4F6;
        padding: 4px 10px;
        border-radius: 6px;
      }
      
      .bundle-card__total {
        font-weight: 900;
        color: #3B82F6;
        font-size: 18px;
      }
      
      .bundle-card--error {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 300px;
        background: #FFFBEB;
        border: 2px dashed #F59E0B;
      }
      
      .bundle-card__error-content {
        text-align: center;
        padding: 30px;
        color: #92400E;
      }
      
      .bundle-card__error-content svg {
        margin: 0 auto 16px;
      }
      
      .bundle-card__error-content p {
        margin: 0 0 8px;
        font-weight: 700;
        font-size: 16px;
      }
      
      .bundle-card__error-content small {
        display: block;
        font-size: 13px;
        opacity: 0.7;
      }
      
      .bundle-summary {
        background: linear-gradient(135deg, #3B82F6 0%, #2563EB 100%);
        border-radius: 24px;
        padding: 40px;
        box-shadow: 0 20px 25px -5px rgba(59, 130, 246, 0.3);
      }
      
      .bundle-summary__content {
        display: flex;
        gap: 30px;
        align-items: center;
        max-width: 800px;
        margin: 0 auto;
      }
      
      .bundle-summary__icon {
        flex-shrink: 0;
        width: 80px;
        height: 80px;
        background: rgba(255, 255, 255, 0.2);
        border-radius: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
      }
      
      .bundle-summary__details {
        flex: 1;
      }
      
      .bundle-summary__row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.2);
      }
      
      .bundle-summary__row--total {
        border-bottom: none;
        padding-top: 20px;
      }
      
      .bundle-summary__label {
        font-size: 16px;
        color: rgba(255, 255, 255, 0.9);
        font-weight: 600;
      }
      
      .bundle-summary__value {
        font-size: 20px;
        color: white;
        font-weight: 700;
      }
      
      .bundle-summary__total-value {
        font-size: 36px;
        color: white;
        font-weight: 900;
        letter-spacing: -0.02em;
      }
      
      @media (max-width: 1024px) {
        .bundle-grid {
          grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          gap: 24px;
        }
      }
      
      @media (max-width: 768px) {
        .bundle-section {
          margin: 40px auto;
        }
        
        .bundle-title {
          font-size: 32px;
        }
        
        .bundle-subtitle {
          font-size: 16px;
        }
        
        .bundle-grid {
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
        }
        
        .bundle-card__info {
          padding: 16px;
        }
        
        .bundle-card__title {
          font-size: 15px;
          min-height: 42px;
        }
        
        .bundle-card__price {
          font-size: 20px;
        }
        
        .bundle-summary {
          padding: 24px;
        }
        
        .bundle-summary__content {
          flex-direction: column;
          gap: 20px;
        }
        
        .bundle-summary__icon {
          width: 60px;
          height: 60px;
        }
        
        .bundle-summary__total-value {
          font-size: 28px;
        }
      }
      
      @media (max-width: 480px) {
        .bundle-grid {
          grid-template-columns: 1fr;
        }
        
        .bundle-card__title {
          font-size: 16px;
        }
      }
    </style>
  {% endif %}
{% endif %}
```

### 5.2 Add to Product Template

Edit your product template (usually `sections/main-product.liquid`):

```liquid
{%- comment -%} Add this where you want the bundle display {%- endcomment -%}

<div class="product-bundle-wrapper">
  {% render 'bundle-display' %}
</div>
```

### 5.3 Ensure Products Are Accessible

For the Liquid code to work, all component products must be accessible via `all_products[handle]`. This requires products to be:

1. **Published** to the storefront
2. **In at least one collection** (recommended: add to "All" collection)

**To create an "All" collection:**
1. Go to **Products > Collections**
2. Create new collection
3. Set to **Automated** collection
4. Condition: **Product price is greater than 0**
5. Save

---

## Testing

### Test 1: Verify Metafield Setup

1. Go to Shopify Admin > Products
2. Select your bundle product
3. Scroll to Metafields section
4. You should see "Bundle Component Data" field
5. Verify the JSON data is correctly formatted

### Test 2: Test Function in Shopify

1. Add bundle product to cart
2. View cart
3. Verify that:
   - ✅ Bundle product is replaced with individual components
   - ✅ Each component has correct quantity
   - ✅ Each component has custom price
   - ✅ Prices are in correct currency

### Test 3: Test Frontend Display

1. Visit bundle product page
2. Verify that:
   - ✅ Bundle section displays below product details
   - ✅ All component products show with images
   - ✅ Prices and quantities are correct
   - ✅ Total bundle value is accurate
   - ✅ Links to individual products work

### Test 4: Test Multiple Bundles in Cart

1. Add bundle product to cart
2. Increase quantity to 2
3. Verify components multiply correctly (2x of each component)

### Test 5: Test Edge Cases

- Bundle with missing component products
- Bundle with out-of-stock components
- Bundle in different currencies
- Bundle with single quantity items
- Empty bundle data

---

## Troubleshooting

### Issue: Function Not Running

**Symptoms:**
- Bundle stays in cart as-is
- No expansion happening

**Solutions:**
1. Verify function is deployed: `shopify app function list`
2. Check function is enabled in Shopify Admin > Settings > Checkout > Cart transform
3. Ensure metafield namespace matches exactly: `$app:bundles-price-per-component`
4. Check function logs in Partner Dashboard

### Issue: Products Not Displaying in Liquid

**Symptoms:**
- "Product Not Found" errors
- Empty bundle grid

**Solutions:**
1. Verify product handles are correct
2. Ensure products are published
3. Add products to "All" collection
4. Check if `all_products[handle]` is accessible in your theme
5. Try using a search through collections instead

**Debug Code:**
```liquid
{% assign test_product = all_products['your-handle'] %}
<p>Product found? {{ test_product.id }}</p>
<p>Product title: {{ test_product.title }}</p>
```

### Issue: Prices Wrong in Cart

**Symptoms:**
- Components showing original prices
- Prices don't match bundle data

**Solutions:**
1. Verify `presentmentCurrencyRate` is being used
2. Check price format in metafield (should be string: "25.00")
3. Ensure `fixedPricePerUnit` is calculated correctly
4. Test in single currency first

### Issue: Metafield Not Saving

**Symptoms:**
- Can't save bundle data
- Metafield doesn't appear

**Solutions:**
1. Redeploy app: `shopify app deploy`
2. Check metafield definition in `shopify.app.toml`
3. Verify app has correct scopes
4. Try creating metafield via GraphQL mutation directly

### Issue: Variant IDs Don't Match

**Symptoms:**
- Wrong products showing
- Variants not found

**Solutions:**
1. Use full GID format: `gid://shopify/ProductVariant/12345`
2. Verify variant IDs exist in your store
3. Check if variants are deleted/archived
4. Use GraphQL to fetch correct IDs

---

## Additional Features

### Feature 1: Bundle Discounts

To add a discount on top of custom bundle pricing:

```javascript
// In run.js, modify the price calculation:
const discountPercentage = 0.10; // 10% discount
const pricePerUnit = parseFloat(component.price) * (1 - discountPercentage) * currencyRate;
```

### Feature 2: Conditional Bundling

Only expand bundle for specific customer tags:

```javascript
// Add to input.graphql:
query RunInput {
  presentmentCurrencyRate
  cart {
    buyerIdentity {
      customer {
        tags
      }
    }
    lines {
      # ... rest of query
    }
  }
}

// In run.js:
const customerTags = input.cart.buyerIdentity?.customer?.tags || [];
const isVIP = customerTags.includes('VIP');

if (!isVIP) {
  return NO_CHANGES; // Don't expand for non-VIP customers
}
```

### Feature 3: Dynamic Bundle Titles

Update component titles in cart:

```javascript
// In the expandedCartItems mapping:
title: `${component.title} (from Bundle)`,
```

### Feature 4: Bundle Analytics

Track bundle conversions:

```javascript
// In run.js:
console.log(`Bundle expanded: ${line.merchandise.product.title}`);
console.log(`Components: ${components.length}`);
```

View logs in Shopify Partner Dashboard > Apps > Your App > Functions > Logs

---

## Best Practices

### 1. Metafield Management
- ✅ Use app-owned metafields for security
- ✅ Validate JSON structure before saving
- ✅ Include product_handle for Liquid display
- ✅ Keep prices as strings to avoid floating-point issues

### 2. Function Performance
- ✅ Keep function logic simple
- ✅ Use early returns for non-bundle products
- ✅ Minimize loops and iterations
- ✅ Cache parsed JSON if possible

### 3. Error Handling
- ✅ Always wrap JSON.parse in try-catch
- ✅ Validate array data before mapping
- ✅ Provide fallbacks for missing data
- ✅ Log errors for debugging

### 4. Testing
- ✅ Test with multiple bundles
- ✅ Test with different quantities
- ✅ Test across different currencies
- ✅ Test on mobile devices
- ✅ Test cart abandonment scenarios

### 5. Documentation
- ✅ Document bundle data structure
- ✅ Provide examples for merchants
- ✅ Create video tutorials
- ✅ Maintain changelog

---

## Example Bundle Data Sets

### Example 1: Simple T-Shirt Bundle
```json
[
  {
    "id": "gid://shopify/ProductVariant/50669750518050",
    "price": "25.00",
    "quantity": 1,
    "product_handle": "basic-tee-black"
  },
  {
    "id": "gid://shopify/ProductVariant/50669750223138",
    "price": "25.00",
    "quantity": 1,
    "product_handle": "basic-tee-white"
  },
  {
    "id": "gid://shopify/ProductVariant/50669749993762",
    "price": "25.00",
    "quantity": 1,
    "product_handle": "basic-tee-gray"
  }
]
```
**Total: Rs.75.00 (3 items)**

### Example 2: Premium Gift Set
```json
[
  {
    "id": "gid://shopify/ProductVariant/50669750518050",
    "price": "45.00",
    "quantity": 1,
    "product_handle": "premium-hoodie"
  },
  {
    "id": "gid://shopify/ProductVariant/50669750223138",
    "price": "30.00",
    "quantity": 2,
    "product_handle": "premium-socks"
  },
  {
    "id": "gid://shopify/ProductVariant/50669749993762",
    "price": "15.00",
    "quantity": 1,
    "product_handle": "gift-box"
  }
]
```
**Total: Rs.120.00 (4 items)**

### Example 3: Starter Pack
```json
[
  {
    "id": "gid://shopify/ProductVariant/50669750518050",
    "price": "20.00",
    "quantity": 3,
    "product_handle": "starter-tee"
  },
  {
    "id": "gid://shopify/ProductVariant/50669750223138",
    "price": "35.00",
    "quantity": 1,
    "product_handle": "starter-jeans"
  },
  {
    "id": "gid://shopify/ProductVariant/50669749993762",
    "price": "10.00",
    "quantity": 2,
    "product_handle": "starter-accessories"
  }
]
```
**Total: Rs.115.00 (6 items)**

---

## Deployment Checklist

Before going live:

- [ ] Test function with multiple bundle configurations
- [ ] Verify all component products are published
- [ ] Test across different devices and browsers
- [ ] Test with different payment methods
- [ ] Verify tax calculations are correct
- [ ] Test abandoned cart emails (components should show)
- [ ] Test order confirmation emails
- [ ] Verify inventory tracking for components
- [ ] Test refunds and returns process
- [ ] Create merchant documentation
- [ ] Set up monitoring and alerts
- [ ] Test with real customer data (in test mode)

---

## Support & Resources

### Official Documentation
- [Shopify Functions Documentation](https://shopify.dev/docs/api/functions)
- [Cart Transform Functions](https://shopify.dev/docs/api/functions/reference/cart-transform)
- [Metafields Documentation](https://shopify.dev/docs/apps/custom-data/metafields)
- [Liquid Documentation](https://shopify.dev/docs/api/liquid)

### Community
- [Shopify Community Forums](https://community.shopify.com/)
- [Shopify Discord](https://discord.gg/shopifydevs)
- [GitHub Discussions](https://github.com/Shopify/shopify-app-template-node/discussions)

### Tools
- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli)
- [GraphiQL App](https://shopify-graphiql-app.shopifycloud.com/)
- [Shopify Polaris](https://polaris.shopify.com/)

---

## Changelog

### Version 1.0.0 (2025-01-13)
- Initial implementation
- Cart Transform Function for bundle expansion
- Metafield-based bundle configuration
- Liquid frontend display component
- Support for custom pricing and quantities
- Multi-currency support
- Responsive grid design

---

## License

This implementation guide is provided as-is for educational purposes.

---

## Credits

**Created by:** Fayyaz Ahmed
**Date:** January 13, 2026
**Version:** 1.0.0

---

**End of Documentation**


# Shopify App Template - React Router

This is a template for building a [Shopify app](https://shopify.dev/docs/apps/getting-started) using [React Router](https://reactrouter.com/). It was forked from the [Shopify Remix app template](https://github.com/Shopify/shopify-app-template-remix) and converted to React Router.

Rather than cloning this repo, follow the [Quick Start steps](https://github.com/Shopify/shopify-app-template-react-router#quick-start).

Visit the [`shopify.dev` documentation](https://shopify.dev/docs/api/shopify-app-react-router) for more details on the React Router app package.

## Upgrading from Remix

If you have an existing Remix app that you want to upgrade to React Router, please follow the [upgrade guide](https://github.com/Shopify/shopify-app-template-react-router/wiki/Upgrading-from-Remix). Otherwise, please follow the quick start guide below.

## Quick start

### Prerequisites

Before you begin, you'll need to [download and install the Shopify CLI](https://shopify.dev/docs/apps/tools/cli/getting-started) if you haven't already.

### Setup

```shell
shopify app init --template=https://github.com/Shopify/shopify-app-template-react-router
```

### Local Development

```shell
shopify app dev
```

Press P to open the URL to your app. Once you click install, you can start development.

Local development is powered by [the Shopify CLI](https://shopify.dev/docs/apps/tools/cli). It logs into your account, connects to an app, provides environment variables, updates remote config, creates a tunnel and provides commands to generate extensions.

### Authenticating and querying data

To authenticate and query data you can use the `shopify` const that is exported from `/app/shopify.server.js`:

```js
export async function loader({ request }) {
  const { admin } = await shopify.authenticate.admin(request);

  const response = await admin.graphql(`
    {
      products(first: 25) {
        nodes {
          title
          description
        }
      }
    }`);

  const {
    data: {
      products: { nodes },
    },
  } = await response.json();

  return nodes;
}
```

This template comes pre-configured with examples of:

1. Setting up your Shopify app in [/app/shopify.server.ts](https://github.com/Shopify/shopify-app-template-react-router/blob/main/app/shopify.server.ts)
2. Querying data using Graphql. Please see: [/app/routes/app.\_index.tsx](https://github.com/Shopify/shopify-app-template-react-router/blob/main/app/routes/app._index.tsx).
3. Responding to webhooks. Please see [/app/routes/webhooks.tsx](https://github.com/Shopify/shopify-app-template-react-router/blob/main/app/routes/webhooks.app.uninstalled.tsx).

Please read the [documentation for @shopify/shopify-app-react-router](https://shopify.dev/docs/api/shopify-app-react-router) to see what other API's are available.

## Shopify Dev MCP

This template is configured with the Shopify Dev MCP. This instructs [Cursor](https://cursor.com/), [GitHub Copilot](https://github.com/features/copilot) and [Claude Code](https://claude.com/product/claude-code) and [Google Gemini CLI](https://github.com/google-gemini/gemini-cli) to use the Shopify Dev MCP.

For more information on the Shopify Dev MCP please read [the documentation](https://shopify.dev/docs/apps/build/devmcp).

## Deployment

### Application Storage

This template uses [Prisma](https://www.prisma.io/) to store session data, by default using an [SQLite](https://www.sqlite.org/index.html) database.
The database is defined as a Prisma schema in `prisma/schema.prisma`.

This use of SQLite works in production if your app runs as a single instance.
The database that works best for you depends on the data your app needs and how it is queried.
Here’s a short list of databases providers that provide a free tier to get started:

| Database   | Type             | Hosters                                                                                                                                                                                                                                    |
| ---------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MySQL      | SQL              | [Digital Ocean](https://www.digitalocean.com/products/managed-databases-mysql), [Planet Scale](https://planetscale.com/), [Amazon Aurora](https://aws.amazon.com/rds/aurora/), [Google Cloud SQL](https://cloud.google.com/sql/docs/mysql) |
| PostgreSQL | SQL              | [Digital Ocean](https://www.digitalocean.com/products/managed-databases-postgresql), [Amazon Aurora](https://aws.amazon.com/rds/aurora/), [Google Cloud SQL](https://cloud.google.com/sql/docs/postgres)                                   |
| Redis      | Key-value        | [Digital Ocean](https://www.digitalocean.com/products/managed-databases-redis), [Amazon MemoryDB](https://aws.amazon.com/memorydb/)                                                                                                        |
| MongoDB    | NoSQL / Document | [Digital Ocean](https://www.digitalocean.com/products/managed-databases-mongodb), [MongoDB Atlas](https://www.mongodb.com/atlas/database)                                                                                                  |

To use one of these, you can use a different [datasource provider](https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference#datasource) in your `schema.prisma` file, or a different [SessionStorage adapter package](https://github.com/Shopify/shopify-api-js/blob/main/packages/shopify-api/docs/guides/session-storage.md).

### Build

Build the app by running the command below with the package manager of your choice:

Using yarn:

```shell
yarn build
```

Using npm:

```shell
npm run build
```

Using pnpm:

```shell
pnpm run build
```

## Hosting

When you're ready to set up your app in production, you can follow [our deployment documentation](https://shopify.dev/docs/apps/launch/deployment) to host it externally. From there, you have a few options:

- [Google Cloud Run](https://shopify.dev/docs/apps/launch/deployment/deploy-to-google-cloud-run): This tutorial is written specifically for this example repo, and is compatible with the extended steps included in the subsequent [**Build your app**](tutorial) in the **Getting started** docs. It is the most detailed tutorial for taking a React Router-based Shopify app and deploying it to production. It includes configuring permissions and secrets, setting up a production database, and even hosting your apps behind a load balancer across multiple regions.
- [Fly.io](https://fly.io/docs/js/shopify/): Leverages the Fly.io CLI to quickly launch Shopify apps to a single machine.
- [Render](https://render.com/docs/deploy-shopify-app): This tutorial guides you through using Docker to deploy and install apps on a Dev store.
- [Manual deployment guide](https://shopify.dev/docs/apps/launch/deployment/deploy-to-hosting-service): This resource provides general guidance on the requirements of deployment including environment variables, secrets, and persistent data.

When you reach the step for [setting up environment variables](https://shopify.dev/docs/apps/deployment/web#set-env-vars), you also need to set the variable `NODE_ENV=production`.

## Gotchas / Troubleshooting

### Database tables don't exist

If you get an error like:

```
The table `main.Session` does not exist in the current database.
```

Create the database for Prisma. Run the `setup` script in `package.json` using `npm`, `yarn` or `pnpm`.

### Navigating/redirecting breaks an embedded app

Embedded apps must maintain the user session, which can be tricky inside an iFrame. To avoid issues:

1. Use `Link` from `react-router` or `@shopify/polaris`. Do not use `<a>`.
2. Use `redirect` returned from `authenticate.admin`. Do not use `redirect` from `react-router`
3. Use `useSubmit` from `react-router`.

This only applies if your app is embedded, which it will be by default.

### Webhooks: shop-specific webhook subscriptions aren't updated

If you are registering webhooks in the `afterAuth` hook, using `shopify.registerWebhooks`, you may find that your subscriptions aren't being updated.

Instead of using the `afterAuth` hook declare app-specific webhooks in the `shopify.app.toml` file. This approach is easier since Shopify will automatically sync changes every time you run `deploy` (e.g: `npm run deploy`). Please read these guides to understand more:

1. [app-specific vs shop-specific webhooks](https://shopify.dev/docs/apps/build/webhooks/subscribe#app-specific-subscriptions)
2. [Create a subscription tutorial](https://shopify.dev/docs/apps/build/webhooks/subscribe/get-started?deliveryMethod=https)

If you do need shop-specific webhooks, keep in mind that the package calls `afterAuth` in 2 scenarios:

- After installing the app
- When an access token expires

During normal development, the app won't need to re-authenticate most of the time, so shop-specific subscriptions aren't updated. To force your app to update the subscriptions, uninstall and reinstall the app. Revisiting the app will call the `afterAuth` hook.

### Webhooks: Admin created webhook failing HMAC validation

Webhooks subscriptions created in the [Shopify admin](https://help.shopify.com/en/manual/orders/notifications/webhooks) will fail HMAC validation. This is because the webhook payload is not signed with your app's secret key.

The recommended solution is to use [app-specific webhooks](https://shopify.dev/docs/apps/build/webhooks/subscribe#app-specific-subscriptions) defined in your toml file instead. Test your webhooks by triggering events manually in the Shopify admin(e.g. Updating the product title to trigger a `PRODUCTS_UPDATE`).

### Webhooks: Admin object undefined on webhook events triggered by the CLI

When you trigger a webhook event using the Shopify CLI, the `admin` object will be `undefined`. This is because the CLI triggers an event with a valid, but non-existent, shop. The `admin` object is only available when the webhook is triggered by a shop that has installed the app. This is expected.

Webhooks triggered by the CLI are intended for initial experimentation testing of your webhook configuration. For more information on how to test your webhooks, see the [Shopify CLI documentation](https://shopify.dev/docs/apps/tools/cli/commands#webhook-trigger).

### Incorrect GraphQL Hints

By default the [graphql.vscode-graphql](https://marketplace.visualstudio.com/items?itemName=GraphQL.vscode-graphql) extension for will assume that GraphQL queries or mutations are for the [Shopify Admin API](https://shopify.dev/docs/api/admin). This is a sensible default, but it may not be true if:

1. You use another Shopify API such as the storefront API.
2. You use a third party GraphQL API.

If so, please update [.graphqlrc.ts](https://github.com/Shopify/shopify-app-template-react-router/blob/main/.graphqlrc.ts).

### Using Defer & await for streaming responses

By default the CLI uses a cloudflare tunnel. Unfortunately cloudflare tunnels wait for the Response stream to finish, then sends one chunk. This will not affect production.

To test [streaming using await](https://reactrouter.com/api/components/Await#await) during local development we recommend [localhost based development](https://shopify.dev/docs/apps/build/cli-for-apps/networking-options#localhost-based-development).

### "nbf" claim timestamp check failed

This is because a JWT token is expired. If you are consistently getting this error, it could be that the clock on your machine is not in sync with the server. To fix this ensure you have enabled "Set time and date automatically" in the "Date and Time" settings on your computer.

### Using MongoDB and Prisma

If you choose to use MongoDB with Prisma, there are some gotchas in Prisma's MongoDB support to be aware of. Please see the [Prisma SessionStorage README](https://www.npmjs.com/package/@shopify/shopify-app-session-storage-prisma#mongodb).

### Unable to require(`C:\...\query_engine-windows.dll.node`).

Unable to require(`C:\...\query_engine-windows.dll.node`).
The Prisma engines do not seem to be compatible with your system.

query_engine-windows.dll.node is not a valid Win32 application.

**Fix:** Set the environment variable:

```shell
PRISMA_CLIENT_ENGINE_TYPE=binary
```

This forces Prisma to use the binary engine mode, which runs the query engine as a separate process and can work via emulation on Windows ARM64.

## Resources

React Router:

- [React Router docs](https://reactrouter.com/home)

Shopify:

- [Intro to Shopify apps](https://shopify.dev/docs/apps/getting-started)
- [Shopify App React Router docs](https://shopify.dev/docs/api/shopify-app-react-router)
- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli)
- [Shopify App Bridge](https://shopify.dev/docs/api/app-bridge-library).
- [Polaris Web Components](https://shopify.dev/docs/api/app-home/polaris-web-components).
- [App extensions](https://shopify.dev/docs/apps/app-extensions/list)
- [Shopify Functions](https://shopify.dev/docs/api/functions)

Internationalization:

- [Internationalizing your app](https://shopify.dev/docs/apps/best-practices/internationalization/getting-started)