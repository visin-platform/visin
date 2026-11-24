import { Schema, model } from 'mongoose';

/**
 * What the provider charges, entered by an administrator, so the usage page can turn tokens into money: one
 * currency, and a price per million input and output tokens for each model. Providers return no price with an
 * answer, and prices change, so nothing here is built in.
 */
const pricingSchema = new Schema(
  {
    _id: { type: String, required: true },
    currency: { type: String, default: 'USD' },
    entries: {
      type: [
        new Schema(
          {
            provider: { type: String, enum: ['anthropic', 'openai'], required: true },
            model: { type: String, required: true },
            inputPerMillion: { type: Number, required: true, min: 0 },
            cacheReadPerMillion: { type: Number, min: 0 },
            cacheWritePerMillion: { type: Number, min: 0 },
            outputPerMillion: { type: Number, required: true, min: 0 },
            // Typed by an administrator, or fetched from the price list when they asked for a refresh.
            source: { type: String, enum: ['manual', 'fetched'], default: 'manual' },
            fetchedAt: { type: Date, default: null }
          },
          { _id: false }
        )
      ],
      default: []
    },
    updatedBy: String
  },
  { timestamps: true }
);
export const Pricing = model('ChatPricing', pricingSchema);
